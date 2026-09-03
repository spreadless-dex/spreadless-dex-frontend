import { useEffect, useState } from 'react'
import { fromRawUnits } from '../lib/stellar/units'
import { tokenDecimals, tokenSymbol } from '../lib/stellar/registry'
import { isOk, shortfallBps, type RouteResult } from '../lib/stellar/router'
import { isDemoVault, useRoutingDemo } from '../lib/stellar/demo'
import { ROUTER_CONTRACT_ID } from '../lib/stellar/config'
import RouteGraph, { type ExecutionView } from './RouteGraph'

interface Props {
  results: RouteResult[]
  bestId: string | null
  searching: boolean
  error: string | null
  /** Set once the user has committed to the winning route. Locks the panel open. */
  execution?: ExecutionView | null
}

// The demo switch is a testing aid for the team, never a product control. It
// shows in dev builds and on any URL opened with ?routing=demo.
const DEMO_AVAILABLE =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && localStorage.getItem('spreadless-routing-demo') === '1')

/**
 * The route row, expanded into the pathfinder's working.
 *
 * Collapsed by default when there is nothing to choose between. With a single
 * vault deployed there is exactly one route and this reads as the plain
 * "USDx → PYUSD" line it replaces. It opens itself the first time a swap has
 * more than one candidate, because that is the moment the choice becomes real,
 * and again when a route starts executing, because that is when the graph
 * shows the one thing a list cannot: the value crossing every pool at once.
 */
export default function RoutePanel({ results, bestId, searching, error, execution }: Props) {
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState(false)
  const multi = results.length > 1

  useEffect(() => {
    if (multi && !touched) setOpen(true)
  }, [multi, touched])
  useEffect(() => {
    if (execution) setOpen(true)
  }, [execution])

  const best = results.find((r) => r.candidate.id === bestId)
  const settledAny = results.some((r) => r.state !== 'pending')
  const shown = best ?? results[0]
  const path = shown?.candidate.path ?? []
  const bestHops = best?.candidate.hops.length ?? 0
  const bestIsDemo = best?.candidate.hops.some((h) => isDemoVault(h.vault)) ?? false

  return (
    <div
      className="rounded-xl mb-4"
      style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
    >
      <button
        onClick={() => {
          setTouched(true)
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        disabled={results.length === 0}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left disabled:cursor-default"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold min-w-0">
          {path.length === 0 ? (
            <span style={{ color: 'var(--c-text-faint)' }}>Route</span>
          ) : (
            path.map((token, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span style={{ color: 'var(--c-text-faint)', fontWeight: 400 }}>→</span>
                )}
                <span style={{ color: 'var(--c-text-muted)' }}>{tokenSymbol(token)}</span>
              </span>
            ))
          )}
        </span>
        <span className="flex items-center gap-2 flex-none">
          <RouteChip
            results={results}
            searching={searching}
            settledAny={settledAny}
            error={error}
            execution={execution}
          />
          {results.length > 0 && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                color: 'var(--c-text-faint)',
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform .22s cubic-bezier(.2,.8,.2,1)',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </span>
      </button>

      {open && results.length > 0 && (
        <div className="px-4 pb-4">
          <RouteGraph
            results={results}
            bestId={bestId}
            searching={!settledAny}
            execution={execution}
          />
          <ExecutionBanner execution={execution} hops={bestHops} />
          <div className="mt-1.5">
            {results.map((r) => (
              <CandidateRow
                key={r.candidate.id}
                result={r}
                isBest={r.candidate.id === bestId}
                settledAny={settledAny}
                bestOut={best && isOk(best) ? best.quote.amountOut : 0n}
              />
            ))}
          </div>
          {bestHops > 1 && !execution && (
            <AtomicNote demo={bestIsDemo} />
          )}
          {results.length > 1 && !execution && (
            <p className="learn-only text-[10px] mt-2.5 leading-relaxed" style={{ color: 'var(--c-text-faint)' }}>
              Intermediate amounts are simulated, not guaranteed. Only the final output is protected
              by the on-chain minimum below.
            </p>
          )}
        </div>
      )}

      {DEMO_AVAILABLE && <DemoControls hops={bestHops} locked={Boolean(execution)} />}
    </div>
  )
}

/** One line under the graph that says what the transaction will do, in the
 *  user's terms. How atomicity works is Learn mode only; that the Router is
 *  missing, or that nothing gets signed, holds in both modes. */
function AtomicNote({ demo }: { demo: boolean }) {
  if (!ROUTER_CONTRACT_ID && !demo) {
    return (
      <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
        This route needs the atomic Router, which is not deployed on testnet yet.
      </p>
    )
  }
  return (
    <>
      <p className="learn-only text-[10px] mt-2.5 leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
        Executed as <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>one transaction</span>
        . The Router holds the intermediate token for the duration of the call; if any leg fails,
        every leg is rolled back and nothing leaves your wallet.
      </p>
      {demo && !ROUTER_CONTRACT_ID && (
        <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: 'var(--c-text-faint)' }}>
          Demo vaults: nothing is signed.
        </p>
      )}
    </>
  )
}

function ExecutionBanner({ execution, hops }: { execution?: ExecutionView | null; hops: number }) {
  if (!execution) return null
  const legs = `${hops} leg${hops === 1 ? '' : 's'}`
  if (execution.state === 'running') {
    return (
      <p className="text-[11px] mt-1 text-center" style={{ color: 'var(--c-text-muted)' }}>
        One transaction, {legs}. Either every leg settles or none does.
      </p>
    )
  }
  if (execution.state === 'done') {
    return (
      <p className="text-[11px] mt-1 text-center font-medium" style={{ color: '#22c55e' }}>
        All {legs} settled atomically.
      </p>
    )
  }
  return (
    <p className="text-[11px] mt-1 text-center font-medium" style={{ color: '#ef4444' }}>
      {execution.failedHop
        ? `Leg ${execution.failedHop} failed. Every leg was rolled back.`
        : 'The route was rolled back. Nothing was executed.'}
    </p>
  )
}

function RouteChip({
  results,
  searching,
  settledAny,
  error,
  execution,
}: {
  results: RouteResult[]
  searching: boolean
  settledAny: boolean
  error: string | null
  execution?: ExecutionView | null
}) {
  const base = 'text-[10px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5'
  if (execution) {
    if (execution.state === 'running') {
      return (
        <span className={base} style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}>
          executing
        </span>
      )
    }
    if (execution.state === 'done') {
      return (
        <span className={base} style={{ color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}>
          settled
        </span>
      )
    }
    return (
      <span className={base} style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)' }}>
        rolled back
      </span>
    )
  }
  if (error) {
    return (
      <span className={base} style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)' }}>
        no route
      </span>
    )
  }
  if (searching || !settledAny) {
    return (
      <span
        className={base}
        style={{ color: 'var(--c-text-faint)', border: '1px solid var(--c-border-2)' }}
      >
        {results.length > 0 ? `simulating ${results.length}` : 'searching'}
      </span>
    )
  }
  const best = results.find((r) => isOk(r))
  const hops = best?.candidate.hops.length ?? 0
  return (
    <span
      className={base}
      style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
    >
      {hops === 1 ? 'direct' : `${hops} hops`}
    </span>
  )
}

function CandidateRow({
  result,
  isBest,
  settledAny,
  bestOut,
}: {
  result: RouteResult
  isBest: boolean
  settledAny: boolean
  bestOut: bigint
}) {
  const { candidate } = result
  const outToken = candidate.path[candidate.path.length - 1]
  const dimmed = settledAny && !isBest && result.state !== 'pending'
  const bps = shortfallBps(result, bestOut)

  return (
    <div
      className="grid items-baseline gap-2.5 py-2"
      style={{
        gridTemplateColumns: '12px minmax(0,1fr) auto',
        borderTop: '1px solid var(--c-border)',
        opacity: dimmed ? 0.5 : 1,
        transition: 'opacity .3s ease',
      }}
    >
      <span className="text-[10px]" style={{ color: isBest ? 'var(--c-text)' : 'var(--c-text-faint)' }}>
        {isBest && settledAny ? '●' : '○'}
      </span>

      <span className="min-w-0">
        <span className="text-xs font-semibold block truncate" style={{ color: 'var(--c-text)' }}>
          {candidate.path.map(tokenSymbol).join(' → ')}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--c-text-faint)' }}>
          {candidate.hops
            .map((h) => (isDemoVault(h.vault) ? `${h.vaultLabel} (demo)` : h.vaultLabel))
            .join(' · ')}
        </span>
      </span>

      <span className="text-right">
        {result.state === 'pending' ? (
          <span
            className="inline-block rounded animate-shimmer"
            style={{ width: 64, height: 9, backgroundColor: 'var(--c-border)' }}
          />
        ) : result.state === 'failed' ? (
          <>
            <span className="text-xs font-semibold block" style={{ color: '#ef4444' }}>
              Leg {result.failedHop + 1} reverts
            </span>
            <span className="text-[10px]" style={{ color: '#ef4444' }}>
              route dropped
            </span>
          </>
        ) : (
          <>
            <span
              className="text-xs font-semibold block tabular-nums"
              style={{ color: 'var(--c-text)' }}
            >
              {fromRawUnits(result.quote.amountOut, tokenDecimals(outToken))} {tokenSymbol(outToken)}
            </span>
            {isBest && settledAny ? (
              <span
                className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5"
                style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
              >
                Best price
              </span>
            ) : bps !== null && bps > 0 ? (
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--c-text-faint)' }}>
                −{bps.toFixed(1)} bps
              </span>
            ) : null}
          </>
        )}
      </span>
    </div>
  )
}

// Team-only strip: adds the Tranche 2 vaults locally and lets a tester make
// the next execution revert at a chosen leg, which is acceptance criterion 3
// of the Router deliverable made visible.
function DemoControls({ hops, locked }: { hops: number; locked: boolean }) {
  const { enabled, failHop, setEnabled, setFailHop } = useRoutingDemo()
  const pill = 'text-[10px] font-semibold rounded-full px-2 py-0.5 transition-colors disabled:opacity-40'
  return (
    <div
      className="flex items-center justify-between gap-2 px-4 py-2 flex-wrap"
      style={{ borderTop: '1px dashed var(--c-border-2)' }}
    >
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-faint)' }}>
        Routing demo
      </span>
      <span className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          disabled={locked}
          onClick={() => setEnabled(!enabled)}
          className={pill}
          style={
            enabled
              ? { backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }
              : { border: '1px solid var(--c-border-2)', color: 'var(--c-text-muted)' }
          }
        >
          Vaults A + B {enabled ? 'on' : 'off'}
        </button>
        {enabled && hops > 1 && (
          <>
            <span className="text-[10px]" style={{ color: 'var(--c-text-faint)' }}>
              fail at
            </span>
            {Array.from({ length: hops }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled={locked}
                onClick={() => setFailHop(failHop === n ? null : n)}
                className={pill}
                style={
                  failHop === n
                    ? { backgroundColor: '#ef4444', color: '#fff' }
                    : { border: '1px solid var(--c-border-2)', color: 'var(--c-text-muted)' }
                }
              >
                leg {n}
              </button>
            ))}
          </>
        )}
      </span>
    </div>
  )
}
