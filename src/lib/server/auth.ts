// Proof that a request comes from the wallet it names. The request is a JSON
// message; the wallet signs a transaction that carries the message's SHA-256,
// the way SEP-10 signs a login challenge. Every wallet can sign a
// transaction, while a message signature (SEP-53) is optional over
// WalletConnect and Freighter Mobile drops the session when asked for one.
//
// The transaction can never be submitted: its sequence number is 0, which no
// account on the network can have.

import { FeeBumpTransaction, Keypair, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";

export const SIGNED_APP = "spreadless-alerts";
/** A signature is good this long, so a leaked one can't be replayed later. */
const MAX_AGE_MS = 5 * 60 * 1000;

export interface SignedRequest {
  app: typeof SIGNED_APP;
  network: string;
  action: string;
  owner: string;
  ts: number;
  [field: string]: unknown;
}

/** SHA-256 of the message, hex: exactly the 64 bytes a manageData value can hold. */
export async function messageDigest(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(new TextEncoder().encode(message)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The signed request, or why it is refused. */
export async function verifySigned(
  message: string,
  signedTx: string,
  network: string,
  networkPassphrase: string,
  now = Date.now(),
): Promise<SignedRequest | string> {
  let body: Partial<SignedRequest>;
  try {
    body = JSON.parse(message);
  } catch {
    return "message is not JSON";
  }
  if (body?.app !== SIGNED_APP || body.network !== network) return "message is not for this app and network";
  if (typeof body.action !== "string") return "message has no action";
  if (typeof body.owner !== "string" || !StrKey.isValidEd25519PublicKey(body.owner)) return "owner must be a G… address";
  if (typeof body.ts !== "number" || Math.abs(now - body.ts) > MAX_AGE_MS) return "signature expired, sign again";

  let tx;
  try {
    tx = TransactionBuilder.fromXDR(signedTx, networkPassphrase);
  } catch {
    return "signed_tx is not a transaction for this network";
  }
  if (tx instanceof FeeBumpTransaction || tx.source !== body.owner || tx.sequence !== "0") {
    return "signed_tx must be the owner's sequence-0 transaction";
  }
  const op = tx.operations[0];
  if (
    tx.operations.length !== 1 ||
    op.type !== "manageData" ||
    op.name !== SIGNED_APP ||
    op.value?.toString() !== (await messageDigest(message))
  ) {
    return "signed_tx does not carry this message";
  }
  // The hash covers the network passphrase, so a testnet signature fails here on mainnet.
  const key = Keypair.fromPublicKey(body.owner);
  if (!tx.signatures.some((s) => key.verify(tx.hash(), s.signature()))) return "signature does not match owner";
  return body as SignedRequest;
}
