// Adding a trustline for a SAC-wrapped token.
//
// A Stellar Asset Contract wraps a *classic* asset, and classic assets follow
// the classic rule: an account can only hold one it has explicitly trusted. So
// a swap into SUSD, or a withdrawal paid out in SUSD, fails outright until the
// receiving account adds a trustline — and no Soroban call can fix that, because
// the trustline is a classic operation on the user's own account.
//
// The read side (does this account have it? what's the balance?) lives in
// horizon.ts; this module only handles the write, which needs the wallet.

import { HORIZON_URL, NETWORK_PASSPHRASE } from "./config";
import { classicAssetOf, fetchAccount } from "./horizon";
import { getWalletSigner } from "../../store/useAppStore";
import type { OnPhase } from "./types";

export { classicAssetOf, hasTrustline } from "./horizon";

/**
 * Adds the trustline for a SAC-wrapped token: a classic changeTrust, signed by
 * the connected wallet and submitted to Horizon. One-time per account per asset
 * — afterwards the token behaves like any other.
 */
export async function addTrustline(
  contractId: string,
  address: string,
  onPhase?: OnPhase,
): Promise<{ hash: string }> {
  const asset = classicAssetOf(contractId);
  if (!asset) throw new Error("This token doesn't use a trustline.");

  onPhase?.("preparing");
  // Dynamic, like every other Stellar import here: these packages touch browser
  // globals at module scope and break Astro's prerender if pulled into SSR.
  const { Account, Asset, BASE_FEE, Operation, TransactionBuilder } = await import(
    "@stellar/stellar-base"
  );

  const account = await fetchAccount(address);
  if (!account) {
    throw new Error(
      "This account isn't funded on Stellar yet. It needs XLM before it can add a trustline.",
    );
  }

  const tx = new TransactionBuilder(new Account(address, account.sequence), {
    // A single classic operation, so the base fee covers it. (The trustline also
    // locks up 0.5 XLM of the account's reserve — that isn't a fee, and comes
    // back if the line is ever removed.)
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(asset.code, asset.issuer) }))
    .setTimeout(180)
    .build();

  onPhase?.("signing");
  const signer = await getWalletSigner();
  const { signedTxXdr } = await signer.signTransaction(tx.toXDR(), {
    address,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  onPhase?.("submitting");
  const res = await fetch(`${HORIZON_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: signedTxXdr }),
  });
  const body = await res.json();
  if (!res.ok) {
    // Horizon buries the useful part in extras.result_codes; the top-level title
    // is just "Transaction Failed".
    const codes = body?.extras?.result_codes;
    const detail = codes?.operations?.join(", ") ?? codes?.transaction ?? body?.title;
    throw new Error(`Couldn't add the trustline${detail ? `: ${detail}` : "."}`);
  }
  return { hash: body.hash ?? "" };
}
