import { tokenAvatarLabel } from '../lib/utils'

// Real icons for the pool's known assets — sourced from an open-license
// crypto-icon set (spothq/cryptocurrency-icons, CC0) for the tokens that
// mimic well-known stables, and Synthetix's actual sUSD logo for SUSD since
// that symbol is a real asset, not just a lookalike.
const ICON_SRC: Record<string, string> = {
  sDAI: '/tokens/dai.svg',
  sUSDT: '/tokens/usdt.svg',
  SUSD: '/tokens/susd.png',
  sUSDC: '/tokens/usdc.svg',
}

interface TokenIconProps {
  symbol: string
  size?: number
  className?: string
}

export default function TokenIcon({ symbol, size = 36, className = '' }: TokenIconProps) {
  const src = ICON_SRC[symbol]

  // Falls back gracefully for a symbol we don't have art for (e.g. the pool
  // gets redeployed with a new asset) — same degrade-not-break spirit as
  // pool.ts's metaFor() falling back to a shortened address.
  if (!src) {
    return (
      <div
        className={`rounded-full flex items-center justify-center font-bold shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.32,
          backgroundColor: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
          color: 'var(--c-text-muted)',
        }}
      >
        {tokenAvatarLabel(symbol).slice(0, 2)}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      className={`rounded-full shrink-0 ${className}`}
      style={{ width: size, height: size, border: '1px solid var(--c-border)', backgroundColor: 'var(--c-surface-2)' }}
    />
  )
}
