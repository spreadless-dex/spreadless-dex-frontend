// What the chain says about the market right now, read on the server for
// /api/prices and /api/stats. One snapshot serves both and every visitor, so the
// landing page does not cost each of them a scan of the event log.
//
// Pool creation is permissionless, so a pool only counts here when every token
// in it is one this app knows. Otherwise anyone could inflate the TVL with a
// token of their own.

import { Client } from "@spreadless-dex/sdk";
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { FACTORY_CONTRACT_ID, NETWORK, NETWORK_PASSPHRASE, POOL_CONTRACT_ID, TOKENS } from "../stellar/config";
import { listPoolIds, routerClient } from "../stellar/routerClient";
import { spotPrices } from "../stellar/spotPrice";
import { fromRawUnits } from "../stellar/units";

/** How long one snapshot serves. Also the responses' max-age. */
export const MARKET_TTL_SECONDS = 60;

// The RPC keeps events for about seven days, so this is the longest window that
// can be answered without an indexer.
const VOLUME_WINDOW_DAYS = 7;
const LEDGERS_PER_DAY = 17_280;

// getEvents takes at most 5 filters of 5 contracts each, and scans about 10,000
// ledgers per call, so a week is 13 or so pages, most of them empty.
const CONTRACTS_PER_FILTER = 5;
const FILTERS_PER_CALL = 5;
const MAX_EVENT_PAGES = 40;

const FEE_PRECISION = 1_000_000_000;

export interface MarketToken {
  symbol: string;
  address: string;
  reserve: number;
  /** Mid price in the pool's quote token, before the swap fee. */
  price: number;
}

export interface MarketPool {
  address: string;
  /** The token prices are quoted in: USDC where the pool holds it, else its first token. */
  quote: { symbol: string; address: string };
  tokens: MarketToken[];
  /** Every token is USD-pegged, so its reserves and volume add up in dollars. */
  usd: boolean;
  tvl: number;
  /** Swapped over the window, measured on the way in. */
  volume: number;
  /** The LPs' share of the window's fees, annualized, in percent. */
  apy: number;
}

export interface Market {
  network: string;
  updatedAt: string;
  volumeWindowDays: number;
  pools: MarketPool[];
}

const known = (address: string) => TOKENS.find((t) => t.contractId === address);

async function poolAddresses(rpcUrl: string): Promise<string[]> {
  const addresses = new Set([POOL_CONTRACT_ID]);
  if (FACTORY_CONTRACT_ID) {
    const router = await routerClient(undefined, undefined, rpcUrl);
    const ids = await listPoolIds(router);
    const found = await Promise.all(ids.map((id) => router.pool_at({ id }).then((t) => t.result)));
    for (const address of found) if (address) addresses.add(address);
  }
  return [...addresses];
}

type PoolRead = Omit<MarketPool, "volume" | "apy"> & { lpShare: number };

async function readPool(address: string, rpcUrl: string): Promise<PoolRead | null> {
  const pool = new Client({ contractId: address, rpcUrl, networkPassphrase: NETWORK_PASSPHRASE });
  const addresses = (await pool.get_tokens()).result;
  const metas = addresses.map(known);
  if (metas.some((m) => !m)) return null;

  // Testnet pools from before the fee views simply lack them, and answer with a
  // failed simulation. Only the APY depends on them, so that one reads as zero.
  // Everything else stays strict: an outage must not pass for an empty pool.
  const [reserves, amp, swapFee, protocolFee] = await Promise.all([
    pool.get_reserves().then((t) => t.result),
    pool.get_amp().then((t) => t.result),
    pool.get_swap_fee().then((t) => t.result).catch(() => 0n),
    pool.get_protocol_fee().then((t) => t.result).catch(() => 0n),
  ]);
  const balances = addresses.map((_, i) => Number(fromRawUnits(reserves[i] ?? 0n, metas[i]!.decimals)));
  // An unfunded pool has no price yet.
  if (balances.some((b) => b <= 0)) return null;

  const quoteIndex = Math.max(0, metas.findIndex((m) => m!.symbol === "USDC"));
  const prices = spotPrices(balances, amp);
  const fee = Number(swapFee) / FEE_PRECISION;
  return {
    address,
    quote: { symbol: metas[quoteIndex]!.symbol, address: addresses[quoteIndex] },
    tokens: addresses.map((token, i) => ({
      symbol: metas[i]!.symbol,
      address: token,
      reserve: balances[i],
      price: prices[i] / prices[quoteIndex],
    })),
    usd: metas.every((m) => m!.family === "USD"),
    tvl: balances.reduce((a, b) => a + b, 0),
    lpShare: fee * (1 - Number(protocolFee) / FEE_PRECISION),
  };
}

/** Swap volume per pool over the window, in human units of what went in. */
async function readVolumes(addresses: string[], rpcUrl: string): Promise<Map<string, number>> {
  const volumes = new Map<string, number>();
  if (!addresses.length) return volumes;
  const server = new rpc.Server(rpcUrl);
  // The RPC's own retention sets the floor, and it moves as ledgers close, so
  // start a little above it.
  const { latestLedger, oldestLedger } = await server.getHealth();
  const firstLedger = Math.max(latestLedger - VOLUME_WINDOW_DAYS * LEDGERS_PER_DAY, oldestLedger + 10);

  const filters: rpc.Api.EventFilter[] = [];
  for (let i = 0; i < addresses.length; i += CONTRACTS_PER_FILTER) {
    filters.push({ type: "contract", contractIds: addresses.slice(i, i + CONTRACTS_PER_FILTER) });
  }

  for (let i = 0; i < filters.length; i += FILTERS_PER_CALL) {
    const batch = filters.slice(i, i + FILTERS_PER_CALL);
    let cursor: string | undefined;
    let startLedger: number | undefined = firstLedger;
    // An empty page with a cursor only means this stretch had no events, so
    // stopping at the first one would report a quiet week for a busy pool.
    for (let page = 0; page < MAX_EVENT_PAGES; page++) {
      const res: rpc.Api.GetEventsResponse = await server.getEvents(
        cursor
          ? { cursor, filters: batch, limit: 200 }
          : { startLedger: startLedger as number, filters: batch, limit: 200 },
      );
      startLedger = undefined;
      for (const event of res.events) {
        if (scValToNative(event.topic[0]) !== "swap") continue;
        const swap = scValToNative(event.value) as { token_in: string; amount_in: bigint };
        const decimals = known(swap.token_in)?.decimals;
        if (decimals === undefined) continue;
        const address = String(event.contractId);
        volumes.set(address, (volumes.get(address) ?? 0) + Number(fromRawUnits(swap.amount_in, decimals)));
      }
      if (!res.cursor || res.cursor === cursor) break;
      cursor = res.cursor;
      // A cursor is a TOID: the ledger sits above bit 32.
      if (Number(BigInt(res.cursor.split("-")[0]) >> 32n) >= res.latestLedger - 1) break;
    }
  }
  return volumes;
}

async function loadMarket(rpcUrl: string): Promise<Market> {
  const addresses = await poolAddresses(rpcUrl);
  const reads = await Promise.all(addresses.map((a) => readPool(a, rpcUrl)));
  const pools = reads.filter((p): p is PoolRead => p !== null);
  const volumes = await readVolumes(pools.map((p) => p.address), rpcUrl);

  return {
    network: NETWORK,
    updatedAt: new Date().toISOString(),
    volumeWindowDays: VOLUME_WINDOW_DAYS,
    pools: pools.map(({ lpShare, ...pool }) => {
      const volume = volumes.get(pool.address) ?? 0;
      return { ...pool, volume, apy: ((volume * lpShare) / pool.tvl) * (365 / VOLUME_WINDOW_DAYS) * 100 };
    }),
  };
}

// A Worker can't await a promise that another request started, so only a
// finished snapshot is shared. Requests that race a refresh each do their own.
let cached: { at: number; market: Market } | null = null;

export async function readMarket(rpcUrl: string): Promise<Market> {
  if (cached && Date.now() - cached.at < MARKET_TTL_SECONDS * 1000) return cached.market;
  const market = await loadMarket(rpcUrl);
  cached = { at: Date.now(), market };
  return market;
}

/** The landing page's figures. USD-pegged pools only: the rest don't add up in dollars. */
export function marketStats(market: Market) {
  const usd = market.pools.filter((p) => p.usd);
  return {
    network: market.network,
    updatedAt: market.updatedAt,
    volumeWindowDays: market.volumeWindowDays,
    tvl: usd.reduce((sum, p) => sum + p.tvl, 0),
    volume: usd.reduce((sum, p) => sum + p.volume, 0),
    stablecoins: new Set(usd.flatMap((p) => p.tokens.map((t) => t.address))).size,
    pools: usd.length,
    highestApy: Math.max(0, ...usd.map((p) => p.apy)),
  };
}
