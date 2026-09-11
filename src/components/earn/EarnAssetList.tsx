import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { FAMILY_ORDER, type AssetFamily } from '../../lib/stellar/config'
import { formatDepth, type EarnAsset } from '../../lib/stellar/earnAssets'
import TokenIcon from '../TokenIcon'

interface EarnAssetListProps {
  assets: EarnAsset[]
  /** Pools are still coming in, so more assets may join the list. */
  pending: boolean
  /** The asset whose icon is out in the deposit sheet right now. */
  lent: string | null
  onOpen: (asset: EarnAsset, icon: HTMLElement) => void
}

type Filter = 'all' | AssetFamily

// Invest: one row per token, however many pools hold it. The row shows the
// best rate on offer (or the depth, while no pool has a rate) and opens the
// deposit sheet, where the pool is chosen.
export default function EarnAssetList({ assets, pending, lent, onOpen }: EarnAssetListProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const families = FAMILY_ORDER.filter((f) => assets.some((a) => a.family === f))
  const active: Filter = filter !== 'all' && !families.includes(filter) ? 'all' : filter
  const q = search.trim().toLowerCase()
  const shown = assets.filter(
    (a) => (active === 'all' || a.family === active) && (!q || a.symbol.toLowerCase().includes(q)),
  )

  // One pill glides behind the active chip.
  const chipsRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const chip = chipsRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    const pill = pillRef.current
    if (!chip || !pill) return
    pill.style.left = `${chip.offsetLeft}px`
    pill.style.width = `${chip.offsetWidth}px`
  }, [active, families.length])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative sm:w-64 shrink-0">
          <Search
            size={15}
            strokeWidth={1.8}
            style={{ color: 'var(--c-text-faint)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search token"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl outline-none"
            style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>
        {families.length > 1 && (
          <div className="earn-chips-scroll">
            <div ref={chipsRef} className="earn-chips" role="group" aria-label="Asset family">
              <span ref={pillRef} className="earn-chip-pill" aria-hidden="true" />
              {(['all', ...families] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={active === f}
                  onClick={(e) => {
                    setFilter(f)
                    e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
                  }}
                >
                  {f === 'all' ? 'All assets' : f}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {shown.length === 0 && !pending ? (
        <div
          className="p-8 rounded-2xl text-center"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
            {q ? `No tokens match "${search}".` : 'No pools yet.'}
          </p>
        </div>
      ) : (
        <ul key={active} className="earn-assets">
          {shown.map((a, i) => {
            const n = a.offers.length
            return (
              <li key={a.address} className="earn-rise" style={{ '--i': Math.min(i, 12) } as CSSProperties}>
                <button
                  type="button"
                  data-earn-row={a.address}
                  className={`earn-asset${lent === a.address ? ' is-lent' : ''}`}
                  onClick={(e) => {
                    const icon = e.currentTarget.querySelector<HTMLElement>('[data-earn-icon]')
                    if (icon) onOpen(a, icon)
                  }}
                >
                  <span data-earn-icon className="flex">
                    <TokenIcon symbol={a.symbol} size={40} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: 'var(--c-text)' }}>
                      <span className="truncate">{a.symbol}</span>
                      {a.mine && <span className="earn-mine-dot" title="You have a position in one of its pools" />}
                    </span>
                    <span className="block text-[12.5px]" style={{ color: 'var(--c-text-muted)' }}>
                      {n} {n === 1 ? 'pool' : 'pools'}
                      {a.family ? ` · ${a.family}` : ''}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[10.5px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
                      {a.apy !== null ? (a.open.length > 1 ? 'up to' : 'APY') : a.best ? 'depth' : 'no open pool'}
                    </span>
                    <span
                      className="block text-[16px] font-semibold tabular-nums"
                      style={{
                        color: a.apy !== null ? 'var(--c-accent)' : a.best ? 'var(--c-text)' : 'var(--c-text-faint)',
                      }}
                    >
                      {a.apy !== null ? `${a.apy.toFixed(1)}%` : a.best ? formatDepth(a.depth, a.family) : 'Seed'}
                    </span>
                  </span>
                  <ChevronRight size={16} strokeWidth={1.8} className="earn-chev" />
                </button>
              </li>
            )
          })}
          {pending &&
            Array.from({ length: shown.length ? 1 : 3 }).map((_, i) => (
              <li key={`pending-${i}`} aria-hidden="true" className="px-4 py-3.5">
                <div className="h-10 rounded-xl animate-shimmer" style={{ backgroundColor: 'var(--c-surface-2)' }} />
              </li>
            ))}
        </ul>
      )}

      {assets.some((a) => a.apy !== null) && (
        <p className="text-[11px] text-center" style={{ color: 'var(--c-text-faint)' }}>
          APY figures are previews until live rates come in.
        </p>
      )}
    </div>
  )
}
