import { NETWORK_PASSPHRASE, RPC_URL } from "./config";

// Read-only, so no signer/publicKey needed — Client.from() fetches the
// token's spec from the network and balance() just simulates against it.
// Same runtime-typed client faucet.ts uses for mint(), same `as any` cost.
export async function getTokenBalance(
  tokenId: string,
  address: string,
): Promise<bigint> {
  const sdk = await import("@spreadless-dex/sdk");
  const token = await sdk.contract.Client.from({
    contractId: tokenId,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  const { result } = await (token as any).balance({ account: address });
  return result;
}
