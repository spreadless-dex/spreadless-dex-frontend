import { create } from "zustand";
import { readPoolState } from "../lib/stellar/pool";
import type { PoolState, PoolToken } from "../lib/stellar/pool";
import { PRIVY_APP_ID } from "../lib/stellar/config";

export type { PoolState, PoolToken } from "../lib/stellar/pool";

type PoolStatus = "idle" | "loading" | "ready" | "error";

/**
 * Which backend holds the connected account.
 *  - "extension": a wallet reached through the Stellar Wallets Kit (Freighter,
 *    xBull, Albedo, ...). The user keeps their own keys.
 *  - "privy": an embedded wallet created by Privy after an email or Google
 *    login. No extension needed, which is the only way in on a phone today.
 */
export type WalletKind = "extension" | "privy";

/** Kit-shaped signer. Both backends produce exactly this. */
export interface WalletSigner {
  signTransaction: (
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string; path?: string },
  ) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
  signAuthEntry: (
    authEntry: string,
    opts?: { networkPassphrase?: string; address?: string; path?: string },
  ) => Promise<{ signedAuthEntry: string; signerAddress?: string }>;
}

/**
 * What the Privy bridge island (WalletBridge.tsx) registers with the store.
 * Astro islands don't share a React tree, so Privy's hooks can't be used from
 * the header or the swap widget directly: the bridge distills them into plain
 * functions and pushes them here.
 */
export interface PrivyBackend extends WalletSigner {
  /** Privy's SDK has booted and restored (or ruled out) a prior session. */
  ready: boolean;
  /** The embedded wallet's G… address once login + creation are done. */
  address: string | null;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /** Privy's own key-reveal modal. The key never passes through app code. */
  exportWallet: () => Promise<void>;
}

interface AppState {
  poolState: PoolState | null;
  poolStatus: PoolStatus;
  poolError: string | null;
  loadPoolState: () => Promise<void>;
  selectedToken: PoolToken | null;
  setSelectedToken: (token: PoolToken | null) => void;
  walletConnected: boolean;
  walletAddress: string | null;
  /** Backend of the current (or last chosen) connection. */
  walletKind: WalletKind;
  /** True once the bridge has mounted with a Privy app id configured. */
  privyEnabled: boolean;
  /** The "how do you want to connect?" chooser, rendered by WalletBridge. */
  walletChooserOpen: boolean;
  setWalletChooserOpen: (open: boolean) => void;
  /** Opens the chooser when Privy is available, else the kit modal directly. */
  connectWallet: () => Promise<void>;
  connectExtension: () => Promise<void>;
  connectPrivy: () => void;
  disconnectWallet: () => Promise<void>;
  /** Reveal the Privy embedded wallet's secret key. No-op for extensions. */
  exportPrivyWallet: () => Promise<void>;
  /** Called by WalletBridge whenever Privy's state changes. */
  setPrivyBackend: (backend: PrivyBackend | null) => void;
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

// Persisted backend choice so a Privy user stays logged on across reloads
// (Privy restores its own session; this tells us to trust it over the kit).
const MODE_KEY = "spreadless-wallet-mode";
// Only honoured while Privy is configured: if the app id is ever removed, a
// stale "privy" mode must not hide the kit's restored session forever.
const storedMode: WalletKind =
  typeof window !== "undefined" &&
  Boolean(PRIVY_APP_ID) &&
  localStorage.getItem(MODE_KEY) === "privy"
    ? "privy"
    : "extension";

function persistMode(kind: WalletKind) {
  if (typeof window === "undefined") return;
  if (kind === "privy") localStorage.setItem(MODE_KEY, "privy");
  else localStorage.removeItem(MODE_KEY);
}

// The bridge's latest snapshot. Kept outside React state on purpose: the
// signer functions are consumed by plain lib code (pool.ts, router.ts, ...)
// through getWalletSigner(), not by components.
let privyBackend: PrivyBackend | null = null;
// True between "user picked Email or Google" and Privy reporting a session,
// so a not-yet-authenticated Privy is read as "modal open", not "logged out".
let privyPending = false;
// The kit's own idea of the connected account, kept even while Privy is the
// chosen backend so we can fall back to it if the Privy session is gone.
let kitAddress: string | null = null;

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
  walletKind: storedMode,
  // Known from the build, so the chooser offers the email option on the first
  // click even while the Privy island is still downloading; the bridge
  // confirms it on mount. False = the option is shown as "Soon".
  privyEnabled: Boolean(PRIVY_APP_ID),
  walletChooserOpen: false,
  setWalletChooserOpen: (open) => set({ walletChooserOpen: open }),
  // Always the chooser, even without Privy: the email option is then listed
  // as "Soon", so people see what's coming rather than only the wallet kit.
  connectWallet: async () => {
    set({ walletChooserOpen: true });
  },
  connectExtension: async () => {
    set({ walletChooserOpen: false });
    const { kit, darkTheme, lightTheme } = await loadWalletKit();
    // Match the modal's theme to the app's current theme.
    const { theme } = useAppStore.getState();
    kit.setTheme(theme === "dark" ? darkTheme : lightTheme);
    try {
      // Opens the wallet picker and requests the address. Later account
      // switches arrive through the STATE_UPDATED listener in loadWalletKit().
      const { address } = await kit.authModal();
      if (!address) return;
      // Picking an extension wallet replaces a Privy session, if one exists.
      if (get().walletKind === "privy") await privyBackend?.logout();
      privyPending = false;
      persistMode("extension");
      set({ walletKind: "extension", walletConnected: true, walletAddress: address });
    } catch {
      // User dismissed the modal or picked no wallet. Nothing to do.
    }
  },
  connectPrivy: () => {
    set({ walletChooserOpen: false });
    if (!privyBackend) {
      throw new Error("Email login is not configured (PRIVY_APP_ID empty)");
    }
    // Not persisted yet: that happens once Privy reports a session, so a
    // dismissed login modal doesn't strand the next page load in Privy mode.
    privyPending = true;
    set({ walletKind: "privy", walletConnected: false, walletAddress: null });
    privyBackend.login();
  },
  disconnectWallet: async () => {
    if (get().walletKind === "privy") {
      privyPending = false;
      await privyBackend?.logout();
      persistMode("extension");
      set({ walletKind: "extension", walletConnected: false, walletAddress: null });
      return;
    }
    const { kit } = await loadWalletKit();
    await kit.disconnect();
    set({ walletConnected: false, walletAddress: null });
  },
  exportPrivyWallet: async () => {
    if (get().walletKind !== "privy" || !privyBackend) return;
    await privyBackend.exportWallet();
  },
  setPrivyBackend: (backend) => {
    privyBackend = backend;
    const enabled = backend !== null || Boolean(PRIVY_APP_ID);
    if (get().walletKind !== "privy") {
      set({ privyEnabled: enabled });
      return;
    }
    // Privy mode: the connection state mirrors Privy's auth state.
    if (backend?.ready && backend.authenticated && backend.address) {
      privyPending = false;
      persistMode("privy");
      set({
        privyEnabled: enabled,
        walletConnected: true,
        walletAddress: backend.address,
      });
      return;
    }
    // Privy is up but holds no session and nobody is mid-login: the session
    // expired or was ended elsewhere. Hand control back to the kit so a
    // restored extension session isn't hidden behind a stale mode.
    if (backend?.ready && !backend.authenticated && !privyPending) {
      persistMode("extension");
      set({
        privyEnabled: enabled,
        walletKind: "extension",
        walletConnected: Boolean(kitAddress),
        walletAddress: kitAddress,
      });
      return;
    }
    // Still booting, wallet still being created, or the login modal is open.
    set({ privyEnabled: enabled, walletConnected: false, walletAddress: null });
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
  // While Privy is the chosen backend the kit's restored session is ignored:
  // the user explicitly picked the other way in, and connectExtension()
  // applies a fresh pick itself.
  StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
    const address = event.payload.address;
    kitAddress = address ?? null;
    if (useAppStore.getState().walletKind === "privy") return;
    useAppStore.setState({
      walletConnected: Boolean(address),
      walletAddress: address ?? null,
    });
  });

  StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
    kitAddress = null;
    if (useAppStore.getState().walletKind === "privy") return;
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

// Bridges the connected wallet to the Spreadless/Stellar SDK. Both backends
// expose the kit's signTransaction/signAuthEntry signatures, which already
// match the SDK's expected ones exactly, so any SDK Client can sign through
// the active wallet by spreading this into its constructor options alongside
// `publicKey`.
export async function getWalletSigner(): Promise<WalletSigner> {
  if (useAppStore.getState().walletKind === "privy") {
    if (!privyBackend?.authenticated || !privyBackend.address) {
      throw new Error("Not signed in. Connect a wallet first.");
    }
    return {
      signTransaction: privyBackend.signTransaction,
      signAuthEntry: privyBackend.signAuthEntry,
    };
  }
  const { kit } = await loadWalletKit();
  return {
    signTransaction: kit.signTransaction.bind(kit),
    signAuthEntry: kit.signAuthEntry.bind(kit),
  };
}
