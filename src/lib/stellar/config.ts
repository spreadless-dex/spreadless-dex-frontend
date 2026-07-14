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

export const POOL_CONTRACT_ID =
  "CCAD3EH4P74PVYL3IC6ND7RSV6NYYOMUMNKRNVBJYOVIZP7Z2QS5XTSN";

export interface TokenInfo {
  /** Canonical index in the pool's token order (from get_tokens()). */
  index: number;
  symbol: string;
  contractId: string;
  decimals: number;
  /** Open-mint test tokens let anyone call mint(to, amount). SACs do not. */
  openMint: boolean;
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
