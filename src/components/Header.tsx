import { useAppStore } from "../store/useAppStore";
import { shortenAddress } from "../lib/utils";

interface HeaderProps {
  currentPage?: "home" | "pools";
}

export default function Header({ currentPage = "home" }: HeaderProps) {
  const { walletConnected, walletAddress, connectWallet, disconnectWallet } =
    useAppStore();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#080808]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <a
          href="/"
          className="text-white font-semibold text-lg tracking-tight hover:text-white/70 transition-colors"
        >
          Spreadless
        </a>

        <nav className="hidden md:flex items-center gap-8">
          <a
            href="/"
            className={`text-sm transition-colors ${
              currentPage === "home"
                ? "text-white"
                : "text-white/40 hover:text-white/80"
            }`}
          >
            Home
          </a>
          <a
            href="/pools"
            className={`text-sm transition-colors ${
              currentPage === "pools"
                ? "text-white"
                : "text-white/40 hover:text-white/80"
            }`}
          >
            Earn
          </a>
          <span className="text-sm text-white/20 cursor-not-allowed select-none">
            Analytics
          </span>
          <span className="text-sm text-white/20 cursor-not-allowed select-none">
            Docs
          </span>
        </nav>

        <button
          onClick={walletConnected ? disconnectWallet : connectWallet}
          className={`text-sm px-4 py-2 rounded-lg border transition-all duration-200 font-medium ${
            walletConnected
              ? "border-white/10 text-white/60 hover:border-white/20 hover:text-white/80"
              : "border-white/20 text-white hover:bg-white hover:text-black hover:border-transparent"
          }`}
        >
          {walletConnected && walletAddress
            ? shortenAddress(walletAddress)
            : "Connect Wallet"}
        </button>
      </div>
    </header>
  );
}
