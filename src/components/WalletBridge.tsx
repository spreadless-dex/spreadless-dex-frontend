/**
 * Privy integration: email/Google login that yields an embedded Stellar
 * wallet, so a user without a browser extension (every phone user today) can
 * still get in. Ported from win-trader's privy.tsx.
 *
 * Mounted once per page as a `client:only` island in the layouts. Astro
 * islands don't share a React tree, so Privy's hooks can't be consumed by the
 * header or the swap widget. This component runs PrivyProvider, distills the
 * hooks into plain functions, and pushes them into the zustand store through
 * setPrivyBackend(). It also renders the "how do you want to connect?"
 * chooser the store opens from connectWallet().
 *
 * With PRIVY_APP_ID empty (see config.ts) the island registers nothing. The
 * chooser still lists the email option, marked "Soon": a tap shows a short
 * note that fades out again instead of opening a login.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { PrivyProvider, usePrivy, type User } from "@privy-io/react-auth";
import {
  useCreateWallet,
  useExportWallet,
  useSignRawHash,
} from "@privy-io/react-auth/extended-chains";
import { ChevronRight, Mail, Wallet } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { NETWORK_PASSPHRASE, PRIVY_APP_ID } from "../lib/stellar/config";
import {
  ensureFunded,
  signAuthEntryXdr,
  signTransactionXdr,
} from "../lib/stellar/privySigner";

export default function WalletBridge() {
  const theme = useAppStore((s) => s.theme);
  if (!PRIVY_APP_ID) return <WalletChooser />;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google"],
        // Monochrome accent to match the app; Privy's modal isn't themeable
        // beyond this. Follows the app's light/dark toggle.
        appearance: {
          theme,
          accentColor: theme === "dark" ? "#ffffff" : "#000000",
        },
        // Ethereum/Solana createOnLogin default to "off". The Stellar wallet
        // is created explicitly by the bridge below.
      }}
    >
      <PrivyBridge />
      <WalletChooser />
    </PrivyProvider>
  );
}

/** The user's embedded Stellar wallet address, if one has been created. */
function stellarAddressOf(user: User | null): string | null {
  const account = user?.linkedAccounts.find(
    (a) =>
      a.type === "wallet" &&
      a.chainType === "stellar" &&
      a.walletClientType === "privy",
  );
  return account && "address" in account ? account.address : null;
}

function PrivyBridge() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const { exportWallet } = useExportWallet();
  const setPrivyBackend = useAppStore((s) => s.setPrivyBackend);
  const [error, setError] = useState<string | null>(null);

  // user.linkedAccounts does not always refresh right after createWallet
  // resolves. Keep the created address locally and prefer the user object
  // once it catches up.
  const [createdAddress, setCreatedAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!authenticated) setCreatedAddress(null);
  }, [authenticated]);

  const address = useMemo(() => stellarAddressOf(user), [user]) ?? createdAddress;

  // Create the Stellar wallet right after the first login. The ref makes the
  // effect idempotent across StrictMode double-invocations and re-renders;
  // without it two createWallet calls race and one rejects.
  const creating = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    if (!ready || !authenticated || address != null) return;
    creating.current ??= createWallet({ chainType: "stellar" })
      .then(({ wallet }) => setCreatedAddress(wallet.address))
      .catch((err) => {
        console.error("Privy: couldn't create Stellar wallet", err);
        setError("Couldn't create your Stellar wallet. Please try again.");
      })
      .finally(() => {
        creating.current = null;
      });
  }, [ready, authenticated, address, createWallet]);

  // Fund the account (Friendbot) in the background so the user's first action
  // doesn't hit "account not found". Idempotent per address; on failure the
  // ref resets so a later render retries.
  const fundingFor = useRef<string | null>(null);
  useEffect(() => {
    if (address == null || fundingFor.current === address) return;
    fundingFor.current = address;
    void ensureFunded(address).catch((err) => {
      fundingFor.current = null;
      console.error("Privy: couldn't fund Stellar account", err);
      setError("Couldn't activate your Stellar account. Use the Faucet page to fund it.");
    });
  }, [address]);

  // Publish the current snapshot to the store. Registered from the first
  // render (not gated on `ready`) so the connect chooser offers the email
  // option while Privy is still booting. Signers close over the address so
  // lib code never has to know which backend is active.
  useEffect(() => {
    const requireAddress = (): string => {
      if (address == null) throw new Error("Your Stellar wallet is still being set up.");
      return address;
    };
    const rawSigner = (addr: string) => async (hash: `0x${string}`) => {
      const { signature } = await signRawHash({ address: addr, chainType: "stellar", hash });
      return signature;
    };
    setPrivyBackend({
      ready,
      address: ready && authenticated ? address : null,
      authenticated: ready && authenticated,
      // login accepts a MouseEvent overload; wrap so it can't be misused.
      // Before Privy is ready (still booting, or its config fetch failed,
      // e.g. an origin missing from the app's allowed domains) login() is a
      // silent no-op, so say something instead of leaving a dead click.
      login: () => {
        if (!ready) {
          setError("Email login isn't available right now. Try again in a moment or use a browser wallet.");
          return;
        }
        login();
      },
      logout,
      exportWallet: () => exportWallet({ address: requireAddress() }),
      signTransaction: (xdr, opts) => {
        const addr = requireAddress();
        return signTransactionXdr(
          xdr,
          opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
          addr,
          rawSigner(addr),
        );
      },
      signAuthEntry: (entry) => {
        const addr = requireAddress();
        return signAuthEntryXdr(entry, addr, rawSigner(addr));
      },
    });
  }, [ready, authenticated, address, login, logout, signRawHash, exportWallet, setPrivyBackend]);

  // Unregister on unmount so a stale backend never outlives its provider.
  useEffect(() => () => setPrivyBackend(null), [setPrivyBackend]);

  if (!error) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] rounded-xl px-4 py-3 text-sm flex items-start gap-3"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border-2)",
        color: "var(--c-text)",
        boxShadow: "var(--c-widget-shadow)",
      }}
    >
      <span className="flex-1">{error}</span>
      <button
        onClick={() => setError(null)}
        className="text-xs font-medium"
        style={{ color: "var(--c-text-muted)" }}
      >
        Dismiss
      </button>
    </div>
  );
}

/** How long the "Soon" note stays before it dissolves on its own. */
const SOON_NOTE_MS = 2800;

/**
 * Two ways in: a browser wallet through the kit, or email/Google through
 * Privy. Without a Privy app id the email row stays visible but reads
 * "Soon" and only shows a note.
 */
function WalletChooser() {
  const open = useAppStore((s) => s.walletChooserOpen);
  const setOpen = useAppStore((s) => s.setWalletChooserOpen);
  const connectExtension = useAppStore((s) => s.connectExtension);
  const connectPrivy = useAppStore((s) => s.connectPrivy);
  const privyEnabled = useAppStore((s) => s.privyEnabled);

  // The "Soon" note is a native popover: it lives in the top layer above the
  // dialog, and its enter/exit is pure CSS (@starting-style + allow-discrete),
  // so the only JS here is show, then hide after a beat. A second tap while
  // it's visible just restarts the clock.
  const noteRef = useRef<HTMLDivElement>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  const showSoonNote = () => {
    const el = noteRef.current;
    if (!el || typeof el.showPopover !== "function") return;
    if (!el.matches(":popover-open")) el.showPopover();
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => {
      if (el.isConnected && el.matches(":popover-open")) el.hidePopover();
    }, SOON_NOTE_MS);
  };
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  // The chooser is a native <dialog> that stays mounted. The store's flag
  // only drives showModal()/close(); the enter and exit choreography is one
  // CSS transition (see .wallet-dialog in global.css) that runs forwards on
  // open and backwards on close, so closing never just blinks out of
  // existence the way an unmount would. Escape and a click on the backdrop
  // end in the same `close` event as the X button, which syncs the store.
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  // On a phone no browser extension can be installed, so the email login is
  // the option that actually works: list it first and say so. Evaluated on
  // open, not at module load, so a resized window gets the right order.
  const [handheld, setHandheld] = useState(false);
  useEffect(() => {
    if (!open) return;
    setHandheld(window.matchMedia("(max-width: 639px), (pointer: coarse)").matches);
  }, [open]);

  // Leaving the chooser takes the note with it.
  useEffect(() => {
    if (open) return;
    const el = noteRef.current;
    if (el?.matches(":popover-open")) el.hidePopover();
  }, [open]);

  const extension = {
    icon: <Wallet size={18} />,
    title: "Browser wallet",
    hint: "Freighter, xBull, Albedo and others. You keep your own keys.",
    tag: null as string | null,
    onClick: () => void connectExtension(),
    soon: false,
  };
  const email = {
    icon: <Mail size={18} />,
    title: "Email or Google",
    hint: "No extension needed. A Stellar account is created for you.",
    tag: !privyEnabled ? "Soon" : handheld ? "Recommended" : null,
    onClick: privyEnabled ? connectPrivy : showSoonNote,
    soon: !privyEnabled,
  };
  // Email first on a phone, but only once it actually works there.
  const options =
    handheld && privyEnabled ? [email, extension] : [extension, email];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="wallet-chooser-title"
      className="wallet-dialog"
      onClose={() => setOpen(false)}
      // Only the backdrop reports the dialog itself as target; the card has
      // no padding, so any click on content lands on a descendant.
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3">
          <h3
            id="wallet-chooser-title"
            className="text-base font-semibold"
            style={{ color: "var(--c-text)" }}
          >
            Log in
          </h3>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{ color: "var(--c-text-faint)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-2 px-3 pb-3">
          {options.map((o, i) => (
            <button
              key={o.title}
              onClick={o.onClick}
              aria-describedby={o.soon ? "wallet-soon-note" : undefined}
              className={`wallet-option flex items-center gap-3 w-full text-left px-3 py-3 rounded-xl${
                o.soon ? " wallet-option-soon" : ""
              }`}
              style={{
                backgroundColor: "var(--c-surface-2)",
                border: "1px solid var(--c-border)",
                // Row index for the staggered settle (see .wallet-dialog).
                ["--i" as string]: i,
              }}
            >
              <span
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg"
                style={{
                  backgroundColor: "var(--c-cta-bg)",
                  color: "var(--c-cta-text)",
                }}
              >
                {o.icon}
              </span>
              <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: "var(--c-text)" }}>
                    {o.title}
                  </span>
                  {o.tag && (
                    <span
                      className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-px rounded-md whitespace-nowrap"
                      style={{
                        border: "1px solid var(--c-border-2)",
                        color: "var(--c-text-muted)",
                      }}
                    >
                      {o.tag}
                    </span>
                  )}
                </span>
                <span className="text-xs leading-snug" style={{ color: "var(--c-text-muted)" }}>
                  {o.hint}
                </span>
              </span>
              <ChevronRight size={16} className="chev shrink-0" style={{ color: "var(--c-text-faint)" }} />
            </button>
          ))}
        </div>

        <p
          className="px-5 pb-4 text-[11px] leading-snug"
          style={{ color: "var(--c-text-faint)" }}
        >
          Spreadless never sees your secret key. Every transaction is approved in
          your wallet or through your login.
        </p>

        {/* Anchored under the email row (see .soon-note in global.css). */}
        <div
          ref={noteRef}
          id="wallet-soon-note"
          popover="manual"
          role="status"
          className="soon-note"
        >
          <span className="soon-dot" aria-hidden="true" />
          Not just yet. Email login is on its way.
        </div>
      </div>
    </dialog>
  );
}
