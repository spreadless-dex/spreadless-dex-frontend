import { NETWORK_PASSPHRASE, RPC_URL } from "./config";
import { classicAssetOf, getClassicBalance } from "./horizon";

// Read-only, so no signer/publicKey needed — Client.from() fetches the
// token's spec from the network and balance() just simulates against it.
// Same runtime-typed client faucet.ts uses for mint(), same `as any` cost.
export async function getTokenBalance(
  tokenId: string,
  address: string,
  decimals = 7,
): Promise<bigint> {
  // …except for a Stellar Asset Contract, which has no WASM and therefore no
  // spec to load, so Client.from() can't encode a call against it at all — that
  // failure is why SUSD's balance rendered as "—". Its balance is the classic
  // trustline's balance anyway, so read that (see horizon.ts).
  const asset = classicAssetOf(tokenId);
  if (asset) return getClassicBalance(asset, address, decimals);

  const sdk = await import("@spreadless-dex/sdk");
  const token = await sdk.contract.Client.from({
    contractId: tokenId,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  const { result } = await (token as any).balance({ account: address });
  return result;
}
