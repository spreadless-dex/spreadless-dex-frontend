// Proof that a request comes from the wallet it names: the wallet signs the
// request itself, a JSON message, the SEP-53 way (Ed25519 over
// SHA-256("Stellar Signed Message:\n" + message)). The Wallets Kit's
// signMessage produces that, and so does privySigner.signMessageSep53.

import { Keypair, StrKey } from "@stellar/stellar-sdk";

export const SIGNED_APP = "spreadless-alerts";
const PREFIX = "Stellar Signed Message:\n";
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

export async function sep53Hash(message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(new TextEncoder().encode(PREFIX + message))));
}

/** Wallets hand the 64-byte signature back as base64, a few as hex. */
function decodeSignature(signature: string): Buffer | null {
  const bytes = /^[0-9a-f]{128}$/i.test(signature) ? Buffer.from(signature, "hex") : Buffer.from(signature, "base64");
  return bytes.length === 64 ? bytes : null;
}

/** The signed request, or why it is refused. */
export async function verifySigned(
  message: string,
  signature: string,
  network: string,
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
  const sig = decodeSignature(signature);
  if (!sig) return "signature is not 64 bytes";
  const hash = Buffer.from(await sep53Hash(message));
  if (!Keypair.fromPublicKey(body.owner).verify(hash, sig)) return "signature does not match owner";
  return body as SignedRequest;
}
