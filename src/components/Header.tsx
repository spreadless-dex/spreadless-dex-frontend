import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { shortenAddress } from "../lib/utils";
import { Menu, X } from "lucide-react";
import { readPoolState } from "../lib/stellar/pool";

interface HeaderProps {
  currentPage?: "home" | "pools" | "swap" | "faucet" | "activity";
}

const navLinks = [
  { href: "/swap", label: "Swap", page: "swap" },
  { href: "/pools", label: "Earn", page: "pools" },
  { href: "/activity", label: "Activity", page: "activity" },
  { href: "#", label: "Analytics", page: "analytics", disabled: true },
  { href: "#", label: "Docs", page: "docs", disabled: true },
  { href: "/faucet", label: "Faucet", page: "faucet" },
];

export default function Header({ currentPage = "home" }: HeaderProps) {
  const {
    walletConnected,
    walletAddress,
    connectWallet,
    disconnectWallet,
    theme,
    toggleTheme,
  } = useAppStore();

  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Close menu on route change / escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // useEffect(() => {
  //   if (walletConnected) {
  //     letsRead;
  //   }
  // }, [walletConnected]);

  // const letsRead = async () => {
  //   await readPoolState();
  // };

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md"
        style={{
          backgroundColor: "color-mix(in srgb, var(--c-bg) 82%, transparent)",
          borderColor: "var(--c-border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <a
            href="/"
            className="font-semibold text-lg tracking-tight transition-opacity hover:opacity-60"
            style={{ color: "var(--c-text)" }}
          >
            Spreadless
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map(({ href, label, page, disabled }) => (
              <a
                key={page}
                href={disabled ? undefined : href}
                className={`text-sm transition-colors ${disabled ? "cursor-not-allowed select-none" : ""}`}
                style={{
                  color:
                    currentPage === page
                      ? "var(--c-text)"
                      : disabled
                        ? "var(--c-text-faint)"
                        : "var(--c-text-muted)",
                }}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-200"
              style={{
                borderColor: "var(--c-border)",
                color: "var(--c-text-muted)",
              }}
            >
              {theme === "dark" ? (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Wallet — hidden on mobile to save space */}
            <button
              onClick={walletConnected ? disconnectWallet : connectWallet}
              className="hidden sm:block text-sm px-4 py-2 rounded-lg border transition-all duration-200 font-medium"
              style={
                walletConnected
                  ? {
                      borderColor: "var(--c-border)",
                      color: "var(--c-text-muted)",
                    }
                  : { borderColor: "var(--c-border-2)", color: "var(--c-text)" }
              }
            >
              {walletConnected && walletAddress
                ? shortenAddress(walletAddress)
                : "Connect Wallet"}
            </button>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-200"
              style={{
                borderColor: "var(--c-border)",
                color: "var(--c-text-muted)",
              }}
            >
              {menuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMenuOpen(false)}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.2)" }}
          />

          {/* Drawer */}
          <nav
            className="absolute top-16 left-0 right-0 border-b"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--c-surface) 96%, transparent)",
              borderColor: "var(--c-border)",
              backdropFilter: "blur(16px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-1">
              {navLinks.map(({ href, label, page, disabled }) => (
                <a
                  key={page}
                  href={disabled ? undefined : href}
                  onClick={() => !disabled && setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${disabled ? "cursor-not-allowed select-none" : ""}`}
                  style={{
                    color:
                      currentPage === page
                        ? "var(--c-text)"
                        : disabled
                          ? "var(--c-text-faint)"
                          : "var(--c-text-muted)",
                    backgroundColor:
                      currentPage === page
                        ? "var(--c-surface-2)"
                        : "transparent",
                  }}
                >
                  {label}
                  {currentPage === page && (
                    <span
                      className="ml-auto w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "var(--c-text)" }}
                    />
                  )}
                </a>
              ))}

              {/* Wallet button inside mobile menu */}
              <div
                className="pt-3 mt-1"
                style={{ borderTop: "1px solid var(--c-border)" }}
              >
                <button
                  onClick={() => {
                    walletConnected ? disconnectWallet() : connectWallet();
                    setMenuOpen(false);
                  }}
                  className="w-full py-3 text-sm font-semibold rounded-xl transition-all"
                  style={{
                    backgroundColor: "var(--c-cta-bg)",
                    color: "var(--c-cta-text)",
                  }}
                >
                  {walletConnected && walletAddress
                    ? shortenAddress(walletAddress)
                    : "Connect Wallet"}
                </button>
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
