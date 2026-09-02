import { useAppStore } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import { getPoolPreviewStats } from '../lib/mockPoolStats'
import { useLocalPools } from '../lib/stellar/localPools'
import { POOL_CONTRACT_ID } from '../lib/stellar/config'
import { tokenSymbol } from '../lib/stellar/registry'
import { useVaultTvl } from '../lib/stellar/vaultTvl'
import { sameTokenSet } from '../lib/stellar/poolParams'
import TokenIcon from './TokenIcon'
import { ChevronRight } from 'lucide-react'

// The genuine "Pools" view (issue #28): a register of every pool the protocol
// knows about, the shared StableSwap pool plus anything created in this
// browser. Two pools may hold the same assets with the same curve and fee, so
// the register ranks by TVL and says so: depth is what decides which pool
// quotes better and which one a depositor should join.

interface Row {
  address: string
  href: string
  symbols: string[]
  title: string
  /** Settings line under the title. */
  settings: string
  /** null when nothing on chain can be read (demo pools). */
  tvl: number | null
  apy: string
  /** Accent the APY figure: only real, quoted pools get it. */
  apyKnown: boolean
  demo: boolean
  mine: boolean
  tokens: string[]
  amp?: number
  feeBps?: number
}

/** Same assets, same A, same fee: the pools TVL has to tell apart. */
function sameSetup(a: Row, b: Row): boolean {
  if (a.amp === undefined || a.feeBps === undefined) return false
  return a.amp === b.amp && a.feeBps === b.feeBps && sameTokenSet(a.tokens, b.tokens)
}

export default function PoolsRegister() {
  const { poolState } = useAppStore()
  const localPools = useLocalPools((s) => s.pools)
  const tvlByAddress = useVaultTvl(localPools.map((p) => p.address))
  if (!poolState) return null

  const apys = poolState.tokens.map((t) => getPoolPreviewStats(t.symbol).apy)
  const apyLo = Math.min(...apys)
  const apyHi = Math.max(...apys)
  const apyRange = apyLo === apyHi ? `${apyLo.toFixed(1)}%` : `${apyLo.toFixed(1)}–${apyHi.toFixed(1)}%`

  const rows: Row[] = [
    {
      address: POOL_CONTRACT_ID,
      href: '/pools/stableswap',
      symbols: poolState.tokens.map((t) => t.symbol),
      title: 'StableSwap Pool',
      settings: `A = ${poolState.amp} · ${poolState.paused ? 'Paused' : 'Active'}`,
      tvl: poolState.totalTvl,
      apy: apyRange,
      apyKnown: true,
      demo: false,
      mine: false,
      tokens: poolState.tokens.map((t) => t.address),
      amp: poolState.amp,
    },
    // Pools created in this browser (see localPools.ts): real deploys and demo
    // creations. They live here so the builder's result is visible
    // immediately; the Factory registry replaces this list when it ships.
    ...localPools.map((p): Row => ({
      address: p.address,
      href: `/pools/v/${p.address}`,
      symbols: p.tokens.map((address) => tokenSymbol(address)),
      title: p.label,
      settings: `A = ${p.amp} · ${(p.feeBps / 100).toFixed(2)}% fee · yours`,
      tvl: p.backend === 'demo' ? null : (tvlByAddress[p.address] ?? null),
      apy: '—',
      apyKnown: false,
      demo: p.backend === 'demo',
      mine: true,
      tokens: p.tokens,
      amp: p.amp,
      feeBps: p.feeBps,
    })),
  ]

  // Deepest first: with identical pools allowed, the ranking is the answer to
  // "which of these do I use?".
  const ranked = [...rows].sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1))
  const twinCount = (row: Row) => ranked.filter((r) => sameSetup(row, r)).length
  const deepestOfSetup = (row: Row) => ranked.find((r) => sameSetup(row, r))?.address === row.address

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
    >
      {/* Column headers — hidden on mobile, the row stays readable stacked */}
      <div
        className="hidden md:grid items-center px-5 py-3 text-[11px] uppercase tracking-wider"
        style={{ gridTemplateColumns: '2fr 1.4fr 1fr 1fr 24px', color: 'var(--c-text-faint)', borderBottom: '1px solid var(--c-border)' }}
      >
        <span>Pool</span>
        <span>Assets</span>
        <span className="text-right" style={{ color: 'var(--c-text-muted)' }}>TVL ↓</span>
        <span className="text-right">APY*</span>
        <span />
      </div>

      {ranked.map((row, i) => {
        const twins = twinCount(row)
        return (
          <a
            key={row.address}
            href={row.href}
            className="grid items-center gap-y-3 px-5 py-4 transition-colors hover:bg-[var(--c-surface-2)] grid-cols-2 md:grid-cols-[2fr_1.4fr_1fr_1fr_24px]"
            style={{ borderTop: i === 0 ? undefined : '1px solid var(--c-border)' }}
          >
            {/* Pool identity */}
            <div className="flex items-center gap-3 col-span-2 md:col-span-1">
              <div className="flex items-center shrink-0">
                {row.symbols.map((symbol, j) => (
                  <div key={`${symbol}-${j}`} style={{ marginLeft: j === 0 ? 0 : -10, zIndex: row.symbols.length - j }}>
                    <TokenIcon symbol={symbol} size={30} />
                  </div>
                ))}
              </div>
              <div>
                <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                  {row.title}
                  {row.demo && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold"
                      style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)' }}
                    >
                      Demo
                    </span>
                  )}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
                  {row.settings}
                  {twins > 1 && (
                    <span className="ml-1.5">
                      · same setup as {twins - 1} other {twins === 2 ? 'pool' : 'pools'}
                      {deepestOfSetup(row) && <span style={{ color: 'var(--c-text-muted)' }}>, deepest</span>}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Assets */}
            <div className="text-sm md:pl-0" style={{ color: 'var(--c-text-muted)' }}>
              <span className="md:hidden text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: 'var(--c-text-faint)' }}>Assets</span>
              {row.symbols.join(' · ')}
            </div>

            {/* TVL — the figure that ranks the table, so it carries the most weight */}
            <div className="text-left md:text-right">
              <span className="md:hidden text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: 'var(--c-text-faint)' }}>TVL</span>
              {row.tvl === null ? (
                <span className="text-sm" style={{ color: 'var(--c-text-faint)' }}>{row.demo ? 'Demo' : 'Unknown'}</span>
              ) : row.tvl > 0 ? (
                <span className="text-[15px] font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
                  {formatCurrency(row.tvl)}
                </span>
              ) : (
                <span className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
                  {row.mine ? 'Empty · seed it' : 'Empty'}
                </span>
              )}
            </div>

            {/* APY range — the only accent-colored figure */}
            <div className="text-left md:text-right">
              <span className="md:hidden text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: 'var(--c-text-faint)' }}>APY*</span>
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: row.apyKnown ? 'var(--c-accent)' : 'var(--c-text-faint)' }}
              >
                {row.apy}
              </span>
            </div>

            <ChevronRight size={18} strokeWidth={1.8} className="hidden md:block justify-self-end" style={{ color: 'var(--c-text-faint)' }} />
          </a>
        )
      })}
    </div>
  )
}
