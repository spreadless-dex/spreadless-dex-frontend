import { useAppStore } from '../store/useAppStore'
import { formatCurrency } from '../lib/utils'
import { getPoolPreviewStats } from '../lib/mockPoolStats'
import { useLocalPools } from '../lib/stellar/localPools'
import { tokenSymbol } from '../lib/stellar/registry'
import TokenIcon from './TokenIcon'
import { ChevronRight } from 'lucide-react'

// The genuine "Pools" view (issue #28): there is exactly ONE StableSwap pool
// behind every single-sided deposit, so the register lists it as a single row.
// Clicking opens the pool-wide detail page. As the register grows (more pools),
// this becomes a real multi-row table without structural changes.
export default function PoolsRegister() {
  const { poolState } = useAppStore()
  const localPools = useLocalPools((s) => s.pools)
  if (!poolState) return null

  const apys = poolState.tokens.map((t) => getPoolPreviewStats(t.symbol).apy)
  const apyLo = Math.min(...apys)
  const apyHi = Math.max(...apys)
  const apyRange = apyLo === apyHi ? `${apyLo.toFixed(1)}%` : `${apyLo.toFixed(1)}–${apyHi.toFixed(1)}%`

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
        <span className="text-right">TVL</span>
        <span className="text-right">APY*</span>
        <span />
      </div>

      <a
        href="/pools/stableswap"
        className="grid items-center gap-y-3 px-5 py-4 transition-colors hover:bg-[var(--c-surface-2)] grid-cols-2 md:grid-cols-[2fr_1.4fr_1fr_1fr_24px]"
      >
        {/* Pool identity */}
        <div className="flex items-center gap-3 col-span-2 md:col-span-1">
          <div className="flex items-center shrink-0">
            {poolState.tokens.map((t, i) => (
              <div key={t.address} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: poolState.tokens.length - i }}>
                <TokenIcon symbol={t.symbol} size={30} />
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              StableSwap Pool
            </p>
            <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
              A = {poolState.amp} · {poolState.paused ? 'Paused' : 'Active'}
            </p>
          </div>
        </div>

        {/* Assets */}
        <div className="text-sm md:pl-0" style={{ color: 'var(--c-text-muted)' }}>
          <span className="md:hidden text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: 'var(--c-text-faint)' }}>Assets</span>
          {poolState.tokens.map((t) => t.symbol).join(' · ')}
        </div>

        {/* TVL */}
        <div className="text-left md:text-right">
          <span className="md:hidden text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: 'var(--c-text-faint)' }}>TVL</span>
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
            {formatCurrency(poolState.totalTvl)}
          </span>
        </div>

        {/* APY range — the only accent-colored figure */}
        <div className="text-left md:text-right">
          <span className="md:hidden text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: 'var(--c-text-faint)' }}>APY*</span>
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--c-accent)' }}>
            {apyRange}
          </span>
        </div>

        <ChevronRight size={18} strokeWidth={1.8} className="hidden md:block justify-self-end" style={{ color: 'var(--c-text-faint)' }} />
      </a>

      {/* Pools created in this browser (see localPools.ts): real deploys and
          demo creations, both empty until seeded. They live here so the
          builder's result is visible immediately; the Factory registry
          replaces this list when it ships. */}
      {localPools.map((p) => (
        <a
          key={p.address}
          href={`/pools/v/${p.address}`}
          className="grid items-center gap-y-3 px-5 py-4 transition-colors hover:bg-[var(--c-surface-2)] grid-cols-2 md:grid-cols-[2fr_1.4fr_1fr_1fr_24px]"
          style={{ borderTop: '1px solid var(--c-border)' }}
        >
          <div className="flex items-center gap-3 col-span-2 md:col-span-1">
            <div className="flex items-center shrink-0">
              {p.tokens.map((address, i) => (
                <div key={address} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: p.tokens.length - i }}>
                  <TokenIcon symbol={tokenSymbol(address)} size={30} />
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                {p.label}
                {p.backend === 'demo' && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold"
                    style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)' }}
                  >
                    Demo
                  </span>
                )}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
                A = {p.amp} · {(p.feeBps / 100).toFixed(2)}% fee · yours
              </p>
            </div>
          </div>
          <div className="text-sm md:pl-0" style={{ color: 'var(--c-text-muted)' }}>
            <span className="md:hidden text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: 'var(--c-text-faint)' }}>Assets</span>
            {p.tokens.map((address) => tokenSymbol(address)).join(' · ')}
          </div>
          <div className="text-left md:text-right">
            <span className="md:hidden text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: 'var(--c-text-faint)' }}>TVL</span>
            <span className="text-sm" style={{ color: 'var(--c-text-muted)' }}>Empty · seed it</span>
          </div>
          <div className="text-left md:text-right">
            <span className="md:hidden text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: 'var(--c-text-faint)' }}>APY*</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--c-text-faint)' }}>—</span>
          </div>
          <ChevronRight size={18} strokeWidth={1.8} className="hidden md:block justify-self-end" style={{ color: 'var(--c-text-faint)' }} />
        </a>
      ))}
    </div>
  )
}
