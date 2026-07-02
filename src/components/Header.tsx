import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { shortenAddress } from '../lib/utils'

interface HeaderProps {
  currentPage?: 'home' | 'pools'
}

export default function Header({ currentPage = 'home' }: HeaderProps) {
  const { walletConnected, walletAddress, connectWallet, disconnectWallet, theme, toggleTheme } =
    useAppStore()

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--c-bg) 92%, transparent)',
        borderColor: 'var(--c-border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <a
          href="/"
          className="font-semibold text-lg tracking-tight transition-opacity hover:opacity-60"
          style={{ color: 'var(--c-text)' }}
        >
          Spreadless
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {[
            { href: '/', label: 'Home', page: 'home' },
            { href: '/pools', label: 'Earn', page: 'pools' },
          ].map(({ href, label, page }) => (
            <a
              key={page}
              href={href}
              className="text-sm transition-colors"
              style={{
                color:
                  currentPage === page ? 'var(--c-text)' : 'var(--c-text-muted)',
              }}
            >
              {label}
            </a>
          ))}
          <span className="text-sm cursor-not-allowed select-none" style={{ color: 'var(--c-text-faint)' }}>
            Analytics
          </span>
          <span className="text-sm cursor-not-allowed select-none" style={{ color: 'var(--c-text-faint)' }}>
            Docs
          </span>
        </nav>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-200"
            style={{
              borderColor: 'var(--c-border)',
              color: 'var(--c-text-muted)',
            }}
          >
            {theme === 'dark' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* Wallet */}
          <button
            onClick={walletConnected ? disconnectWallet : connectWallet}
            className="text-sm px-4 py-2 rounded-lg border transition-all duration-200 font-medium"
            style={
              walletConnected
                ? {
                    borderColor: 'var(--c-border)',
                    color: 'var(--c-text-muted)',
                  }
                : {
                    borderColor: 'var(--c-border-2)',
                    color: 'var(--c-text)',
                  }
            }
          >
            {walletConnected && walletAddress
              ? shortenAddress(walletAddress)
              : 'Connect Wallet'}
          </button>
        </div>
      </div>
    </header>
  )
}
