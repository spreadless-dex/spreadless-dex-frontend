import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { AssetFamily } from '../../lib/stellar/config'
import type { EarnPool } from '../../lib/stellar/earnPools'
import { formatDepth, type EarnOffer } from '../../lib/stellar/earnAssets'
import TokenIcon from '../TokenIcon'

interface PoolPickerProps {
  /** Every pool holding the asset, ranked: open ones first. */
  offers: EarnOffer[]
  symbol: string
  family: AssetFamily | undefined
  /** Address of the chosen pool. */
  selected: string | null
  /** The amount typed so far, for the "your share" line. */
  amount: number
  onSelect: (offer: EarnOffer) => void
  onSeed: (pool: EarnPool) => void
  /** Bumped to make every other open pool's radio ping once. */
  hint: number
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// The pools a deposit can go to, as a ladder: a bar under each row shows how
// it compares on what the list is ranked by (APY, or depth while there is no
// APY, drawn dashed). One selection frame travels between the rows instead of
// each row lighting up on its own. Tags say what sets a pool apart, so a lower
// rate can still be the one to pick.
export default function PoolPicker({ offers, symbol, family, selected, amount, onSelect, onSeed, hint }: PoolPickerProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const frameFrom = useRef<DOMRect | null>(null)

  // FLIP: the frame now sits in the new row; start it where the old one was.
  useLayoutEffect(() => {
    const from = frameFrom.current
    frameFrom.current = null
    const frame = listRef.current?.querySelector<HTMLElement>('.earn-frame')
    const row = frame?.parentElement
    if (!from || !frame || !row || reducedMotion()) return
    const to = row.getBoundingClientRect()
    frame.animate(
      [
        { top: `${from.top - to.top}px`, bottom: `${to.bottom - from.bottom}px` },
        { top: '0px', bottom: '0px' },
      ],
      { duration: 520, easing: 'cubic-bezier(0.32, 1.2, 0.52, 1)' },
    )
  }, [selected])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!hint || !list) return
    list.classList.remove('is-hinting')
    void list.offsetWidth
    list.classList.add('is-hinting')
  }, [hint])

  const open = offers.filter((o) => o.closed === null)
  const several = open.length > 1
  const maxTvl = Math.max(0, ...open.map((o) => o.tvl))
  const fees = open.flatMap((o) => (o.pool.feeBps === undefined ? [] : [o.pool.feeBps]))
  const minFee = fees.length ? Math.min(...fees) : undefined
  const feeTies = open.filter((o) => o.pool.feeBps === minFee).length

  const choose = (offer: EarnOffer) => {
    if (offer.pool.address === selected) return
    frameFrom.current = listRef.current?.querySelector('.earn-frame')?.getBoundingClientRect() ?? null
    onSelect(offer)
  }

  return (
    <ol ref={listRef} className="earn-pools">
      {offers.map((o, i) => {
        const p = o.pool
        const state = p.state
        if (!state) return null
        const on = p.address === selected
        const amp = state.amp ?? p.amp
        const tags: { label: string; strong?: boolean; mine?: boolean }[] = []
        if (!o.closed && several) {
          if (i === 0 && o.byApy) tags.push({ label: 'Best rate', strong: true })
          if (o.tvl === maxTvl) tags.push({ label: 'Deepest', strong: i === 0 && !o.byApy })
          if (minFee !== undefined && p.feeBps === minFee && feeTies === 1) tags.push({ label: 'Lowest fee' })
        }
        if (p.lp !== null && p.lp > 0n) tags.push({ label: 'Your position', mine: true })
        if (o.closed === 'paused') tags.push({ label: 'Paused' })

        const meta =
          o.closed === 'empty'
            ? 'Needs a first deposit'
            : o.closed === 'paused'
              ? 'Withdrawals only for now'
              : [amp !== undefined ? `A ${amp}` : null, p.feeBps !== undefined ? `${(p.feeBps / 100).toFixed(2)}% fee` : null]
                  .filter(Boolean)
                  .join(' · ')
        const others = state.tokens.filter((t) => t.address !== o.token.address)
        const share = amount > 0 ? (amount / (o.tvl + amount)) * 100 : 0

        const body = (
          <>
            <span className="earn-radio" aria-hidden="true" />
            <span className="earn-pool-name">
              <span className="truncate">{p.label}</span>
              {tags.map((t) => (
                <em
                  key={t.label}
                  className={`earn-tag${t.strong ? ' is-strong' : ''}${t.mine ? ' is-mine' : ''}`}
                >
                  {t.label}
                </em>
              ))}
            </span>
            <span className="earn-pool-fig">
              {o.closed === 'empty' ? (
                <button type="button" className="earn-seed" onClick={() => onSeed(p)}>
                  Seed
                </button>
              ) : (
                <>
                  <span
                    className="block tabular-nums"
                    style={
                      o.apy === null
                        ? { color: 'var(--c-text-muted)', fontWeight: 600, fontSize: 13 }
                        : { color: 'var(--c-accent)', fontWeight: 700, fontSize: 16 }
                    }
                  >
                    {o.apy === null ? 'No APY yet' : `${o.apy.toFixed(1)}%`}
                  </span>
                  <span className="block text-[12px] tabular-nums" style={{ color: 'var(--c-text-muted)' }}>
                    {formatDepth(o.tvl, family)} deep
                  </span>
                </>
              )}
            </span>
            <span className="earn-pool-meta">
              <span className="earn-stack" aria-hidden="true">
                <span className="earn-stack-me" data-hop-target>
                  <TokenIcon symbol={symbol} size={20} />
                </span>
                {others.slice(0, 4).map((t) => (
                  <TokenIcon key={t.address} symbol={t.symbol} size={20} />
                ))}
              </span>
              {meta && <span className="truncate">{meta}</span>}
            </span>
            {o.closed !== 'empty' && (
              <span className={`earn-bar${o.byApy ? '' : ' is-depth'}`} aria-hidden="true">
                <i />
              </span>
            )}
          </>
        )

        return (
          <li
            key={p.address}
            data-pool={p.address}
            className={`earn-pool${on ? ' is-on' : ''}${o.closed ? ' is-closed' : ''}${o.closed === 'empty' ? ' is-empty' : ''}`}
            style={{ '--i': i, '--s': o.score.toFixed(3) } as CSSProperties}
          >
            {on && <span className="earn-frame" aria-hidden="true" />}
            {o.closed === 'empty' ? (
              <div className="earn-pool-hit">{body}</div>
            ) : (
              <button
                type="button"
                className="earn-pool-hit"
                disabled={o.closed !== null}
                aria-pressed={on}
                onClick={() => choose(o)}
              >
                {body}
              </button>
            )}
            <div className="earn-pool-more">
              <div>
                <p>
                  {amount > 0 ? (
                    <span>
                      Your {amount.toLocaleString('en-US', { maximumFractionDigits: 7 })} {symbol} would be{' '}
                      <b className="tabular-nums">{share < 0.01 ? '<0.01' : share.toFixed(2)}%</b> of this pool
                    </span>
                  ) : (
                    <span>
                      {formatDepth(o.token.reserveHuman, family)} of it is {symbol}
                    </span>
                  )}
                  <span>No lockup</span>
                  <a href={p.href}>Pool page ›</a>
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
