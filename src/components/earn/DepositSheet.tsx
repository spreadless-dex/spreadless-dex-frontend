import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { EarnPool } from '../../lib/stellar/earnPools'
import { formatFamilyAmount, type EarnAsset, type EarnOffer } from '../../lib/stellar/earnAssets'
import { depositSingleSided, quoteDepositSingleSided, LP_DECIMALS } from '../../lib/stellar/pool'
import { getTokenBalance } from '../../lib/stellar/token'
import { fromRawUnits, toRawUnits } from '../../lib/stellar/units'
import { refetchUntilChanged } from '../../lib/stellar/refetch'
import { mapTxError } from '../../lib/stellar/errors'
import type { TxPhase } from '../../lib/stellar/types'
import { recordDeposit } from '../../lib/activity/record'
import RainButton from '../RainButton'
import TxStatus, { type TxUiStatus } from '../TxStatus'
import TokenIcon from '../TokenIcon'
import ExplorerLink from '../ExplorerLink'
import Odometer from './Odometer'
import PoolPicker from './PoolPicker'
import { hopToken } from './hop'

interface DepositSheetProps {
  asset: EarnAsset
  /**
   * Opened inside a view transition (see PoolsPage): the sheet shows up in its
   * final place at once and the transition animates it, with the tapped
   * row's icon flying into the header.
   */
  viaTransition: boolean
  onRequestClose: (opts?: { dragged?: boolean }) => void
  onSeed: (pool: EarnPool) => void
  /** A deposit landed in this pool; the caller re-reads it. */
  onLanded: (poolAddress: string) => void
}

interface Done {
  amount: string
  offer: EarnOffer
  lp: string
  hash: string
}

/** Clear the names a view-transition open gave the sheet, once it has run. */
export function settleSheetTransition() {
  const sheet = document.querySelector<HTMLElement>('[data-earn-sheet]')
  const icon = document.querySelector<HTMLElement>('[data-sheet-icon]')
  if (sheet) {
    sheet.style.viewTransitionName = ''
    sheet.classList.remove('is-vt')
  }
  if (icon) icon.style.viewTransitionName = ''
}

const DRAG_CLOSE_PX = 120
const DRAG_CLOSE_VELOCITY = 0.7

// The deposit sheet: a bottom sheet on a phone, a dialog on a desktop. The
// asset is fixed, the pool is a choice. The best pool is preselected so a
// deposit takes an amount and one tap; the ladder underneath lets the user
// pick any other open pool, and the token hops into whichever they choose.
export default function DepositSheet({ asset, viaTransition, onRequestClose, onSeed, onLanded }: DepositSheetProps) {
  const { walletConnected, walletAddress, connectWallet, loadPoolState } = useAppStore()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const iconRef = useRef<HTMLSpanElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const [selected, setSelected] = useState<string | null>(asset.best?.pool.address ?? null)
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState<bigint | null>(null)
  const [quote, setQuote] = useState('')
  const [quoting, setQuoting] = useState(false)
  const [status, setStatus] = useState<TxUiStatus>({ kind: 'idle' })
  const [txPhase, setTxPhase] = useState<TxPhase | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [hint, setHint] = useState(0)

  const busy = txPhase !== null
  const offer = asset.open.find((o) => o.pool.address === selected) ?? null
  const num = Number(amount) > 0 ? Number(amount) : 0
  const apy = offer?.apy ?? null

  // Pools keep landing and refreshing while the sheet is open. The choice
  // stays as long as that pool still takes deposits.
  useEffect(() => {
    if (!offer && asset.best) setSelected(asset.best.pool.address)
  }, [offer, asset.best])

  useLayoutEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (viaTransition) {
      el.classList.add('is-vt')
      el.style.viewTransitionName = 'earn-sheet'
      if (iconRef.current) iconRef.current.style.viewTransitionName = 'earn-token'
    }
    if (!el.open) el.showModal()
    // On a phone the keyboard would cover the pools, so only a mouse gets focus.
    if (matchMedia('(pointer: fine)').matches) amountRef.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── The hop ──
  const cancelHop = useRef<() => void>(() => {})
  const hopTo = useCallback((address: string | null, delay = 0) => {
    cancelHop.current()
    const host = dialogRef.current
    const src = iconRef.current
    const target = address
      ? listRef.current?.querySelector<HTMLElement>(`[data-pool="${address}"] [data-hop-target]`)
      : null
    if (!host || !src || !target) return
    cancelHop.current = hopToken(src, target, host, delay)
  }, [])

  // Once the sheet has landed, the token hops on into the preselected pool.
  useEffect(() => {
    hopTo(selected, 420)
    return () => cancelHop.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Wallet reads ──
  useEffect(() => {
    if (!walletAddress) {
      setBalance(null)
      return
    }
    let live = true
    getTokenBalance(asset.address, walletAddress, asset.decimals)
      .then((b) => live && setBalance(b))
      .catch((err) => {
        console.error('Earn: balance read failed:', err)
        if (live) setBalance(null)
      })
    return () => {
      live = false
    }
  }, [walletAddress, asset.address, asset.decimals])

  // "You receive ~X LP" before committing, against the chosen pool. The
  // simulation runs as the connected account, so no wallet means no quote.
  const poolId = offer?.pool.address
  const tokenIndex = offer?.token.index
  useEffect(() => {
    setQuote('')
    if (!walletAddress || !poolId || tokenIndex === undefined || !amount) {
      setQuoting(false)
      return
    }
    const raw = toRawUnits(amount, asset.decimals)
    if (raw <= 0n) {
      setQuoting(false)
      return
    }
    let live = true
    setQuoting(true)
    const timer = setTimeout(async () => {
      try {
        const lp = await quoteDepositSingleSided({ to: walletAddress, tokenIndex, amount: raw, poolId })
        if (live) setQuote(fromRawUnits(lp, LP_DECIMALS))
      } catch (err) {
        // e.g. more than the wallet holds: no quote rather than an error mid-typing
        console.error('Earn: deposit quote failed:', err)
      } finally {
        if (live) setQuoting(false)
      }
    }, 400)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [walletAddress, amount, poolId, tokenIndex, asset.decimals])

  const insufficient =
    walletConnected && balance !== null && num > 0 && toRawUnits(amount, asset.decimals) > balance

  const handleDeposit = async () => {
    if (!walletAddress || !offer || num <= 0) return
    const target = offer
    const amt = amount
    setStatus({ kind: 'idle' })
    try {
      const { result, hash } = await depositSingleSided({
        to: walletAddress,
        tokenIndex: target.token.index,
        amount: toRawUnits(amt, asset.decimals),
        onPhase: setTxPhase,
        poolId: target.pool.address,
      })
      const lp = fromRawUnits(result, LP_DECIMALS)
      recordDeposit({
        walletAddress,
        status: 'completed',
        symbol: asset.symbol,
        amount: amt,
        lpReceived: lp,
        txHash: hash,
      }).catch((err) => console.error('Failed to record activity:', err))
      setDone({ amount: amt, offer: target, lp, hash })
      setAmount('')
      if (target.pool.isConfigPool) loadPoolState()
      onLanded(target.pool.address)
      refetchUntilChanged(() => getTokenBalance(asset.address, walletAddress, asset.decimals), balance)
        .then(setBalance)
        .catch(() => {})
    } catch (err) {
      console.error('Deposit failed:', err)
      const mapped = mapTxError(err, { spend: asset.symbol })
      setStatus({ kind: 'error', ...mapped })
      recordDeposit({
        walletAddress,
        status: 'failed',
        symbol: asset.symbol,
        amount: amt,
        detail: mapped.message,
      }).catch((e) => console.error('Failed to record activity:', e))
    } finally {
      setTxPhase(null)
    }
  }

  // ── Closing ──
  const requestClose = (opts?: { dragged?: boolean }) => {
    if (busy) return
    cancelHop.current()
    onRequestClose(opts)
  }

  // Drag the sheet down by its handle or header to dismiss it; upwards it
  // gives a little and springs back.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null)
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button') || matchMedia('(min-width: 640px)').matches) return
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 }
    dialogRef.current?.classList.add('is-drag')
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    const el = dialogRef.current
    if (!d || !el) return
    const raw = e.clientY - d.y
    d.dy = raw > 0 ? raw : -Math.sqrt(-raw) * 2
    el.style.translate = `0 ${d.dy}px`
  }
  const onPointerUp = () => {
    const d = drag.current
    const el = dialogRef.current
    drag.current = null
    if (!d || !el) return
    const velocity = d.dy / Math.max(1, performance.now() - d.t)
    el.classList.remove('is-drag')
    el.style.translate = ''
    if ((d.dy > DRAG_CLOSE_PX || velocity > DRAG_CLOSE_VELOCITY) && !busy) requestClose({ dragged: true })
  }
  const dragHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  }

  // Scrolling the pools quietly compacts the form above them.
  const scrollRaf = useRef(0)
  const onListScroll = () => {
    cancelAnimationFrame(scrollRaf.current)
    scrollRaf.current = requestAnimationFrame(() => {
      const top = listRef.current?.scrollTop ?? 0
      dialogRef.current?.style.setProperty('--p', Math.min(1, top / 90).toFixed(3))
    })
  }

  const select = (o: EarnOffer) => {
    setSelected(o.pool.address)
    setStatus({ kind: 'idle' })
    hopTo(o.pool.address)
    navigator.vibrate?.(6)
  }

  const showChoices = () => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    setHint((n) => n + 1)
  }

  const setPercent = (pct: bigint) => {
    if (balance === null) return
    setAmount(fromRawUnits((balance * pct) / 100n, asset.decimals))
  }

  const onAmountInput = (value: string) => {
    let clean = value.replace(',', '.').replace(/[^\d.]/g, '')
    const dot = clean.indexOf('.')
    if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, asset.decimals)
    setAmount(clean)
  }

  const openCount = asset.open.length
  const anyApy = asset.open.some((o) => o.apy !== null)
  const why = !openCount
    ? 'None take deposits yet'
    : openCount === 1
      ? `The only open pool for ${asset.symbol}`
      : `${openCount} options · ${anyApy ? 'by APY' : 'by depth'}`

  const ctaClass =
    'w-full h-[52px] text-[15px] font-semibold rounded-2xl btn-lift disabled:opacity-40 disabled:cursor-not-allowed'
  const ctaStyle = { backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }

  return (
    <dialog
      ref={dialogRef}
      data-earn-sheet
      className="earn-sheet"
      aria-labelledby="earn-sheet-title"
      onCancel={(e) => {
        e.preventDefault()
        requestClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div className="earn-grab" aria-hidden="true" {...dragHandlers}>
        <span />
      </div>
      <header className="earn-sheet-head" {...dragHandlers}>
        <span ref={iconRef} data-sheet-icon className="flex shrink-0">
          <TokenIcon symbol={asset.symbol} size={44} />
        </span>
        <div className="min-w-0">
          <h2 id="earn-sheet-title" className="text-[20px] font-bold leading-tight tracking-tight truncate">
            {asset.symbol}
          </h2>
          <p className="text-[12.5px]" style={{ color: 'var(--c-text-muted)' }}>
            {asset.family ?? 'Token'} · in {asset.offers.length} {asset.offers.length === 1 ? 'pool' : 'pools'}
          </p>
        </div>
        <button type="button" className="earn-sheet-x" aria-label="Close" onClick={() => requestClose()}>
          <X size={16} strokeWidth={2.2} />
        </button>
      </header>

      {done ? (
        <section className="earn-done">
          <svg className="earn-check" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="32" cy="32" r="28" />
            <path d="m21 33 7.5 7.5L44 25" />
          </svg>
          <h3 className="text-[22px] font-bold tracking-tight">Deposited</h3>
          <p className="text-[14px] max-w-[34ch]" style={{ color: 'var(--c-text-muted)' }}>
            {done.amount} {asset.symbol} now works in{' '}
            <b style={{ color: 'var(--c-text)' }}>{done.offer.pool.label}</b>
            {done.offer.apy !== null && (
              <>
                {' '}at <span style={{ color: 'var(--c-accent)' }}>{done.offer.apy.toFixed(1)}% APY</span>
              </>
            )}
            . You received {done.lp} LP shares.
          </p>
          <span style={{ color: 'var(--c-text-muted)' }}>
            <ExplorerLink hash={done.hash} />
          </span>
          <div className="grid grid-cols-2 gap-2 w-full mt-2">
            <button
              type="button"
              onClick={() => {
                setDone(null)
                setStatus({ kind: 'idle' })
              }}
              className="h-[50px] rounded-2xl text-[14px] font-semibold"
              style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            >
              Deposit more
            </button>
            <button type="button" onClick={() => requestClose()} className={ctaClass} style={ctaStyle}>
              Done
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="earn-sheet-form">
            <label className="earn-amount">
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                aria-label={`Amount of ${asset.symbol}`}
                value={amount}
                onChange={(e) => onAmountInput(e.target.value)}
              />
              <span>{asset.symbol}</span>
            </label>
            {walletConnected && (
              <div className="earn-balance">
                <span className="tabular-nums">
                  Balance {balance !== null ? fromRawUnits(balance, asset.decimals) : '—'} {asset.symbol}
                </span>
                {balance !== null && balance > 0n && (
                  <div className="flex gap-1">
                    {([25n, 50n, 100n] as const).map((pct) => (
                      <button key={String(pct)} type="button" className="earn-pct" onClick={() => setPercent(pct)}>
                        {pct === 100n ? 'Max' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="earn-yield">
              <div>
                <p className="earn-label">{apy !== null ? 'Preview APY' : 'APY'}</p>
                <Odometer
                  value={apy !== null ? `${apy.toFixed(1)}%` : '—'}
                  className="earn-big"
                  style={{ color: apy !== null ? 'var(--c-accent)' : 'var(--c-text-faint)' }}
                />
              </div>
              <span className="earn-yield-rule" aria-hidden="true" />
              <div>
                <p className="earn-label">Earned per year</p>
                <Odometer
                  value={apy !== null ? formatFamilyAmount((num * apy) / 100, asset.family) : '—'}
                  className="earn-big"
                  style={{ color: apy !== null ? 'var(--c-text)' : 'var(--c-text-faint)' }}
                />
              </div>
            </div>
            {walletConnected && num > 0 && offer && (
              <p className="earn-quote">
                <span>You receive</span>
                <span className="tabular-nums" style={{ color: 'var(--c-text)', fontWeight: 600 }}>
                  {quoting ? 'Fetching quote…' : quote ? `≈ ${quote} LP shares` : '—'}
                </span>
              </p>
            )}
          </div>

          <div className="earn-list-head">
            <b>{openCount > 1 ? 'Choose a pool' : 'Pool'}</b>
            <span>{why}</span>
          </div>
          <div ref={listRef} className="earn-list" onScroll={onListScroll}>
            <PoolPicker
              offers={asset.offers}
              symbol={asset.symbol}
              family={asset.family}
              selected={offer?.pool.address ?? null}
              amount={num}
              onSelect={select}
              onSeed={onSeed}
              hint={hint}
            />
          </div>

          <footer className="earn-sheet-foot">
            {!walletConnected ? (
              <button type="button" onClick={connectWallet} className={ctaClass} style={ctaStyle}>
                Log in to deposit
              </button>
            ) : !offer ? (
              <button type="button" disabled className={ctaClass} style={ctaStyle}>
                No pool takes deposits yet
              </button>
            ) : insufficient ? (
              <button type="button" disabled className={ctaClass} style={ctaStyle}>
                Not enough {asset.symbol}
              </button>
            ) : (
              <RainButton onClick={handleDeposit} disabled={num <= 0} className={ctaClass} style={ctaStyle}>
                {num > 0 ? `Deposit ${amount} ${asset.symbol}` : 'Enter an amount'}
              </RainButton>
            )}
            <TxStatus phase={txPhase} status={status} />
            <p key={offer?.pool.address ?? 'none'} className="earn-via">
              {offer ? (
                <>
                  into <b>{offer.pool.label}</b>
                  {offer.apy !== null && (
                    <>
                      {' '}at <span className="tabular-nums" style={{ color: 'var(--c-accent)' }}>{offer.apy.toFixed(1)}%</span>
                    </>
                  )}
                  {openCount > 1 && (
                    <button type="button" className="earn-change" onClick={showChoices}>
                      Change
                    </button>
                  )}
                </>
              ) : (
                'A pool’s first deposit has to fund every asset. Seed one to open it.'
              )}
            </p>
          </footer>
        </>
      )}
    </dialog>
  )
}
