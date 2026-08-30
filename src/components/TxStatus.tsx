import type { TxPhase } from '../lib/stellar/types'
import ExplorerLink from './ExplorerLink'

// Shared transaction status UI for Swap, Deposit/Withdraw and Faucet: a
// three-step lifecycle while the tx is in flight, then the success or
// mapped-error message. One component so every flow reads the same.

export type TxUiStatus =
  | { kind: 'idle' }
  | { kind: 'success'; message: string; hash: string }
  | { kind: 'error'; message: string; detail?: string }

interface TxStatusProps {
  phase: TxPhase | null
  status: TxUiStatus
  /** Replaces the per-phase hint while in flight, e.g. for a routed swap. */
  hint?: Partial<Record<TxPhase, string>>
}

const STEPS = ['Confirm in wallet', 'Submitting', 'Confirmed'] as const

// Which step is active per phase. `preparing` (simulating, before the wallet
// opens) also points at step 0 — the hint text below tells them apart.
const ACTIVE_STEP: Record<TxPhase, number> = {
  preparing: 0,
  signing: 0,
  submitting: 1,
}

const PHASE_HINT: Record<TxPhase, string> = {
  preparing: 'Preparing the transaction…',
  signing: 'Your wallet is open. Review and approve the transaction.',
  submitting: 'Waiting for the network to confirm…',
}

function StepDot({ state }: { state: 'done' | 'active' | 'upcoming' }) {
  if (state === 'done') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
        <polyline points="8 12.5 11 15.5 16 9.5" stroke="var(--c-surface)" />
      </svg>
    )
  }
  if (state === 'active') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
        <path d="M12 2 A10 10 0 0 1 22 12" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

function Stepper({ activeStep, allDone }: { activeStep: number; allDone: boolean }) {
  return (
    <div className="flex items-center justify-center">
      {STEPS.map((label, i) => {
        const state = allDone || i < activeStep ? 'done' : i === activeStep ? 'active' : 'upcoming'
        const color = state === 'upcoming' ? 'var(--c-text-faint)' : 'var(--c-text)'
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className="w-5 h-px mx-1.5"
                style={{ backgroundColor: allDone || i <= activeStep ? 'var(--c-border-2)' : 'var(--c-border)' }}
              />
            )}
            <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color }}>
              <StepDot state={state} />
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function TxStatus({ phase, status, hint }: TxStatusProps) {
  if (phase) {
    return (
      <div className="mt-4 animate-fade-up">
        <Stepper activeStep={ACTIVE_STEP[phase]} allDone={false} />
        <p className="text-[11px] text-center mt-2" style={{ color: 'var(--c-text-faint)' }}>
          {hint?.[phase] ?? PHASE_HINT[phase]}
        </p>
      </div>
    )
  }

  if (status.kind === 'success') {
    return (
      <div className="mt-4 animate-fade-up">
        <Stepper activeStep={STEPS.length} allDone />
        <div className="mt-2 text-center" style={{ color: '#22c55e' }}>
          <p className="text-xs">{status.message}</p>
          <div className="mt-1">
            <ExplorerLink hash={status.hash} />
          </div>
        </div>
      </div>
    )
  }

  if (status.kind === 'error') {
    return (
      <div className="mt-3 animate-fade-up">
        <p className="text-xs break-words" style={{ color: '#ef4444' }}>
          {status.message}
        </p>
        {status.detail && (
          <p className="text-[10px] mt-1 break-words" style={{ color: 'var(--c-text-faint)' }}>
            {status.detail}
          </p>
        )}
      </div>
    )
  }

  return null
}
