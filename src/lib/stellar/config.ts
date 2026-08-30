// Spreadless Soroban deployment — TESTNET.
//
// These are testnet values and CHANGE whenever the pool is redeployed. The
// contract team treats `deployments/testnet.json` in the contract repo as the
// source of truth; keep this file in sync with it.
//
// For pool operations, do NOT assume this token order — read it live with
// `get_tokens()`. This list is used by the faucet (which needs fixed addresses
// to mint) and for display metadata.

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

// TRANCHE 2 / D1 — the Vault Factory. While this is null the app runs in
// single-vault mode: the registry reports POOL_CONTRACT_ID and the router finds
// exactly one route, which is today's behaviour. Setting it switches the whole
// swap path onto the registry without any other change here.
export const FACTORY_CONTRACT_ID: string | null = null;

// TRANCHE 2 / D2 — the atomic multi-hop Router. Until this is deployed a
// multi-hop route can be *quoted* (each leg simulates fine on its own pool) but
// must never be signed: without the Router there is no single transaction that
// holds the intermediate token, so a failing second leg would leave the user
// holding it. The swap CTA enforces this.
export const ROUTER_CONTRACT_ID: string | null = null;

export interface TokenInfo {
  /** Canonical index in the pool's token order (from get_tokens()). */
  index: number;
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
}

// TRANCHE 2 RELABEL: the contract's index-0/1 tokens are still deployed as
// "sDAI"/"sUSDT" under the hood (same contractId, same actual asset) — the
// contract engineer hasn't cut new tranche-2 tokens yet. Symbol here is
// display-only (see metaFor() in pool.ts and the `.symbol` usages, which
// are UI labels, never on-chain lookup keys), so relabeling is safe until
// the SDK is updated with the real tranche-2 token set.
export const TOKENS: TokenInfo[] = [
  {
    index: 0,
    symbol: "USDx",
    contractId: "CBXN4CMLFVDNVFSGNXFGP5EWI77ISC5KH5UXSDBQETZCJHYHA3KEP4JJ",
    decimals: 7,
    openMint: true,
  },
  {
    index: 1,
    symbol: "PYUSD",
    contractId: "CB2NS6KYG5ZBHHVKXCHYWLRRH4AKFXNWRYNSQTKNFW23CAY4SGSQVG75",
    decimals: 7,
    openMint: true,
  },
  {
    index: 2,
    symbol: "SUSD",
    contractId: "CDDE66QMXWVUVEHLA5IRUJBHPJK3RFH6JIXCIJ5S6HOAXAPYR2AIZUWD",
    decimals: 7,
    openMint: false, // Stellar Asset Contract — only the issuer can mint.
    classicAsset: {
      code: "SUSD",
      issuer: "GCYFVS3J6JNJLJZ6JVPFCW7IGILIWEFGFPUAFBOBR4PQARR6OIBZHOAU",
    },
  },
  {
    index: 3,
    symbol: "sUSDC",
    contractId: "CDKFYHC3EPRCZY4DIMCIBQ3PO5QPD6KZFFXNMLS4XENY2QNTZN2KLMRM",
    decimals: 7,
    openMint: true,
  },
];

/** Tokens the faucet can mint (open-mint test tokens only). */
export const FAUCET_TOKENS = TOKENS.filter((t) => t.openMint);

/** Stellar Expert link for a submitted transaction, on whichever network this app targets. */
export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

/** Stellar Expert link for a contract (token or pool) on this network. */
export function explorerContractUrl(contractId: string): string {
  return `https://stellar.expert/explorer/testnet/contract/${contractId}`;
}
