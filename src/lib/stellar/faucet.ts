import { getWalletSigner } from "../../store/useAppStore";
import { NETWORK_PASSPHRASE, RPC_URL } from "./config";
import type { OnPhase, TxResult } from "./types";

// The @spreadless-dex/sdk pulls in @stellar/stellar-sdk, which is heavy and
// meant for runtimes with a real fetch/BigInt. We import it dynamically so it
// stays out of Astro's SSR bundle — same pattern as the wallet kit.

interface MintArgs {
  tokenId: string;
  /** Recipient + signer. Must be the connected wallet's public key. */
  to: string;
  /** Raw on-chain units (already scaled by the token's decimals). */
  amount: bigint;
  /** Called as the tx moves through its lifecycle (preparing → signing → submitting). */
  onPhase?: OnPhase;
}

export async function mintToken({ tokenId, to, amount, onPhase }: MintArgs): Promise<TxResult<void>> {
  onPhase?.("preparing");
  const sdk = await import("@spreadless-dex/sdk");
  const signer = await getWalletSigner();

  // Client.from() fetches the token contract's spec from the network and builds
  // a client exposing its methods. The returned client is generically typed
  // (the spec is only known at runtime), so mint() isn't statically visible —
  // hence the cast. `to` both receives the tokens and authorizes the tx.
  // The signer is wrapped the same way pool.ts does it: signTransaction being
  // invoked = wallet is open; it resolving = the signed tx heads to the network.
  const token = await sdk.contract.Client.from({
    contractId: tokenId,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: to,
    signAuthEntry: signer.signAuthEntry,
    signTransaction: async (...args: Parameters<typeof signer.signTransaction>) => {
      onPhase?.("signing");
      const res = await signer.signTransaction(...args);
      onPhase?.("submitting");
      return res;
    },
  });

  const tx = await (token as any).mint({ to, amount });

  // mint is a write call: simulation is done, now sign (via wallet) and submit.
  const sent = await tx.signAndSend();
  return { result: sent.result, hash: sent.sendTransactionResponse?.hash ?? "" };
}
