/**
 * The signed-in user's profile: who they are, what they hold, where their
 * money sits, what they did last, and the two account actions (export key
 * for email accounts, log out).
 *
 * Rendered inside the Header island as a native popover so it lives in the
 * top layer, light-dismisses on its own, and needs no JS timers for its
 * animation: open/close is a CSS transition from `display: none` via
 * @starting-style + transition-behavior. On desktop it hangs off the header
 * button through CSS anchor positioning; under 640px the same element is a
 * bottom sheet (see .profile-panel in global.css).
 *
 * Data is fetched on every open, not on mount: the panel is the one place a
 * user goes to check "did that land?", so it must never show stale numbers.
 */
import { useEffect, useRef, useState } from "react";
import { Copy, Check, ExternalLink, KeyRound, LogOut, ArrowUpRight } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { shortenAddress, formatCurrency } from "../lib/utils";
import { fetchAccount } from "../lib/stellar/horizon";
import { getTokenBalance } from "../lib/stellar/token";
import { getLpBalance, LP_DECIMALS } from "../lib/stellar/pool";
import { fromRawUnits } from "../lib/stellar/units";
import { getActivities, type ActivityRecord } from "../lib/activity/db";
import { explorerAccountUrl } from "../lib/stellar/config";
import TokenIcon from "./TokenIcon";
import ModeSwitch from "./ModeSwitch";

export const PROFILE_PANEL_ID = "profile-panel";

interface AssetRow {
  symbol: string;
  balance: number | null;
}

export default function ProfilePanel() {
  const walletAddress = useAppStore((s) => s.walletAddress);
  const walletKind = useAppStore((s) => s.walletKind);
  const poolState = useAppStore((s) => s.poolState);
  const poolStatus = useAppStore((s) => s.poolStatus);
  const loadPoolState = useAppStore((s) => s.loadPoolState);
  const disconnectWallet = useAppStore((s) => s.disconnectWallet);
  const exportPrivyWallet = useAppStore((s) => s.exportPrivyWallet);

  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [xlm, setXlm] = useState<number | null>(null);
  const [assets, setAssets] = useState<AssetRow[] | null>(null);
  const [lp, setLp] = useState<number | null>(null);
  const [recent, setRecent] = useState<ActivityRecord[] | null>(null);

  // Track the popover's own open state (light dismiss, Escape, the trigger
  // button) instead of mirroring it in React by hand.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      setOpen((e as ToggleEvent).newState === "open");
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);

  // Refresh everything on open.
  useEffect(() => {
    if (!open || !walletAddress) return;
    let cancelled = false;
    setXlm(null);
    setAssets(null);
    setLp(null);
    setRecent(null);
    if (poolStatus === "idle") void loadPoolState();

    fetchAccount(walletAddress)
      .then((acct) => {
        if (cancelled) return;
        const native = acct?.balances.find((b) => !b.asset_code);
        setXlm(native ? Number(native.balance) : 0);
      })
      .catch(() => !cancelled && setXlm(0));

    getLpBalance(walletAddress)
      .then((raw) => !cancelled && setLp(Number(fromRawUnits(raw, LP_DECIMALS))))
      .catch(() => !cancelled && setLp(0));

    getActivities(walletAddress)
      .then((rows) => {
        if (cancelled) return;
        setRecent([...rows].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3));
      })
      .catch(() => !cancelled && setRecent([]));

    return () => {
      cancelled = true;
    };
  }, [open, walletAddress, poolStatus, loadPoolState]);

  // Token balances need the pool's token list, which may arrive after open.
  useEffect(() => {
    if (!open || !walletAddress || !poolState) return;
    let cancelled = false;
    const tokens = poolState.tokens;
    setAssets(tokens.map((t) => ({ symbol: t.symbol, balance: null })));
    tokens.forEach((t) => {
      getTokenBalance(t.address, walletAddress, t.decimals)
        .then((raw) => Number(fromRawUnits(raw, t.decimals)))
        .catch(() => 0)
        .then((bal) => {
          if (cancelled) return;
          setAssets((prev) =>
            (prev ?? []).map((row) => (row.symbol === t.symbol ? { ...row, balance: bal } : row)),
          );
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open, walletAddress, poolState]);

  const close = () => ref.current?.hidePopover();

  const copy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked: the full address is still selectable below.
    }
  };

  const isPrivy = walletKind === "privy";

  return (
    <div
      id={PROFILE_PANEL_ID}
      ref={ref}
      popover="auto"
      className="profile-panel"
      aria-label="Profile"
    >
      {walletAddress && (
        <>
          {/* Identity */}
          <section className="px-5 pt-4 pb-3.5" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--c-text-faint)" }}>
                  {isPrivy ? "Email login" : "Browser wallet"}
                </p>
                <p
                  className="font-mono text-sm font-semibold truncate select-all"
                  style={{ color: "var(--c-text)" }}
                  title={walletAddress}
                >
                  {shortenAddress(walletAddress)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton label={copied ? "Copied" : "Copy address"} onClick={copy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </IconButton>
                <a
                  href={explorerAccountUrl(walletAddress)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View on Stellar Expert"
                  className="profile-icon-btn"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </section>

          {/* Assets */}
          <section className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <SectionLabel>Assets</SectionLabel>
            <ul className="flex flex-col gap-2">
              <AssetLine symbol="XLM" balance={xlm} />
              {(assets ?? [{ symbol: "…", balance: null }]).map((a) => (
                <AssetLine key={a.symbol} symbol={a.symbol} balance={a.balance} />
              ))}
            </ul>
          </section>

          {/* Positions */}
          <section className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <a href="/earn" className="profile-row" onClick={close}>
              <span className="flex flex-col gap-0.5 min-w-0">
                <SectionLabel>Liquidity</SectionLabel>
                <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--c-text)" }}>
                  {lp === null ? <Skeleton w={72} /> : lp > 0 ? formatCurrency(lp) : "No position yet"}
                </span>
              </span>
              <ArrowUpRight size={15} className="chev" style={{ color: "var(--c-text-faint)" }} />
            </a>
          </section>

          {/* Recent activity */}
          <section className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <a href="/activity" className="profile-row mb-2" onClick={close}>
              <SectionLabel>Recent activity</SectionLabel>
              <ArrowUpRight size={15} className="chev" style={{ color: "var(--c-text-faint)" }} />
            </a>
            {recent === null ? (
              <Skeleton w={160} />
            ) : recent.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--c-text-faint)" }}>
                Nothing yet. Your swaps and deposits will show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate" style={{ color: "var(--c-text-muted)" }}>
                      {r.title}
                    </span>
                    <span className="shrink-0 tabular-nums" style={{ color: r.status === "failed" ? "var(--c-text-faint)" : "var(--c-text)" }}>
                      {r.status === "failed" ? "Failed" : r.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Interface mode */}
          <section className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <SectionLabel>Interface</SectionLabel>
            <ModeSwitch />
          </section>

          {/* Actions */}
          <section className="px-3 py-3 flex flex-col gap-1">
            {isPrivy && (
              <button
                onClick={() => void exportPrivyWallet()}
                className="profile-action"
              >
                <KeyRound size={15} />
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">Export key</span>
                  <span className="text-[11px]" style={{ color: "var(--c-text-faint)" }}>
                    Move this account into a wallet of your own
                  </span>
                </span>
              </button>
            )}
            <button
              onClick={() => {
                close();
                void disconnectWallet();
              }}
              className="profile-action"
            >
              <LogOut size={15} />
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-medium">Log out</span>
                <span className="text-[11px]" style={{ color: "var(--c-text-faint)" }}>
                  Sign in with a different wallet or address
                </span>
              </span>
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--c-text-faint)" }}>
      {children}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="profile-icon-btn">
      {children}
    </button>
  );
}

function AssetLine({ symbol, balance }: { symbol: string; balance: number | null }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 min-w-0">
        <TokenIcon symbol={symbol} size={22} />
        <span className="text-sm font-medium truncate" style={{ color: "var(--c-text)" }}>
          {symbol}
        </span>
      </span>
      <span className="text-sm tabular-nums shrink-0" style={{ color: "var(--c-text-muted)" }}>
        {balance === null ? <Skeleton w={56} /> : formatAmount(balance)}
      </span>
    </li>
  );
}

function Skeleton({ w }: { w: number }) {
  return (
    <span
      className="inline-block h-3.5 rounded-md align-middle animate-shimmer"
      style={{ width: w, backgroundColor: "var(--c-surface-2)" }}
    />
  );
}

function formatAmount(n: number): string {
  if (n === 0) return "0";
  if (n < 0.01) return "<0.01";
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });
}
