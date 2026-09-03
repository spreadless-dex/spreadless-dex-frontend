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

// OWNERSHIP HANDOVER: the address a creator can hand a pool to when they no
// longer want to run it themselves ("give it back to Spreadless"). The pool
// page offers it as the first option in the transfer dialog; while null that
// option is listed as "Soon" and only a custom address can be entered.
export const PROTOCOL_OWNER: string | null = null;

// TRANCHE 2 / D2 — the atomic multi-hop Router. Until this is deployed a
// multi-hop route can be *quoted* (each leg simulates fine on its own pool) but
// must never be signed: without the Router there is no single transaction that
// holds the intermediate token, so a failing second leg would leave the user
// holding it. The swap CTA enforces this.
export const ROUTER_CONTRACT_ID: string | null = null;

// POOL CREATION, before the Factory: the pool contract's WASM hash as
// installed on testnet. With it set, "Create pool" deploys a vault directly
// through the SDK's Client.deploy(); with both this and the Factory null the
// builder runs in demo mode (the pool is created locally, nothing is signed).
// Ask the contract team for the hash from deployments/testnet.json.
export const POOL_WASM_HASH: string | null = null;

// POOL CREATION — the protocol's fee beneficiary, the same for every pool.
// The fee split is protocol policy, not a creator's choice, and deploying a
// pool earns no share of it: the deployer is the owner, nothing more. Null
// until the multisig address is handed over; the builder then falls back to
// the deployer, which in practice only happens in demo mode.
export const PROTOCOL_BENEFICIARY: string | null = null;

/** What a stablecoin tracks. StableSwap only makes sense within one peg. */
export type Peg = "USD" | "EUR";

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
  /** Peg the asset tracks. Used to warn when a pool mixes pegs. */
  peg: Peg;
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
    peg: "USD",
  },
  {
    index: 1,
    symbol: "PYUSD",
    contractId: "CB2NS6KYG5ZBHHVKXCHYWLRRH4AKFXNWRYNSQTKNFW23CAY4SGSQVG75",
    decimals: 7,
    openMint: true,
    peg: "USD",
  },
  {
    index: 2,
    symbol: "SUSD",
    contractId: "CDDE66QMXWVUVEHLA5IRUJBHPJK3RFH6JIXCIJ5S6HOAXAPYR2AIZUWD",
    decimals: 7,
    openMint: false, // Stellar Asset Contract — only the issuer can mint.
    peg: "USD",
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
    peg: "USD",
  },
];

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
