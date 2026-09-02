// Privy → Stellar glue, kept free of React so it can be reasoned about (and
// tested) like any other lib. Ported from win-trader's privyStellar.ts.
//
// Privy's Stellar support is "Tier 2": the embedded wallet is a plain Ed25519
// keypair with a normal G… address, and the SDK exposes exactly one signing
// primitive: sign a raw 32-byte hash on the wallet's curve (useSignRawHash).
// Everything Stellar-shaped therefore lives here, producing the same result
// shapes the Stellar Wallets Kit returns so the rest of the app can't tell the
// two backends apart.
//
//  - transactions: Ed25519 over the envelope hash, attached via addSignature
//    (which verifies before it accepts, so a wrong passphrase or address fails
//    here, not at submit time).
//  - auth entries: Ed25519 over SHA-256(HashIdPreimage XDR). That is exactly
//    what stellar-base's authorizeEntry expects back from a signer callback,
//    and what the SDK's Client feeds through signAuthEntry.

import { TransactionBuilder } from "@stellar/stellar-base";
import { fetchAccount } from "./horizon";

/** Shape of Privy's useSignRawHash callback, narrowed to what we consume. */
export type RawHashSigner = (hashHex: `0x${string}`) => Promise<`0x${string}`>;

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return `0x${out}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("odd-length hex string");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("invalid hex string");
    out[i] = byte;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Sign a transaction envelope XDR with a raw-hash signer. Returns the kit's
 * `{ signedTxXdr, signerAddress }` shape.
 */
export async function signTransactionXdr(
  xdr: string,
  networkPassphrase: string,
  address: string,
  signRawHash: RawHashSigner,
): Promise<{ signedTxXdr: string; signerAddress: string }> {
  const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const signatureHex = await signRawHash(bytesToHex(new Uint8Array(tx.hash())));
  tx.addSignature(address, bytesToBase64(hexToBytes(signatureHex)));
  return { signedTxXdr: tx.toXDR(), signerAddress: address };
}

/**
 * Sign a Soroban authorization entry preimage (base64 HashIdPreimage XDR).
 * Returns the kit's `{ signedAuthEntry, signerAddress }` shape, where
 * signedAuthEntry is the base64 Ed25519 signature over the preimage hash.
 */
export async function signAuthEntryXdr(
  preimageXdr: string,
  address: string,
  signRawHash: RawHashSigner,
): Promise<{ signedAuthEntry: string; signerAddress: string }> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", base64ToBytes(preimageXdr)),
  );
  const signatureHex = await signRawHash(bytesToHex(digest));
  return {
    signedAuthEntry: bytesToBase64(hexToBytes(signatureHex)),
    signerAddress: address,
  };
}

/* ----------------------------- account funding ----------------------------- */

// A freshly created keypair does not exist on the ledger until something pays
// its base reserve. Before that it can't even be a transaction source. On
// testnet Friendbot does this for free. Mainnet has deliberately no entry:
// funding there is a product decision for the mainnet phase.
const FRIENDBOT_URL = "https://friendbot.stellar.org/?addr=";

export type FundingResult = "already-funded" | "funded";

/**
 * Make sure `address` exists on the ledger, asking Friendbot to create it if
 * not. Idempotent: it checks first, so calling it on every login is fine.
 */
export async function ensureFunded(address: string): Promise<FundingResult> {
  if (await fetchAccount(address)) return "already-funded";

  const res = await fetch(FRIENDBOT_URL + encodeURIComponent(address));
  // Friendbot answers 400 for an already-funded account, a benign race when
  // two tabs log in at once. Anything else is a real failure.
  if (!res.ok && res.status !== 400) {
    throw new Error(`Friendbot failed: ${res.status}`);
  }

  // Friendbot's tx usually lands within a ledger (~5s); poll briefly so the
  // caller can flip the wallet to "ready" the moment the account is live.
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await fetchAccount(address)) return "funded";
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Friendbot accepted the request but the account never appeared");
}
