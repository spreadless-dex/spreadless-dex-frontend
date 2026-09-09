// Spreadless Soroban deployment — TESTNET.
//
// These are testnet values and CHANGE whenever the contracts are redeployed.
// The contract team's source of truth is `deployments/testnet.json` in the
// contracts repo; keep this file in sync with it. Everything below is from the
// 2026-09-05 deployment.
//
// That file also ships as `deployments` from `@spreadless-dex/sdk`, which this
// app is now on (0.1.0). The values below are still written out by hand: the
// SDK's copy is the deployment record, this file is what the UI needs from it,
// and the two differ on purpose (relabelled symbols, families, the dropped
// XCR). Cross-check against `deployments.testnet` when the contracts move.
//
// Getting onto 0.1.0 took a resolution fix, not a new publish. The 0.1.0
// bundle carries the new pool spec, whose 12-input constructor exceeds the
// 10-input cap in the XDR of stellar-base 14 ("saw 12 length VarArray, max
// allowed is 10"), and the Client constructor parses that spec, so every pool
// read fails there. stellar-base 15 lifts the cap to 2^31-1. The SDK asks for
// `@stellar/stellar-sdk: ^14.5.0`, which npm resolved to 14.6.1 and so to
// base 14; the `overrides` entry in package.json lifts that one dependency to
// 15.1.0. It is scoped to @spreadless-dex/sdk, because the wallets kit
// resolves its own stellar-sdk 16 and is deliberately left alone.
//
// For pool operations, do NOT assume this token order. Read it live with
// `get_tokens()`. The lists below are used by the faucet (which needs fixed
// addresses to mint), by the pool builder's asset picker, and for display
// metadata.

export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const RPC_URL = "https://soroban-testnet.stellar.org";
// Classic-layer endpoint. Trustlines live on the classic account, not in
// Soroban, so changing one is a classic tx and goes through Horizon.
export const HORIZON_URL = "https://horizon-testnet.stellar.org";

/** A classic Stellar asset, as it appears in a trustline. */
export interface ClassicAsset {
  code: string;
  issuer: string;
}

export const POOL_CONTRACT_ID =
  "CCAD3EH4P74PVYL3IC6ND7RSV6NYYOMUMNKRNVBJYOVIZP7Z2QS5XTSN";

// THE ROUTER, deployed 2026-09-05 at
// CA4VB4SJQAPWBRTMEHCTX7GZ7KC2DGS7PXV6BEZUI3WUOKRGOQ7VCV6M.
//
// Tranche 2 drafted D1 (Factory) and D2 (Router) as two contracts. They
// shipped as one: it deploys pools (`create_pool`), registers each under a
// numeric id (`pool_at`, `next_pool_id`), executes atomic multi-hop swaps
// (`swap_exact_in`), and is the immutable `protocol_controller` of every pool
// it creates. Both constants below take that same address once wired.
//
// FACTORY_CONTRACT_ID is now set, and it took no new package. The Router
// carries its own spec in its deployed WASM, and `contract.Client.from()`
// reads it off the network, so router.ts has a full client without a generated
// binding; the interface there is that spec, written down. `create_pool` was
// simulated against it on 2026-09-09 and builds a pool in one call.
//
// ROUTER_CONTRACT_ID takes the same address, now that routerContract.ts calls
// the method the contract actually has. It used to encode `route(user,
// recipient, token_in, amount_in, token_out, min_out, deadline, hops)` with
// each hop keyed by pool *address*; the contract has `swap_exact_in(to,
// token_in, path, amount_in, min_out)` where a hop is `{pool_id: u32,
// token_out: address}`, with no recipient and no deadline.
//
// The live pool above predates the Router: it carries no pool id and no
// protocol_controller, so it is not registered and `swap_exact_in` can never
// reach it. It stays in the graph as a single hop, which needs no Router at
// all, and routeBlocker() refuses it as a *leg*. Routing needs pools created
// through `create_pool`, which is exactly what the builder now makes.
export const FACTORY_CONTRACT_ID: string | null =
  "CA4VB4SJQAPWBRTMEHCTX7GZ7KC2DGS7PXV6BEZUI3WUOKRGOQ7VCV6M";

// OWNERSHIP HANDOVER: the address a creator can hand a pool to when they no
// longer want to run it themselves ("give it back to Spreadless"). The pool
// page offers it as the first option in the transfer dialog; while null that
// option is listed as "Soon" and only a custom address can be entered.
//
// This is now a narrower role than it was. Ownership no longer decides who may
// move A: `amp_control` does, it is fixed in the constructor, and the owner has
// no say in it either way. What an owner still holds is the swap fee, the
// per-token caps, the LP supply cap and pause; the beneficiary is NOT among
// them, set_beneficiary authenticates the protocol_controller. See ARight in
// poolParams.ts for how the builder presents the two axes.
//
// Still null: the address is a team decision, not a deployment value, and it
// does not appear in `deployments/testnet.json`. Nothing is blocked by that
// any more, since pool creation no longer hands ownership anywhere; while it
// is null the pool page's transfer dialog lists "Spreadless" as "Soon" and
// only a custom address can be entered. PROTOCOL_CONTROLLER below is a
// different address and a different role.
export const PROTOCOL_OWNER: string | null = null;

// The pool's immutable `protocol_controller`, a constructor argument since
// 2026-09-05 and the Router's own address. Two powers hang off it, neither of
// them the owner's: ramping A on a pool built as `ProtocolManaged`, and the
// protocol-side lane of `set_protocol_fee` and `protocol_pause`.
//
// The same address as the two constants around it, and deliberately its own
// constant: this one is not a switch but a value written into a new pool, and
// it must be this address, because the Router makes itself the
// protocol_controller of every pool it creates, so a pool deployed directly
// through the fallback path has to name the same one or it would answer to
// nobody.
export const PROTOCOL_CONTROLLER = "CA4VB4SJQAPWBRTMEHCTX7GZ7KC2DGS7PXV6BEZUI3WUOKRGOQ7VCV6M";

// The Router again, as the swap path sees it, and the switch that lets a
// multi-hop route be signed. Without it a route can still be *quoted* (each leg
// simulates fine on its own pool) but never signed: there would be no single
// transaction holding the intermediate token, so a failing second leg would
// leave the user holding it.
//
// Set on 2026-09-09, after routerContract.ts was rewritten onto `swap_exact_in`
// and the encoding was checked against the deployed contract: a path naming an
// unregistered id simulates to #3 PoolNotRegistered and an empty one to #5
// EmptySwapPath, which is the contract reaching its own logic rather than
// rejecting the arguments. Nothing was signed to establish that. What has not
// been exercised is a route that *succeeds*, because the registry is still
// empty; the first pool built through the builder is what will do it.
export const ROUTER_CONTRACT_ID: string | null =
  "CA4VB4SJQAPWBRTMEHCTX7GZ7KC2DGS7PXV6BEZUI3WUOKRGOQ7VCV6M";

// POOL CREATION without the Router: the pool contract's WASM hash as installed
// on testnet. Setting it makes createBackend() return "deploy", and the builder
// deploys a pool straight through the SDK's Client.deploy() instead of asking
// the Router to. It works, and it was the live path for exactly one commit.
//
// Back to null, because the Router is wired and does it better. A pool deployed
// directly is real but unregistered: no pool id, so `swap_exact_in` cannot
// reach it and it is invisible to anyone whose browser did not create it. The
// contract README is explicit that new pools belong to the Router.
//
// The path stays in factory.ts as a fallback for a Router outage or a testnet
// where only the pool WASM is installed. Fill this in and the builder uses it;
// it is config, not dead code. If it is ever filled in again, cross-check it
// against the Router's own `get_pool_wasm_hash()` first: the two matched
// exactly when this was verified on 2026-09-09.
export const POOL_WASM_HASH: string | null = null;

// POOL CREATION — the protocol's fee beneficiary, the same for every pool.
// The fee split is protocol policy, not a creator's choice, and deploying a
// pool earns no share of it: the deployer is the owner, nothing more. Null
// until the multisig address is handed over; the builder then falls back to
// the deployer, which in practice only happens in demo mode.
//
// Going through `create_pool` this becomes moot: the router copies its own
// defaults into each new pool, today a 33% share paid to the deployer address
// GBQNJHJJRTKU43GOW34BQXLMTRZFOZERDGQPBUZGXTJK3HQEEDXXL73B, which is not yet a
// multisig. PROTOCOL_SHARE_PCT in poolParams.ts is display-only from then on.
export const PROTOCOL_BENEFICIARY: string | null = null;

/**
 * What an asset tracks. A StableSwap pool only holds together while its assets
 * trade near 1:1 with each other, so the family is also the boundary of a
 * pool: USD stables with USD stables, EUR with EUR, and a native asset only
 * with wrapped versions of itself (BTC with wBTC, never with ETH and never
 * with a stablecoin). The builder enforces this, see draftFamily() and familyConflict() in
 * poolParams.ts.
 */
export type AssetFamily = "USD" | "EUR" | "BTC" | "ETH" | "XLM" | "XRP";

export interface FamilyInfo {
  /** Heading over the family's chips in the pool builder. */
  label: string;
  /** How the family reads inside a sentence: "a USD stable", "BTC". */
  noun: string;
}

export const FAMILIES: Record<AssetFamily, FamilyInfo> = {
  USD: { label: "USD stables", noun: "a USD stable" },
  EUR: { label: "EUR stables", noun: "a EUR stable" },
  BTC: { label: "Bitcoin", noun: "BTC" },
  ETH: { label: "Ether", noun: "ETH" },
  XLM: { label: "Lumens", noun: "XLM" },
  XRP: { label: "XRP", noun: "XRP" },
};

/** Every family, in the order the builder lists them. */
export const FAMILY_ORDER: AssetFamily[] = ["USD", "EUR", "BTC", "ETH", "XLM", "XRP"];

export interface TokenInfo {
  symbol: string;
  contractId: string;
  decimals: number;
  /** Open-mint test tokens let anyone call mint(to, amount). SACs do not. */
  openMint: boolean;
  /**
   * Set only for Stellar Asset Contracts — a SAC wraps a *classic* asset, and a
   * classic asset can only be held by an account that has a trustline for it.
   * Without one, every transfer of this token into the user's account fails, so
   * the UI has to offer the trustline first (see trustline.ts).
   *
   * Native Soroban tokens have no classic side and no trustline: leave unset.
   *
   * Verifiable: Asset(code, issuer).contractId(NETWORK_PASSPHRASE) must equal
   * this token's contractId.
   */
  classicAsset?: ClassicAsset;
  /**
   * What the asset tracks. Wrapped assets carry the family of the thing they
   * wrap, so wBTC is "BTC" and pools with BTC. A pool may only hold one
   * family; the builder blocks anything else.
   */
  family: AssetFamily;
}

// The four tokens of the live pool at POOL_CONTRACT_ID, in its canonical
// token order. They are deployed as sDAI/sUSDT/SUSD/sUSDC under the hood; the
// first two are relabelled here because symbol is display-only (see metaFor()
// in pool.ts and the `.symbol` usages, which are UI labels, never on-chain
// lookup keys).
//
// The 2026-09-05 catalog below ships real tokens and collides with neither
// name, so the relabel is now a naming choice rather than a stopgap. Undoing
// it is a copy change, not a config change: "USDx" and "PYUSD" are written
// into the docs pages, PoolCard, TokenSelectModal, mockPoolStats and the demo
// vaults in demo.ts.
export const POOL_TOKENS: TokenInfo[] = [
  {
    symbol: "USDx",
    contractId: "CBXN4CMLFVDNVFSGNXFGP5EWI77ISC5KH5UXSDBQETZCJHYHA3KEP4JJ",
    decimals: 7,
    openMint: true,
    family: "USD",
  },
  {
    symbol: "PYUSD",
    contractId: "CB2NS6KYG5ZBHHVKXCHYWLRRH4AKFXNWRYNSQTKNFW23CAY4SGSQVG75",
    decimals: 7,
    openMint: true,
    family: "USD",
  },
  {
    symbol: "SUSD",
    contractId: "CDDE66QMXWVUVEHLA5IRUJBHPJK3RFH6JIXCIJ5S6HOAXAPYR2AIZUWD",
    decimals: 7,
    openMint: false, // Stellar Asset Contract — only the issuer can mint.
    family: "USD",
    classicAsset: {
      code: "SUSD",
      issuer: "GCYFVS3J6JNJLJZ6JVPFCW7IGILIWEFGFPUAFBOBR4PQARR6OIBZHOAU",
    },
  },
  {
    symbol: "sUSDC",
    contractId: "CDKFYHC3EPRCZY4DIMCIBQ3PO5QPD6KZFFXNMLS4XENY2QNTZN2KLMRM",
    decimals: 7,
    openMint: true,
    family: "USD",
  },
];

// The token catalog from the 2026-09-05 deployment: what the pool builder can
// build a pool out of. None of these sits in a pool yet.
//
// Each catalog token was deployed twice, as a native Soroban token and as a
// SAC wrapping a classic asset of the same name. The Soroban variant is the
// one listed here: it is open-mint, so the faucet can hand it out, and it
// needs no trustline. The SAC addresses are in `@spreadless-dex/sdk/deployments`
// under the same token's `sac` key; nothing picks them yet, and a token can
// only be listed once because demo.ts and the picker key on symbol.
//
// The deployment's own `category` is coarser than a pool may be: it files BTC,
// ETH, XLM and XRP together as "crypto", while a pool may hold only one of
// them. The family below is the split the builder enforces.
//
// XCR is in the deployment but deliberately not here: Lucas flagged it as
// wrong on 08.09.2026. Re-add it only if the contract team confirms it.
const CATALOG_TOKENS: TokenInfo[] = [
  { symbol: "abUSDC", contractId: "CCCF52BTMLYFGCUZUKV67QUE7DHP3MHVIN7G7UMCBI2TN5R7FB7EG5YT", decimals: 7, openMint: true, family: "USD" },
  { symbol: "apUSDC", contractId: "CABMCMK4VDPYZYJAHTUSZJMEGNYSE26DNZUV5RDULZP3QOUK3RCVUW4F", decimals: 7, openMint: true, family: "USD" },
  { symbol: "BnUSD", contractId: "CA5OEH6LG73HQOGD7SOP5NQSKU3IFRUQSJM453ZUYZO5AKD2BUXU4IHR", decimals: 7, openMint: true, family: "USD" },
  { symbol: "oUSD", contractId: "CBG6LSYHUNBEYRUAEREKS6D7TH752S4OIKROPFN4ZT6K5RJ2X5OIDCSG", decimals: 7, openMint: true, family: "USD" },
  { symbol: "POM", contractId: "CBP4VFKL7TJDODDBYLOX5OZDDL6QZBHD4LFAFNYNOAH6LKT5NCI4NM64", decimals: 7, openMint: true, family: "USD" },
  { symbol: "RLUSD", contractId: "CBUNEWTFCY7LSWZOZECPDSAODO7EGH4DYBZS55EX7JRPOEFHMF2XJW2E", decimals: 7, openMint: true, family: "USD" },
  { symbol: "USDC", contractId: "CD2Z4HLXN6726L7B5NYYK2YELFV4EVWLAT5W4KRJHL73IERVXXVR22ZO", decimals: 7, openMint: true, family: "USD" },
  { symbol: "USDGLO", contractId: "CB7BFIYHMDVTF7PYBZH3AQE66TR7LISVVXGWZ6ELI44BCAPOYVYK4DH4", decimals: 7, openMint: true, family: "USD" },
  { symbol: "USDM", contractId: "CDDT6MUPQ2RCC2TBNIJYRV3HC2BPFH4GC66Z36JCJQE4YCCIR55H7H3U", decimals: 7, openMint: true, family: "USD" },
  { symbol: "USDM1", contractId: "CBP7QXKBROFKJWGEF3ZQ5S3ASALEVI3LSCYZ4EYSTS5I3EVWVHD3LSGT", decimals: 7, openMint: true, family: "USD" },
  { symbol: "USDP", contractId: "CD6VUH76JBC34P42GUH4BHD4UCKA6TMK3FXBXQC5QBG5SS5GRJWQNVAC", decimals: 7, openMint: true, family: "USD" },
  { symbol: "USDT0", contractId: "CBBYP4J5JXO7ZTRZO4RU3T4MYO53J2YHRWV2FJIVJDQXXMOHJPUKSHVJ", decimals: 7, openMint: true, family: "USD" },
  { symbol: "yUSDC", contractId: "CCQ4KSBII5J3WPNIW6H4SRG4NDYMXL3Q64BFUO6H7WGEU3D45J24BMQO", decimals: 7, openMint: true, family: "USD" },
  { symbol: "ZUSD", contractId: "CD5LGJIXSRRVCLEXUEYNDC7KLDJABJFZ6QXMYXA5VIOHJVRA3BBKY2ID", decimals: 7, openMint: true, family: "USD" },
  { symbol: "EURC", contractId: "CACQCZVWAOVFUHSAE7RTUNKEGGN4YVPBVEJ47OOYLHOC2NCMBH36RRFA", decimals: 7, openMint: true, family: "EUR" },
  { symbol: "EURx", contractId: "CCJG4Y6FQTDZCCACSD3YQAYQCQLTRWLNC7XUURHQDQJ2I3JFXIOAIQZR", decimals: 7, openMint: true, family: "EUR" },
  { symbol: "BTC", contractId: "CDWEAOXHL6FRJNUMHRXWWJ2QTQAZHSMITVQWV33G6QXCMDUQET4WIEL6", decimals: 7, openMint: true, family: "BTC" },
  { symbol: "SolvBTC", contractId: "CCFMQ4452IA6M2Q4YNGRKACJY3R5UPIYI5XUU56WF5MLJF75QHDA3RDL", decimals: 7, openMint: true, family: "BTC" },
  { symbol: "xSolvBTC", contractId: "CDFNZVN3ODKWLMSU3SGAZOCRJABWLZDUSUO4LUKW4FS2XL63RGZFMUD4", decimals: 7, openMint: true, family: "BTC" },
  { symbol: "yBTC", contractId: "CAOV3NBZP637QXNM3ZVXI3Z77PHZWIQGDFDACYOAGCFFKLW5ORQ4JNBX", decimals: 7, openMint: true, family: "BTC" },
  { symbol: "ETH", contractId: "CAX2IOWT3LXA52Y7WXV6VMULGZ46I545QSNW2DTSVIISIMMIFB76KXMQ", decimals: 7, openMint: true, family: "ETH" },
  { symbol: "yETH", contractId: "CDOWWMOCQRT6UTHHNSNBHWM5VET5KPLOJLUUQ5II57WJRKAYVYDMM4YN", decimals: 7, openMint: true, family: "ETH" },
  { symbol: "XLM", contractId: "CBWAT5MWPEZVZQAXH5NHGGF3FKUY62GQSQVAEUCGPRBPHSF45QYAU7AX", decimals: 7, openMint: true, family: "XLM" },
  { symbol: "yXLM", contractId: "CBUW6BKN2ADRZBCAP6HWEID6VAADZCQOUETYSIPKXL5G3EATPS5TXODM", decimals: 7, openMint: true, family: "XLM" },
  { symbol: "XRP", contractId: "CAUBDT5XVJF4C3XTLIZPFZHZ6JG2N3UHUYBHPJNGQHBBQUS6KHDTC4Q7", decimals: 7, openMint: true, family: "XRP" },
  { symbol: "yXRP", contractId: "CAYVBFOJZ4XMFJ2H6JRSPTEQJEKZQMKQATSI5OHNEAVHE4ORD5AWD4WN", decimals: 7, openMint: true, family: "XRP" },
];

/** Everything the app knows by address: the live pool's tokens, then the catalog. */
export const TOKENS: TokenInfo[] = [...POOL_TOKENS, ...CATALOG_TOKENS];

/** Tokens the faucet can mint (open-mint test tokens only). */
export const FAUCET_TOKENS = TOKENS.filter((t) => t.openMint);

/** Stellar Expert link for a submitted transaction, on whichever network this app targets. */
export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

/** Stellar Expert link for a contract (token or pool) on this network. */
export function explorerAccountUrl(address: string): string {
  return `https://stellar.expert/explorer/testnet/account/${address}`;
}

export function explorerContractUrl(contractId: string): string {
  return `https://stellar.expert/explorer/testnet/contract/${contractId}`;
}

// Privy app id for the email/Google login, inlined at build time from
// PUBLIC_PRIVY_APP_ID. While it is empty the login chooser still lists the
// email option, but marked "Soon": tapping it shows a short note instead of
// opening Privy. The id itself is public (it ships in the bundle either way);
// what protects the app is the allowed-origins list in the Privy dashboard.
// The Privy app SECRET is server-side only and must never appear in this repo.
export const PRIVY_APP_ID: string = import.meta.env.PUBLIC_PRIVY_APP_ID ?? "";

// WalletConnect (Reown Cloud) project id. Needed so Freighter's own mobile
// in-app browser can connect at all: Freighter injects `window.stellar =
// { provider: "freighter", platform: "mobile" }` there, and the kit's
// FreighterModule deliberately reports itself unavailable in that case (it
// can't drive the extension-style API from inside Freighter's browser) —
// the kit's own comment says to use WalletConnect instead. Without a
// project id the WalletConnectModule is left out of the kit entirely and
// Freighter's mobile browser has no working connect path (every other
// listed wallet is desktop-extension-only).
//
// PUBLIC_WALLETCONNECT_PROJECT_ID (a build-time inline) overrides the
// literal below; the literal is the real project id for this app so a
// build with the var unset — or set wrong — still gets a working WC path.
// It is public by design (it ships in the client bundle either way); what
// gates access is the allowed-domains list on the Reown project. Get one
// free at https://cloud.reown.com.
export const WALLETCONNECT_PROJECT_ID: string =
  import.meta.env.PUBLIC_WALLETCONNECT_PROJECT_ID ||
  "14ffe7bd71888d62cfc55f01c0818dcc";
