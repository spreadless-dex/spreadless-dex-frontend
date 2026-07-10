import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { shortenAddress, tokenAvatarLabel } from "../lib/utils";
import { FAUCET_TOKENS, type TokenInfo } from "../lib/stellar/config";
import { toRawUnits } from "../lib/stellar/units";
import { mintToken } from "../lib/stellar/faucet";
import { mapTxError } from "../lib/stellar/errors";
import type { TxPhase } from "../lib/stellar/types";
import RainButton from "./RainButton";
import TxStatus, { type TxUiStatus } from "./TxStatus";

const DEFAULT_AMOUNT = "1000";

function TokenDropdown({
  value,
  onChange,
}: {
  value: TokenInfo;
  onChange: (t: TokenInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{
            backgroundColor: "var(--c-surface-2)",
            border: "1px solid var(--c-border)",
            color: "var(--c-text-muted)",
          }}
        >
          {tokenAvatarLabel(value.symbol)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold leading-tight" style={{ color: "var(--c-text)" }}>
            {value.symbol}
          </p>
          <p className="text-[11px]" style={{ color: "var(--c-text-faint)" }}>
            {value.decimals} decimals
          </p>
        </div>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--c-text-faint)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-2 rounded-xl overflow-hidden z-30"
          style={{
            backgroundColor: "var(--c-surface)",
            border: "1px solid var(--c-border-2)",
            boxShadow: "var(--c-widget-shadow)",
          }}
        >
          {FAUCET_TOKENS.map((t) => (
            <button
              key={t.symbol}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm transition-colors"
              style={{
                color: t.symbol === value.symbol ? "var(--c-text)" : "var(--c-text-muted)",
                backgroundColor: t.symbol === value.symbol ? "var(--c-surface-2)" : "transparent",
              }}
            >
              <span className="font-semibold">{t.symbol}</span>
              <span className="text-[11px]" style={{ color: "var(--c-text-faint)" }}>
                {t.decimals} decimals
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Faucet() {
  const { walletConnected, walletAddress, connectWallet } = useAppStore();

  const [token, setToken] = useState<TokenInfo>(FAUCET_TOKENS[0]);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [status, setStatus] = useState<TxUiStatus>({ kind: "idle" });
  const [txPhase, setTxPhase] = useState<TxPhase | null>(null);

  const handleMint = async () => {
    if (!walletAddress || !amount || Number(amount) <= 0) return;
    setStatus({ kind: "idle" });
    try {
      const { hash } = await mintToken({
        tokenId: token.contractId,
        to: walletAddress,
        amount: toRawUnits(amount, token.decimals),
        onPhase: setTxPhase,
      });
      setStatus({ kind: "success", message: `Minted ${amount} ${token.symbol} ✓`, hash });
    } catch (err) {
      console.error(`Mint ${token.symbol} failed:`, err);
      setStatus({ kind: "error", ...mapTxError(err, { receive: token.symbol }) });
    } finally {
      setTxPhase(null);
    }
  };

  return (
    <div className="w-full max-w-lg">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold tracking-tight mb-2"
          style={{ color: "var(--c-text)" }}
        >
          Testnet Faucet
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
          Mint free test tokens to your wallet to try swaps and deposits. These
          are worthless testnet assets on the Stellar Test Network.
        </p>
      </div>

      {!walletConnected ? (
        <div
          className="p-6 rounded-2xl text-center"
          style={{
            backgroundColor: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            boxShadow: "var(--c-card-shadow)",
          }}
        >
          <p className="text-sm mb-4" style={{ color: "var(--c-text-muted)" }}>
            Connect your wallet to mint test tokens.
          </p>
          <button
            onClick={connectWallet}
            className="px-6 py-3 text-sm font-semibold rounded-xl transition-all active:scale-[0.99]"
            style={{ backgroundColor: "var(--c-cta-bg)", color: "var(--c-cta-text)" }}
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <div
          className="p-7 rounded-2xl animate-bounce-in"
          style={{
            backgroundColor: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            boxShadow: "var(--c-widget-shadow)",
          }}
        >
          <p className="text-[11px] uppercase tracking-wider mb-4" style={{ color: "var(--c-text-faint)" }}>
            Minting to {shortenAddress(walletAddress ?? "")}
          </p>

          <div
            className="p-4 rounded-xl mb-3"
            style={{ backgroundColor: "var(--c-surface-2)", border: "1px solid var(--c-border)" }}
          >
            <span className="text-[11px] uppercase tracking-wider mb-3 block" style={{ color: "var(--c-text-faint)" }}>
              Token
            </span>
            <TokenDropdown value={token} onChange={setToken} />
          </div>

          <div
            className="px-4 py-2.5 rounded-xl mb-5"
            style={{ backgroundColor: "var(--c-surface-2)", border: "1px solid var(--c-border)" }}
          >
            <span className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--c-text-faint)" }}>
              Amount
            </span>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent text-lg font-semibold outline-none"
              style={{ color: "var(--c-text)" }}
            />
          </div>

          <RainButton
            onClick={handleMint}
            disabled={!amount || Number(amount) <= 0}
            className="w-full py-3.5 text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--c-cta-bg)",
              color: "var(--c-cta-text)",
            }}
          >
            Mint {token.symbol}
          </RainButton>

          <TxStatus phase={txPhase} status={status} />
        </div>
      )}
    </div>
  );
}
