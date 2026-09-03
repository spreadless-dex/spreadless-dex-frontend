import { useState } from 'react'
import { createPool, createBackend, type CreatePoolResult, type CreateStage } from '../../lib/stellar/factory'
import { mapTxError } from '../../lib/stellar/errors'
import { explorerContractUrl } from '../../lib/stellar/config'
import { shortenAddress } from '../../lib/utils'
import {
  fmtAmp,
  poolName,
  PROTOCOL_SHARE_PCT,
  formatSharePct,
  type DraftIssue,
  type PoolDraft,
  type TokenMeta,
} from '../../lib/stellar/poolParams'
import type { TxPhase } from '../../lib/stellar/types'
import TxStatus, { type TxUiStatus } from '../TxStatus'
import { ExternalLink } from 'lucide-react'

// Step 5: read it back, sign it, hand over to seeding. The CTA itself carries
// the progress (no modal, no redirect); success swaps the section for a card
// whose next action is Seed liquidity, because an empty pool cannot quote.

interface ReviewDeployProps {
  draft: PoolDraft
  tokens: TokenMeta[]
  owner: string | null
  issues: DraftIssue[]
  onConnect: () => void
  onDeploying: (deploying: boolean) => void
  onCreated: (result: CreatePoolResult) => void
  created: CreatePoolResult | null
  onSeed: () => void
  metaFor: (address: string) => TokenMeta | undefined
}

export default function ReviewDeploy({
  draft,
  tokens,
  owner,
  issues,
  onConnect,
  onDeploying,
  onCreated,
  created,
  onSeed,
  metaFor,
}: ReviewDeployProps) {
  const [phase, setPhase] = useState<TxPhase | null>(null)
  const [stage, setStage] = useState<CreateStage>('deploy')
  const [status, setStatus] = useState<TxUiStatus>({ kind: 'idle' })
  const fixed = draft.aRight === 'fixed'

  const name = poolName(tokens.map((t) => t.symbol))
  const backend = createBackend()
  const blocked = issues.some((i) => i.severity === 'error')

  const deploy = async () => {
    if (!owner) {
      onConnect()
      return
    }
    setStatus({ kind: 'idle' })
    setPhase('preparing')
    onDeploying(true)
    try {
      const result = await createPool({
        draft,
        creator: owner,
        label: name,
        metaFor,
        onPhase: setPhase,
        onStage: setStage,
      })
      setPhase(null)
      onDeploying(false)
      onCreated(result)
    } catch (err) {
      setPhase(null)
      onDeploying(false)
      setStatus({ kind: 'error', ...mapTxError(err) })
    }
  }

  if (created) {
    return (
      <div className="animate-bounce-in" style={{ animationDuration: '0.6s' }}>
        <div className="flex items-start gap-3.5">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#22c55e" strokeWidth="2" aria-hidden>
            <circle cx="20" cy="20" r="18" className="animate-draw-circle" style={{ strokeDasharray: 114, strokeDashoffset: 114 }} />
            <path d="M12 20.5l5.5 5.5L28 15" strokeLinecap="round" strokeLinejoin="round" className="animate-draw-check" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold" style={{ color: 'var(--c-text)' }}>
              {name} is live.
            </p>
            <p className="text-[13px] mt-0.5 mb-3" style={{ color: 'var(--c-text-muted)' }}>
              {created.aRight === 'undecided'
                ? 'It has no liquidity yet. Ownership was not given up: you still own it. Finish that on the pool page, or keep it.'
                : 'It has no liquidity yet. Seed it so it can quote.'}
            </p>
            <p className="text-[12px] mb-3 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--c-text-faint)' }}>
              <span className="font-mono">{shortenAddress(created.address)}</span>
              {created.backend === 'demo' ? (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold"
                  style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
                >
                  Demo · nothing on chain
                </span>
              ) : (
                <a
                  href={explorerContractUrl(created.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  View contract <ExternalLink size={11} />
                </a>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSeed}
                className="flex-[1.4] px-4 py-2.5 text-sm font-semibold rounded-xl btn-lift"
                style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
              >
                Seed liquidity
              </button>
              <a
                href={`/pools/v/${created.address}`}
                className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-center btn-lift"
                style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
              >
                View pool
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[13px] mb-4">
        <dt style={{ color: 'var(--c-text-muted)' }}>Assets</dt>
        <dd style={{ color: 'var(--c-text)' }}>{tokens.map((t) => t.symbol).join(', ') || '—'}</dd>
        <dt style={{ color: 'var(--c-text-muted)' }}>Amplification</dt>
        <dd style={{ color: 'var(--c-text)' }}>A = {fmtAmp(draft.amp)} · {fixed ? 'fixed for good' : 'Spreadless may ramp it'}</dd>
        <dt style={{ color: 'var(--c-text-muted)' }}>Swap fee</dt>
        <dd style={{ color: 'var(--c-text)' }}>{draft.feePct}% · {formatSharePct(PROTOCOL_SHARE_PCT)}% to the protocol</dd>
        <dt style={{ color: 'var(--c-text-muted)' }}>Caps</dt>
        <dd style={{ color: 'var(--c-text)' }}>
          {tokens.some((t) => draft.caps[t.address]?.trim()) || draft.lpMaxSupply.trim() ? 'Custom' : 'None'}
        </dd>
        <dt style={{ color: 'var(--c-text-muted)' }}>Owner</dt>
        <dd className="text-[12px]" style={{ color: 'var(--c-text)' }}>
          {fixed
            ? <>None after deploy <span className="font-mono" style={{ color: 'var(--c-text-faint)' }}>({owner ? shortenAddress(owner) : 'you'} signs twice)</span></>
            : 'Spreadless'}
        </dd>
      </dl>

      <button
        type="button"
        onClick={deploy}
        disabled={blocked || phase !== null}
        className="w-full px-4 py-3 text-sm font-semibold rounded-xl btn-lift disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
      >
        {owner ? 'Deploy pool' : 'Log in to deploy'}
      </button>

      <TxStatus
        phase={phase}
        status={status}
        hint={stage === 'renounce'
          ? {
              preparing: fixed ? 'Deployed. Now step 2 of 2: giving ownership up…' : 'Preparing…',
              signing: 'Step 2 of 2. Your wallet is open: approve giving ownership up.',
              submitting: 'Waiting for the network to confirm…',
            }
          : {
              preparing: backend === 'demo' ? 'Demo mode: simulating the deploy…' : 'Building the deploy transaction…',
              signing: fixed ? 'Step 1 of 2. Your wallet is open: approve the deploy.' : 'Your wallet is open. Review and approve the deploy.',
              submitting: 'Waiting for the network to confirm…',
            }}
      />
      {phase === null && status.kind === 'idle' && (
        // Demo mode changes what the button actually does, so that line
        // stays in both modes; the other one only describes the obvious.
        <p
          className={`text-[12px] text-center mt-2.5 ${backend === 'demo' ? '' : 'learn-only'}`}
          style={{ color: 'var(--c-text-faint)' }}
        >
          {backend === 'demo'
            ? 'Demo mode: the Factory is not deployed yet, so nothing is signed.'
            : fixed
              ? 'Two signatures: the deploy, then giving ownership up. You can seed liquidity right after.'
              : 'One transaction. You can seed liquidity right after.'}
        </p>
      )}
    </div>
  )
}
