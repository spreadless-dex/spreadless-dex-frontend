import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { formatCurrency, shortenAddress } from '../lib/utils'
import { fromRawUnits } from '../lib/stellar/units'
import { getLpBalance, readPoolState, LP_DECIMALS, type PoolState, type PoolToken } from '../lib/stellar/pool'
import { tokenSymbol, tokenDecimals } from '../lib/stellar/registry'
import { useLocalPools, type LocalPool } from '../lib/stellar/localPools'
import { explorerContractUrl } from '../lib/stellar/config'
import { formatSharePct } from '../lib/stellar/poolParams'
import PoolDetailModal from './PoolDetailModal'
import OwnershipPanel from './OwnershipPanel'
import { aRightOf, A_RIGHT_LABEL, A_RIGHT_TIP } from '../lib/stellar/ownership'
import TokenIcon from './TokenIcon'
import Tooltip from './Tooltip'
import { ArrowLeft, ExternalLink } from 'lucide-react'

// Address-based pool page (/pools/v/[address]): the detail view for vaults
// beyond the single configured pool — everything the builder creates, and
// later everything the Factory registry lists. State is read straight from
// the vault's contract; the app store stays bound to the configured pool.
//
// A demo-created vault has nothing on chain, so its page renders the stored
// parameters with zero reserves and keeps deposits disabled. The page is the
// seeding surface: ?seed=1 (the builder's Seed liquidity CTA) opens the
// deposit modal as soon as the pool state is in.

interface VaultDetailPageProps {
  address: string
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; state: PoolState }
  | { kind: 'demo' }
  | { kind: 'error'; message: string }

export default function VaultDetailPage({ address }: VaultDetailPageProps) {
  const { walletAddress } = useAppStore()
  const localPool: LocalPool | undefined = useLocalPools((s) =>
    s.pools.find((p) => p.address === address),
  )
  const isDemo = localPool?.backend === 'demo'

  const [load, setLoad] = useState<LoadState>({ kind: isDemo ? 'demo' : 'loading' })
  const [lpBalance, setLpBalance] = useState<bigint | null>(null)
  const [action, setAction] = useState<{ token: PoolToken; mode: 'deposit' | 'withdraw' } | null>(null)
  const [seedRequested, setSeedRequested] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSeedRequested(new URLSearchParams(window.location.search).get('seed') === '1')
    }
  }, [])

  const fetchState = () => {
    if (isDemo) {
      setLoad({ kind: 'demo' })
      return
    }
    setLoad({ kind: 'loading' })
    readPoolState(address)
      .then((state) => setLoad({ kind: 'ready', state }))
      .catch((err) =>
        setLoad({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      )
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fetchState, [address, isDemo])

  // After an ownership step lands, re-read without dropping into the
  // skeleton: the panel that just showed the success message must stay on
  // screen. The RPC can serve the pre-tx snapshot for a moment, so poll
  // until the owner actually moves.
  const refreshOwner = async () => {
    if (isDemo) return
    const before = load.kind === 'ready' ? load.state.owner : undefined
    for (let i = 0; i < 6; i++) {
      try {
        const next = await readPoolState(address)
        if (next.owner !== before || i === 5) {
          setLoad({ kind: 'ready', state: next })
          return
        }
      } catch {
        // keep what is on screen
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  useEffect(() => {
    if (!walletAddress || isDemo) {
      setLpBalance(null)
      return
    }
    let cancelled = false
    getLpBalance(walletAddress, address)
      .then((bal) => { if (!cancelled) setLpBalance(bal) })
      .catch(() => { if (!cancelled) setLpBalance(null) })
    return () => { cancelled = true }
  }, [walletAddress, address, isDemo, action])

  // Demo vaults never hit the chain: their tokens come from the stored
  // constructor config, reserves are zero by definition.
  const tokens: PoolToken[] = useMemo(() => {
    if (load.kind === 'ready') return load.state.tokens
    if (localPool) {
      return localPool.tokens.map((addr, index) => ({
        index,
        address: addr,
        symbol: tokenSymbol(addr),
        decimals: tokenDecimals(addr),
        reserve: 0n,
        reserveHuman: 0,
        share: 0,
      }))
    }
    return []
  }, [load, localPool])

  const label = localPool?.label ?? tokens.map((t) => t.symbol).join(' / ')
  const state = load.kind === 'ready' ? load.state : null
  const amp = state?.amp ?? localPool?.amp
  const paused = state?.paused ?? false
  const tvl = state?.totalTvl ?? 0
  const empty = tvl === 0
  const feePct = localPool ? (localPool.feeBps / 100).toFixed(2) : null
  // Empty string is a demo pool whose owner was given up; undefined is the
  // same thing on chain (get_owner() returned None).
  const owner = (state ? state.owner : localPool?.owner) || undefined
  const aRight = aRightOf(owner)
  const lpHuman = lpBalance !== null ? fromRawUnits(lpBalance, LP_DECIMALS) : null

  // The builder's Seed CTA: open the deposit modal on the first asset as
  // soon as tokens are known. Demo pools show the banner instead.
  useEffect(() => {
    if (seedRequested && !isDemo && tokens.length > 0 && !action) {
      setAction({ token: tokens[0], mode: 'deposit' })
      setSeedRequested(false)
    }
  }, [seedRequested, isDemo, tokens, action])

  const backLink = (
    <a
      href="/pools"
      className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
      style={{ color: 'var(--c-text-muted)' }}
    >
      <ArrowLeft size={16} strokeWidth={1.8} />
      All pools
    </a>
  )

  if (load.kind === 'error') {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        {backLink}
        <div className="mt-6 p-8 rounded-2xl text-center" style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <p className="text-sm mb-2" style={{ color: 'var(--c-text-muted)' }}>
            Couldn't reach this pool's contract.
          </p>
          <p className="text-xs mb-5 break-words" style={{ color: 'var(--c-text-faint)' }}>{load.message}</p>
          <button
            onClick={fetchState}
            className="px-5 py-2.5 text-sm font-semibold rounded-xl btn-lift"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (load.kind === 'loading') {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        {backLink}
        <div className="mt-6 rounded-2xl animate-shimmer" style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-card-border)', height: 280 }} />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {backLink}

      {/* Header */}
      <div className="mt-5 mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex items-center shrink-0">
          {tokens.map((t, i) => (
            <div key={t.address} style={{ marginLeft: i === 0 ? 0 : -12, zIndex: tokens.length - i }}>
              <TokenIcon symbol={t.symbol} size={40} />
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2.5 flex-wrap" style={{ color: 'var(--c-text)' }}>
            {label}
            {isDemo && (
              <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold" style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)' }}>
                Demo
              </span>
            )}
            {paused && (
              <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold" style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text-muted)' }}>
                Paused
              </span>
            )}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
            {tokens.map((t) => t.symbol).join(' · ')} · StableSwap vault
          </p>
        </div>
      </div>

      {/* Demo banner */}
      {isDemo && (
        <div className="mb-6 px-4 py-3 rounded-xl text-[13px]" style={{ backgroundColor: 'var(--c-surface)', border: '1px dashed var(--c-border-2)', color: 'var(--c-text-muted)' }}>
          This pool was created in demo mode. Nothing exists on chain, so deposits and swaps are disabled.
          It shows exactly what a deployed pool's page will look like.
        </div>
      )}

      {/* Empty-pool banner (real vaults only) */}
      {!isDemo && empty && (
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap px-4 py-3 rounded-xl" style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <p className="text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
            This pool is empty. It can't quote swaps until someone seeds it.
          </p>
          {tokens.length > 0 && (
            <button
              onClick={() => setAction({ token: tokens[0], mode: 'deposit' })}
              className="px-4 py-2 text-[13px] font-semibold rounded-xl btn-lift"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              Seed liquidity
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="TVL" value={empty ? 'Empty' : formatCurrency(tvl)} />
        <Stat label="Amplification" value={amp !== undefined ? `A = ${amp}` : '—'} note={A_RIGHT_LABEL[aRight]} tip={`Higher A keeps the price closer to 1:1 but reacts harder if a peg breaks. ${A_RIGHT_TIP[aRight]}`} />
        <Stat label="Swap fee" value={feePct ? `${feePct}%` : '—'} tip={feePct ? `${formatSharePct(localPool!.protocolSharePct)}% of it goes to the protocol, the rest to LPs.` : 'The current contract exposes no fee getter, so unknown fees stay unlabeled.'} />
        <Stat label="LP supply" value={state ? state.lpSupplyHuman.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0'} />
      </div>

      {/* Composition */}
      <Section title="Pool composition" subtitle={empty ? 'No reserves yet' : `${formatCurrency(tvl)} across ${tokens.length} assets`}>
        <div>
          {tokens.map((t) => (
            <div key={t.address} className="flex items-center gap-3 px-5 py-3.5" style={{ borderTop: '1px solid var(--c-border)' }}>
              <TokenIcon symbol={t.symbol} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{t.symbol}</p>
                <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${t.share}%`, backgroundColor: 'var(--c-accent)' }} />
                </div>
              </div>
              <div className="text-right shrink-0 w-28">
                <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
                  {t.reserveHuman.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] tabular-nums" style={{ color: 'var(--c-text-faint)' }}>{t.share.toFixed(1)}%</p>
              </div>
              {!isDemo && (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setAction({ token: t, mode: 'deposit' })}
                    className="px-3 py-1.5 text-[12px] font-semibold rounded-lg btn-lift"
                    style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
                  >
                    Deposit
                  </button>
                  <button
                    onClick={() => setAction({ token: t, mode: 'withdraw' })}
                    className="px-3 py-1.5 text-[12px] font-semibold rounded-lg btn-lift"
                    style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
                  >
                    Withdraw
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Your position */}
      {walletAddress && !isDemo && (
        <Section title="Your position">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--c-border)' }}>
            <span className="text-sm" style={{ color: 'var(--c-text-muted)' }}>LP shares</span>
            <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>{lpHuman ?? '0'}</span>
          </div>
        </Section>
      )}

      {/* Contracts */}
      <Section title="Contracts & ownership">
        <div className="px-5 py-1" style={{ borderTop: '1px solid var(--c-border)' }}>
          <Row label="Pool contract">
            {isDemo ? (
              <span className="font-mono text-[12px]" style={{ color: 'var(--c-text-faint)' }}>{shortenAddress(address)} · not on chain</span>
            ) : (
              <a href={explorerContractUrl(address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-mono text-[12px] underline underline-offset-2" style={{ color: 'var(--c-text)' }}>
                {shortenAddress(address)} <ExternalLink size={11} />
              </a>
            )}
          </Row>
          {(state || localPool) && (
            <OwnershipPanel
              poolId={address}
              poolLabel={label}
              owner={owner}
              isDemo={isDemo}
              onOwnerChanged={refreshOwner}
            />
          )}
        </div>
      </Section>

      {action && (
        <PoolDetailModal
          token={action.token}
          defaultMode={action.mode}
          poolId={address}
          hideDetailsLink
          onClose={() => { setAction(null); fetchState() }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, note, tip }: { label: string; value: string; note?: string; tip?: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <p className="text-[11px] uppercase tracking-wider flex items-center" style={{ color: 'var(--c-text-faint)' }}>
        {label}
        {tip && <Tooltip text={tip} label={`About ${label.toLowerCase()}`} />}
      </p>
      <p className="text-[15px] font-semibold mt-1 tabular-nums flex items-baseline gap-2 flex-wrap" style={{ color: 'var(--c-text)' }}>
        {value}
        {note && <span key={note} className="owner-swap text-[11px] font-medium" style={{ color: 'var(--c-text-muted)' }}>{note}</span>}
      </p>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="px-5 py-3.5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{title}</h2>
        {subtitle && <p className="text-[12px] mt-0.5" style={{ color: 'var(--c-text-faint)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm" style={{ color: 'var(--c-text-muted)' }}>{label}</span>
      {children}
    </div>
  )
}
