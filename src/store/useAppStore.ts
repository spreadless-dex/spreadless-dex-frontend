import { create } from "zustand";
import { readPoolState } from "../lib/stellar/pool";
import type { PoolState, PoolToken } from "../lib/stellar/pool";

export type { PoolState, PoolToken } from "../lib/stellar/pool";

type PoolStatus = "idle" | "loading" | "ready" | "error";

interface AppState {
  poolState: PoolState | null;
  poolStatus: PoolStatus;
  poolError: string | null;
  loadPoolState: () => Promise<void>;
  selectedToken: PoolToken | null;
  setSelectedToken: (token: PoolToken | null) => void;
  walletConnected: boolean;
  walletAddress: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

// Guard on window, not localStorage: newer Node versions define a global
// localStorage whose methods throw unless the runtime was started with
// --localstorage-file, which crashes SSR/prerender builds.
const storedTheme =
  typeof window !== "undefined"
    ? (localStorage.getItem("spreadless-theme") as "light" | "dark" | null)
    : null;

export const useAppStore = create<AppState>((set, get) => ({
  poolState: null,
  poolStatus: "idle",
  poolError: null,
  loadPoolState: async () => {
    if (get().poolStatus === "loading") return;
    set({ poolStatus: "loading", poolError: null });
    try {
      const state = await readPoolState();
      set({ poolState: state, poolStatus: "ready" });
    } catch (err) {
      console.error("Failed to load pool state:", err);
      set({
        poolStatus: "error",
        poolError:
          err instanceof Error ? err.message : "Failed to load pool state.",
      });
    }
  },
  selectedToken: null,
  setSelectedToken: (token) => set({ selectedToken: token }),
  walletConnected: false,
  walletAddress: null,
  connectWallet: async () => {
    const { kit, darkTheme, lightTheme } = await loadWalletKit();
    // Match the modal's theme to the app's current theme.
    const { theme } = useAppStore.getState();
    kit.setTheme(theme === "dark" ? darkTheme : lightTheme);
    try {
      // Opens the wallet picker and requests the address. State is applied
      // by the STATE_UPDATED listener registered in loadWalletKit().
      await kit.authModal();
    } catch {
      // User dismissed the modal or picked no wallet — nothing to do.
    }
  },
  disconnectWallet: async () => {
    const { kit } = await loadWalletKit();
    await kit.disconnect();
    set({ walletConnected: false, walletAddress: null });
  },
  theme: storedTheme ?? "light",
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      localStorage.setItem("spreadless-theme", next);
      return { theme: next };
    }),
}));

// ─── Stellar Wallets Kit ────────────────────────────────
// The kit pulls in wallet SDKs (e.g. @stellar/freighter-api) that are
// CommonJS and break Astro's Node SSR when statically imported. Loading it
// dynamically keeps it entirely browser-side. The promise is memoized so
// init + event wiring happen exactly once.
let walletKitPromise: ReturnType<typeof bootWalletKit> | null = null;

async function bootWalletKit() {
  // Imported here (not top-level) on purpose: the kit's state module reads
  // localStorage at module scope, which crashes Astro's prerender in Node.
  const { StellarWalletsKit } = await import("@creit-tech/stellar-wallets-kit/sdk");
  const { defaultModules } =
    await import("@creit-tech/stellar-wallets-kit/modules/utils");
  const { KitEventType, Networks, SwkAppDarkTheme, SwkAppLightTheme } =
    await import("@creit-tech/stellar-wallets-kit/types");

  StellarWalletsKit.init({
    // Switch to Networks.PUBLIC when going to mainnet.
    network: Networks.TESTNET,
    modules: defaultModules(),
    theme: SwkAppDarkTheme,
  });

  // Fires on connect, account switch, and once at launch (restores a prior
  // session from storage). address is undefined when no wallet is active.
  StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
    const address = event.payload.address;
    useAppStore.setState({
      walletConnected: Boolean(address),
      walletAddress: address ?? null,
    });
  });

  StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
    useAppStore.setState({ walletConnected: false, walletAddress: null });
  });

  return {
    kit: StellarWalletsKit,
    darkTheme: SwkAppDarkTheme,
    lightTheme: SwkAppLightTheme,
  };
}

function loadWalletKit() {
  if (!walletKitPromise) walletKitPromise = bootWalletKit();
  return walletKitPromise;
}

// Boot on load in the browser so a previously connected session is restored.
if (typeof window !== "undefined") void loadWalletKit();

// Bridges the connected wallet to the Spreadless/Stellar SDK. The kit's
// signTransaction/signAuthEntry already match the SDK's expected signatures
// exactly, so any SDK Client can sign through the browser wallet by spreading
// this into its constructor options alongside `publicKey`.
export async function getWalletSigner() {
  const { kit } = await loadWalletKit();
  return {
    signTransaction: kit.signTransaction.bind(kit),
    signAuthEntry: kit.signAuthEntry.bind(kit),
  };
}
