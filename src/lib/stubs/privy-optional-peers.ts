// Stub for @privy-io/react-auth's OPTIONAL peer dependencies (Solana and
// EVM smart-account tooling). Spreadless only uses Privy's Stellar embedded
// wallet, so none of these code paths can run. Rolldown (Vite in Astro 7)
// still needs every named import to resolve at build time, which is why
// astro.config.mjs aliases the packages here instead of installing them.
//
// Names are exactly what Privy imports; regenerate the list if a Privy
// upgrade fails the build with MISSING_EXPORT. Each throws if ever called.

function unavailable(name: string): never {
  throw new Error(`${name} is not available: optional Privy peer stubbed out`);
}

export const SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED = (): never => unavailable("SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED");
export const TOKEN_PROGRAM_ADDRESS = (): never => unavailable("TOKEN_PROGRAM_ADDRESS");
export const TokenInstruction = (): never => unavailable("TokenInstruction");
export const address = (): never => unavailable("address");
export const appendTransactionMessageInstruction = (): never => unavailable("appendTransactionMessageInstruction");
export const appendTransactionMessageInstructions = (): never => unavailable("appendTransactionMessageInstructions");
export const assertIsInstructionWithAccounts = (): never => unavailable("assertIsInstructionWithAccounts");
export const assertIsInstructionWithData = (): never => unavailable("assertIsInstructionWithData");
export const assertIsTransactionMessageWithBlockhashLifetime = (): never => unavailable("assertIsTransactionMessageWithBlockhashLifetime");
export const blockhash = (): never => unavailable("blockhash");
export const compileTransaction = (): never => unavailable("compileTransaction");
export const createAbstractClient = (): never => unavailable("createAbstractClient");
export const createKeyPairFromPrivateKeyBytes = (): never => unavailable("createKeyPairFromPrivateKeyBytes");
export const createKeyPairSignerFromBytes = (): never => unavailable("createKeyPairSignerFromBytes");
export const createKeyPairSignerFromPrivateKeyBytes = (): never => unavailable("createKeyPairSignerFromPrivateKeyBytes");
export const createNoopSigner = (): never => unavailable("createNoopSigner");
export const createPimlicoClient = (): never => unavailable("createPimlicoClient");
export const createSmartAccountClient = (): never => unavailable("createSmartAccountClient");
export const createSolanaRpc = (): never => unavailable("createSolanaRpc");
export const createSolanaRpcSubscriptions = (): never => unavailable("createSolanaRpcSubscriptions");
export const createTransactionMessage = (): never => unavailable("createTransactionMessage");
export const decompileTransactionMessage = (): never => unavailable("decompileTransactionMessage");
export const decompileTransactionMessageFetchingLookupTables = (): never => unavailable("decompileTransactionMessageFetchingLookupTables");
export const devnet = (): never => unavailable("devnet");
export const fetchAddressesForLookupTables = (): never => unavailable("fetchAddressesForLookupTables");
export const fetchEncodedAccounts = (): never => unavailable("fetchEncodedAccounts");
export const fetchMaybeToken = (): never => unavailable("fetchMaybeToken");
export const fetchMint = (): never => unavailable("fetchMint");
export const fetchToken = (): never => unavailable("fetchToken");
export const findAssociatedTokenPda = (): never => unavailable("findAssociatedTokenPda");
export const getAddMemoInstruction = (): never => unavailable("getAddMemoInstruction");
export const getAddressEncoder = (): never => unavailable("getAddressEncoder");
export const getApproveInstruction = (): never => unavailable("getApproveInstruction");
export const getBase58Decoder = (): never => unavailable("getBase58Decoder");
export const getBase58Encoder = (): never => unavailable("getBase58Encoder");
export const getBase64Decoder = (): never => unavailable("getBase64Decoder");
export const getBase64EncodedWireTransaction = (): never => unavailable("getBase64EncodedWireTransaction");
export const getBase64Encoder = (): never => unavailable("getBase64Encoder");
export const getBatchTransactionObject = (): never => unavailable("getBatchTransactionObject");
export const getCompiledTransactionMessageDecoder = (): never => unavailable("getCompiledTransactionMessageDecoder");
export const getCreateAssociatedTokenIdempotentInstruction = (): never => unavailable("getCreateAssociatedTokenIdempotentInstruction");
export const getCreateAssociatedTokenInstructionAsync = (): never => unavailable("getCreateAssociatedTokenInstructionAsync");
export const getProgramDerivedAddress = (): never => unavailable("getProgramDerivedAddress");
export const getSignatureFromTransaction = (): never => unavailable("getSignatureFromTransaction");
export const getTransactionDecoder = (): never => unavailable("getTransactionDecoder");
export const getTransactionEncoder = (): never => unavailable("getTransactionEncoder");
export const getTransferCheckedInstruction = (): never => unavailable("getTransferCheckedInstruction");
export const getTransferInstruction = (): never => unavailable("getTransferInstruction");
export const getTransferSolInstruction = (): never => unavailable("getTransferSolInstruction");
export const getU64Encoder = (): never => unavailable("getU64Encoder");
export const getUtf8Encoder = (): never => unavailable("getUtf8Encoder");
export const identifyTokenInstruction = (): never => unavailable("identifyTokenInstruction");
export const isAddress = (): never => unavailable("isAddress");
export const isSolanaError = (): never => unavailable("isSolanaError");
export const isSome = (): never => unavailable("isSome");
export const isTransactionModifyingSigner = (): never => unavailable("isTransactionModifyingSigner");
export const isTransactionPartialSigner = (): never => unavailable("isTransactionPartialSigner");
export const isTransactionSigner = (): never => unavailable("isTransactionSigner");
export const mainnet = (): never => unavailable("mainnet");
export const parseTransferCheckedInstruction = (): never => unavailable("parseTransferCheckedInstruction");
export const partiallySignTransactionMessageWithSigners = (): never => unavailable("partiallySignTransactionMessageWithSigners");
export const pipe = (): never => unavailable("pipe");
export const prependTransactionMessageInstruction = (): never => unavailable("prependTransactionMessageInstruction");
export const setTransactionMessageFeePayer = (): never => unavailable("setTransactionMessageFeePayer");
export const setTransactionMessageFeePayerSigner = (): never => unavailable("setTransactionMessageFeePayerSigner");
export const setTransactionMessageLifetimeUsingBlockhash = (): never => unavailable("setTransactionMessageLifetimeUsingBlockhash");
export const toBiconomySmartAccount = (): never => unavailable("toBiconomySmartAccount");
export const toKernelSmartAccount = (): never => unavailable("toKernelSmartAccount");
export const toLightSmartAccount = (): never => unavailable("toLightSmartAccount");
export const toNexusSmartAccount = (): never => unavailable("toNexusSmartAccount");
export const toSafeSmartAccount = (): never => unavailable("toSafeSmartAccount");
export const toThirdwebSmartAccount = (): never => unavailable("toThirdwebSmartAccount");

export default {};
