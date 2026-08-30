import { useEffect, useRef, useState } from 'react'
import { tokenSymbol } from '../lib/stellar/registry'
import { type RouteResult } from '../lib/stellar/router'

// Start and destination exist once and every candidate fans out between them.
// A stacked list would repeat the same two tokens on every row and hide the one
// thing the picture is for: that the paths split and converge.

const W = 520
const NODE_R = 20
const X_SRC = 40
const X_DST = W - 40
const LANE_GAP = 62

type EdgeState = 'pending' | 'live' | 'win' | 'lose' | 'dead' | 'running' | 'done' | 'rolled'

/**
 * What the graph shows once the user has committed to the winning route.
 * `running`: the transaction is in flight, value travels along the route.
 * `done`: settled, every leg filled. `reverted`: the leg at `failedHop`
 * (1-based) failed and the earlier legs were rolled back with it.
 */
export interface ExecutionView {
  state: 'running' | 'done' | 'reverted'
  failedHop?: number | null
}

interface Props {
  results: RouteResult[]
  bestId: string | null
  /** True while candidates are known but nothing has settled yet. */
  searching: boolean
  execution?: ExecutionView | null
}

// Center lane first, then alternating above/below, so a single direct route sits
// on the axis, which reads as "straight through".
function laneOffsets(count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const step = Math.ceil(i / 2)
    out.push(i === 0 ? 0 : (i % 2 === 1 ? -step : step) * LANE_GAP)
  }
  return out
}

function edgeState(
  r: RouteResult,
  hop: number,
  bestId: string | null,
  settledAny: boolean,
  execution: ExecutionView | null | undefined,
): EdgeState {
  if (r.state === 'pending') return 'pending'
  if (r.state === 'failed') return hop === r.failedHop ? 'dead' : 'lose'
  if (!settledAny) return 'live'
  const winner = r.candidate.id === bestId
  if (execution && winner) {
    if (execution.state === 'running') return 'running'
    if (execution.state === 'done') return 'done'
    const failed = execution.failedHop ?? r.candidate.hops.length
    return hop + 1 === failed ? 'dead' : 'rolled'
  }
  return winner ? 'win' : 'lose'
}

/** Cubic that leaves the source horizontally and arrives at the target horizontally. */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `M ${x1} ${y1} L ${x2} ${y2}`
  const dx = Math.max(48, (x2 - x1) * 0.45)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`
}

export default function RouteGraph({ results, bestId, searching, execution }: Props) {
  const offsets = laneOffsets(results.length)
  const spread = offsets.length ? Math.max(...offsets.map(Math.abs)) : 0
  const H = 2 * (spread + NODE_R + 18)
  const cy = H / 2
  const settledAny = results.some((r) => r.state !== 'pending')

  // Geometry of the winning route, reused for the travelling pulse while the
  // transaction is in flight: the value is one thing moving through several
  // pools, so it is drawn as one dot crossing every leg in order.
  const winnerIdx = results.findIndex((r) => r.candidate.id === bestId)
  const winner = winnerIdx >= 0 ? results[winnerIdx] : null
  const pulsePath =
    winner && execution?.state === 'running'
      ? winnerPath(winner, cy + offsets[winnerIdx], cy)
      : null

  const aria = execution
    ? execution.state === 'running'
      ? 'Executing the route'
      : execution.state === 'done'
        ? 'Route settled'
        : 'Route reverted'
    : searching
      ? 'Searching for routes'
      : `${results.length} route${results.length === 1 ? '' : 's'} compared`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto block"
      role="img"
      aria-label={aria}
      style={{ overflow: 'visible' }}
    >
      {/* Edges under nodes, so a node always covers the line it terminates. */}
      <g>
        {results.map((r, i) => {
          const y = cy + offsets[i]
          const n = r.candidate.hops.length
          return r.candidate.hops.map((hop, h) => {
            // Intermediate nodes sit evenly between source and destination.
            const xAt = (k: number) =>
              k === 0 ? X_SRC : k === n ? X_DST : X_SRC + ((X_DST - X_SRC) * k) / n
            const startX = xAt(h) + NODE_R + (h === 0 ? 2 : 1)
            const endX = xAt(h + 1) - NODE_R - (h === n - 1 ? 2 : 1)
            const startY = h === 0 ? cy : y
            const endY = h === n - 1 ? cy : y
            const state = edgeState(r, h, bestId, settledAny, execution)
            return (
              <Edge
                key={`${r.candidate.id}:${h}`}
                d={curve(startX, startY, endX, endY)}
                state={state}
                delayMs={i * 90 + h * 70}
                label={hop.feeBps !== undefined ? `${hop.vaultLabel} · ${hop.feeBps} bps` : hop.vaultLabel}
                labelX={(startX + endX) / 2}
                labelY={(startY + endY) / 2 + (y <= cy ? -11 : 15)}
              />
            )
          })
        })}
      </g>

      {/* Intermediate nodes */}
      <g>
        {results.map((r, i) => {
          const y = cy + offsets[i]
          const n = r.candidate.hops.length
          const on = r.candidate.id === bestId && settledAny
          const failedAt = execution?.state === 'reverted' && on ? (execution.failedHop ?? n) : null
          return r.candidate.path.slice(1, -1).map((token, k) => (
            <Node
              key={`${r.candidate.id}:n${k}`}
              cx={X_SRC + ((X_DST - X_SRC) * (k + 1)) / n}
              cy={y}
              label={tokenSymbol(token)}
              on={on && !(failedAt !== null && k + 1 >= failedAt)}
              dead={failedAt !== null && k + 1 >= failedAt}
            />
          ))
        })}
      </g>

      {/* Terminals */}
      {results[0] && (
        <>
          <Node cx={X_SRC} cy={cy} label={tokenSymbol(results[0].candidate.path[0])} terminal />
          <Node
            cx={X_DST}
            cy={cy}
            label={tokenSymbol(results[0].candidate.path[results[0].candidate.path.length - 1])}
            terminal
            dead={execution?.state === 'reverted'}
          />
        </>
      )}

      {pulsePath && <Pulse d={pulsePath} />}
    </svg>
  )
}

/** The winning route as one continuous path from source to destination. */
function winnerPath(r: RouteResult, laneY: number, cy: number): string {
  const n = r.candidate.hops.length
  const xAt = (k: number) => (k === 0 ? X_SRC : k === n ? X_DST : X_SRC + ((X_DST - X_SRC) * k) / n)
  let d = ''
  for (let h = 0; h < n; h++) {
    const startY = h === 0 ? cy : laneY
    const endY = h === n - 1 ? cy : laneY
    const x1 = xAt(h)
    const x2 = xAt(h + 1)
    if (h === 0) d += `M ${x1} ${startY} `
    if (startY === endY) d += `L ${x2} ${endY} `
    else {
      const dx = Math.max(48, (x2 - x1) * 0.45)
      d += `C ${x1 + dx} ${startY} ${x2 - dx} ${endY} ${x2} ${endY} `
    }
  }
  return d.trim()
}

// A dot that runs the whole route on a loop for as long as the transaction is
// in flight. It is the only moving thing on the graph at that point, which is
// what makes "one transaction, several pools" legible without a caption.
function Pulse({ d }: { d: string }) {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced) return null
  return (
    <g>
      <circle r="4.5" fill="var(--c-text)">
        <animateMotion dur="1.6s" repeatCount="indefinite" path={d} calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" />
      </circle>
      <circle r="9" fill="var(--c-text)" opacity="0.14">
        <animateMotion dur="1.6s" repeatCount="indefinite" path={d} calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" />
      </circle>
    </g>
  )
}

const EDGE_STYLE: Record<EdgeState, { stroke: string; width: number; dash?: string; opacity: number }> = {
  pending: { stroke: 'var(--c-border-2)', width: 1.25, dash: '3 4', opacity: 1 },
  live: { stroke: 'var(--c-text-faint)', width: 1.25, opacity: 1 },
  win: { stroke: 'var(--c-text)', width: 2.25, opacity: 1 },
  lose: { stroke: 'var(--c-border-2)', width: 1.25, opacity: 0.85 },
  dead: { stroke: '#ef4444', width: 1.5, dash: '2 5', opacity: 0.85 },
  // In flight: the winner stays solid and heavy while the pulse runs over it.
  running: { stroke: 'var(--c-text)', width: 2.25, opacity: 1 },
  done: { stroke: '#22c55e', width: 2.5, opacity: 1 },
  // A leg that filled and was then unwound. Drawn like a pending leg: it is
  // back to being a possibility, not a fact.
  rolled: { stroke: 'var(--c-text-faint)', width: 1.5, dash: '3 4', opacity: 0.9 },
}

interface EdgeProps {
  d: string
  state: EdgeState
  delayMs: number
  label: string
  labelX: number
  labelY: number
}

function Edge({ d, state, delayMs, label, labelX, labelY }: EdgeProps) {
  const ref = useRef<SVGPathElement>(null)
  const started = useRef(false)
  // The draw-in owns strokeDasharray while it runs, so the dash *pattern* that
  // marks a pending or reverted edge can only be applied once it has finished,
  // hence real state, not a ref: the handover needs a re-render.
  const [drawn, setDrawn] = useState(false)

  // The line draws itself in once, on the tick the candidate becomes known.
  // Everything after is a state change on an already-drawn path, so a route
  // settling never re-animates its geometry.
  useEffect(() => {
    const path = ref.current
    if (!path || started.current) return
    started.current = true

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setDrawn(true)
      return
    }

    const len = path.getTotalLength()
    path.style.strokeDasharray = `${len}`
    path.style.strokeDashoffset = `${len}`
    const start = setTimeout(() => {
      path.style.transition = 'stroke-dashoffset .5s cubic-bezier(.4,0,.2,1)'
      path.style.strokeDashoffset = '0'
    }, delayMs)
    const handover = setTimeout(() => {
      path.style.transition = ''
      path.style.strokeDasharray = ''
      path.style.strokeDashoffset = ''
      setDrawn(true)
    }, delayMs + 560)
    return () => {
      clearTimeout(start)
      clearTimeout(handover)
    }
  }, [delayMs])

  const s = EDGE_STYLE[state]
  const labelFill =
    state === 'dead'
      ? '#ef4444'
      : state === 'win' || state === 'running' || state === 'done'
        ? 'var(--c-text-muted)'
        : 'var(--c-text-faint)'
  return (
    <g>
      <path
        ref={ref}
        d={d}
        fill="none"
        strokeLinecap="round"
        stroke={s.stroke}
        strokeWidth={s.width}
        opacity={s.opacity}
        style={{
          // Dashes mark pending and reverted edges; a settled edge is solid.
          strokeDasharray: drawn ? (s.dash ?? 'none') : undefined,
          transition: 'stroke .3s ease, stroke-width .3s ease, opacity .3s ease',
        }}
      />
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        fontSize="8"
        letterSpacing="0.03em"
        fill={labelFill}
        style={{ transition: 'fill .3s ease' }}
      >
        {label}
      </text>
    </g>
  )
}

function Node({
  cx,
  cy,
  label,
  on,
  terminal,
  dead,
}: {
  cx: number
  cy: number
  label: string
  on?: boolean
  terminal?: boolean
  dead?: boolean
}) {
  const stroke = dead ? '#ef4444' : terminal || on ? 'var(--c-text)' : 'var(--c-border-2)'
  return (
    <g style={{ transition: 'opacity .3s ease' }}>
      <circle
        cx={cx}
        cy={cy}
        r={NODE_R}
        fill={terminal ? (dead ? 'var(--c-surface-2)' : 'var(--c-text)') : 'var(--c-surface-2)'}
        stroke={stroke}
        strokeWidth={terminal || on || dead ? 2 : 1.25}
        strokeDasharray={dead ? '3 3' : undefined}
        style={{ transition: 'stroke .3s ease, stroke-width .3s ease, fill .3s ease' }}
      />
      <text
        x={cx}
        y={cy + 3.5}
        textAnchor="middle"
        fontSize="9.5"
        fontWeight={600}
        fill={
          dead
            ? '#ef4444'
            : terminal
              ? 'var(--c-surface-2)'
              : on
                ? 'var(--c-text)'
                : 'var(--c-text-muted)'
        }
        style={{ transition: 'fill .3s ease' }}
      >
        {label}
      </text>
    </g>
  )
}
