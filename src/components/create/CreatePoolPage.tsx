import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { sceneTransition } from '../../lib/sceneTransition'
import { useAppStore } from '../../store/useAppStore'
import { listVaults } from '../../lib/stellar/registry'
import { listLocalPools } from '../../lib/stellar/localPools'
import { isDemoAddress, useVaultTvl } from '../../lib/stellar/vaultTvl'
import { formatCurrency } from '../../lib/utils'
import GlowValue from '../GlowValue'
import type { CreatePoolResult } from '../../lib/stellar/factory'
import {
  canonicalOrder,
  describeSettings,
  emptyDraft,
  findDuplicate,
  findTwins,
  fmtAmp,
  settingsKnown,
  hasErrors,
  knownTokenMeta,
  poolName,
  validateDraft,
  type ExistingPool,
  type PoolDraft,
  type TokenMeta,
} from '../../lib/stellar/poolParams'
import AssetPicker from './AssetPicker'
import CurvePicker from './CurvePicker'
import ARightPicker from './ARightPicker'
import FeePicker from './FeePicker'
import AdvancedSection from './AdvancedSection'
import ReviewDeploy from './ReviewDeploy'
import PoolPreviewCard from './PoolPreviewCard'
import Tooltip from '../Tooltip'
import { ArrowLeft, Check } from 'lucide-react'

// The pool builder (/pools/new). All six steps live on one page; a step
// after the assets unlocks once the asset set is valid, so the page always
// shows how much is left. The sticky preview on the right is the payoff:
// it is the row this pool will occupy in /pools, updating on every input.

export default function CreatePoolPage() {
  const { walletAddress, connectWallet } = useAppStore()

  const [draft, setDraft] = useState<PoolDraft>(emptyDraft)
  const [ampCustom, setAmpCustom] = useState(false)
  const [feeCustom, setFeeCustom] = useState(false)
  const [customTokens, setCustomTokens] = useState<TokenMeta[]>([])
  const [existing, setExisting] = useState<ExistingPool[]>([])
  const [limitHit, setLimitHit] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [created, setCreated] = useState<CreatePoolResult | null>(null)

  // The twin check needs every known vault: live registry plus pools this
  // browser created (both kinds; a demo pool should also refuse an exact twin).
  useEffect(() => {
    listVaults()
      .then((vaults) => setExisting([...vaults, ...listLocalPools()]))
      .catch(() => setExisting(listLocalPools()))
  }, [])

  const metaFor = useMemo(() => {
    return (address: string): TokenMeta | undefined =>
      knownTokenMeta(address) ?? customTokens.find((t) => t.address === address)
  }, [customTokens])

  // Everything downstream (preview, review, the stored label) shows tokens in
  // canonical order, the order the contract will hold them in. Chips reorder
  // the moment you pick, which is the "order is set automatically" lesson.
  const tokens = canonicalOrder(draft.tokens)
    .map(metaFor)
    .filter((t): t is TokenMeta => t !== undefined)

  const issues = validateDraft(draft, metaFor, existing)
  const assetIssue = issues.find((i) => i.field === 'tokens')
  // Nothing about a twin blocks the deploy: the Factory accepts a pool that
  // matches another one down to the fee, so the builder does too and says
  // what actually separates them, which is TVL.
  const twins = draft.tokens.length >= 2 ? findTwins(draft.tokens, existing) : []
  const duplicate = findDuplicate(draft, existing)
  const twinTvl = useVaultTvl(twins.map((t) => t.address))
  const tvlLabel = (address: string) => {
    if (isDemoAddress(address)) return 'demo, no TVL'
    const v = twinTvl[address]
    if (v === undefined) return 'TVL loading'
    if (v === null) return 'TVL unknown'
    return v > 0 ? `${formatCurrency(v)} TVL` : 'empty'
  }
  const assetsValid = !issues.some((i) => i.field === 'tokens' && i.severity === 'error')
  const unlocked = assetsValid && draft.tokens.length >= 2

  const set = (patch: Partial<PoolDraft>) => {
    setCreated(null)
    setDraft((d) => ({ ...d, ...patch }))
  }

  // A chip or a preset is a scene change: the preview dissolves into its
  // new state. Slider drags call `set` directly and let the curve tween and
  // the numbers tick instead.
  const setScene = (patch: Partial<PoolDraft>) => sceneTransition(() => flushSync(() => set(patch)))

  const toggleToken = (meta: TokenMeta) => {
    setLimitHit(false)
    const has = draft.tokens.includes(meta.address)
    setScene({ tokens: has ? draft.tokens.filter((a) => a !== meta.address) : [...draft.tokens, meta.address] })
  }

  const name = poolName(tokens.map((t) => t.symbol))

  const seed = () => {
    // The vault page owns seeding: ?seed=1 opens its deposit modal on the
    // first asset the moment the pool state is in.
    if (created) window.location.href = `/pools/v/${created.address}?seed=1`
  }

  const assetHint = limitHit
    ? { text: 'Four assets max.', warn: true }
    : assetIssue
      ? { text: assetIssue.message, warn: true }
      : draft.tokens.length >= 2
        ? { text: `${draft.tokens.length} assets. Order is set by contract address.`, warn: false }
        : { text: 'Pick at least two assets.', warn: false }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <a
        href="/pools"
        className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
        style={{ color: 'var(--c-text-muted)' }}
      >
        <ArrowLeft size={16} strokeWidth={1.8} />
        All pools
      </a>

      <div className="mt-4 mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>
          Create a pool
        </h1>
        {/* Inline opacity would beat the .learn-only fade, so the tone comes
            from the colour instead. */}
        <p className="learn-only text-sm mt-1" style={{ color: 'color-mix(in srgb, var(--c-text) 72%, transparent)' }}>
          Pick assets, set the curve, choose a fee. One transaction to deploy.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1.55fr_1fr] gap-5 items-start">
        <div className="min-w-0">
          <Step n={1} title="Assets" done={unlocked} locked={false}
            tooltip="Pick 2 to 4 stablecoins that trade near 1:1. Order is set automatically."
            value={name}
          >
            <AssetPicker
              selected={tokens}
              onToggle={toggleToken}
              onLimit={() => setLimitHit(true)}
              walletAddress={walletAddress}
              customTokens={customTokens}
              onAddCustom={(meta) => setCustomTokens((c) => [...c.filter((x) => x.address !== meta.address), meta])}
            />
            <p className="text-[12px] mt-2.5 min-h-[18px]" style={{ color: assetHint.warn ? '#d97706' : 'var(--c-text-muted)' }}>
              {assetHint.text}
            </p>
            {twins.length > 0 && (
              <div className="mt-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                {/* The count is the fact and stays; what it means for this
                    deploy is Learn mode only. */}
                <p className="text-[12px]" style={{ color: 'var(--c-text)' }}>
                  {twins.length === 1 ? 'A pool' : `${twins.length} pools`} with these assets already
                  {twins.length === 1 ? ' exists' : ' exist'}.
                  {duplicate && <span className="ml-1" style={{ color: '#d97706' }}>One carries your exact settings.</span>}
                </p>
                <p className="learn-only text-[12px] mt-1" style={{ color: 'var(--c-text-muted)' }}>
                  {duplicate
                    ? 'You can still deploy: two identical pools are allowed, and depth is what tells them apart. Yours starts empty, so seed it before it can win a quote.'
                    : twins.every(settingsKnown)
                      ? 'Yours has different settings, so it deploys as a separate pool.'
                      : 'Not every setting is readable on chain, so an exact match cannot be ruled out. Either way yours deploys as its own pool.'}
                </p>
                <ul className="mt-2 space-y-1">
                  {twins.map((t) => (
                    <li key={t.address} className="flex items-baseline justify-between gap-3 text-[12px]">
                      <span style={{ color: 'var(--c-text-muted)' }}>
                        {describeSettings(t)}
                        {findDuplicate(draft, [t]) && (
                          <span className="ml-1.5" style={{ color: '#d97706' }}>same as yours</span>
                        )}
                      </span>
                      <span className="flex items-baseline gap-2 shrink-0">
                        <span className="font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
                          {tvlLabel(t.address)}
                        </span>
                        <a href={`/pools/v/${t.address}`} className="underline underline-offset-2" style={{ color: 'var(--c-text-muted)' }}>
                          open
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Step>

          <Step n={2} title="Curve" done={unlocked} locked={!unlocked} delay={0}
            tooltip="Higher A keeps the price closer to 1:1 but reacts harder if a peg breaks."
            value={`A ${fmtAmp(draft.amp)}`}
          >
            <CurvePicker
              amp={draft.amp}
              custom={ampCustom}
              onChange={(amp, custom) => { setAmpCustom(custom); (custom ? set : setScene)({ amp }) }}
            />
          </Step>

          <Step n={3} title="Right to change A" done={unlocked} locked={!unlocked} delay={40}
            tooltip="Whether A can ever be retuned after launch. Only Spreadless can do that, and only if you allow it here. You never change it yourself."
            value={draft.aRight === 'flexible' ? 'Flexible' : 'Fixed'}
          >
            <ARightPicker value={draft.aRight} onChange={(aRight) => setScene({ aRight })} />
          </Step>

          <Step n={4} title="Fee" done={unlocked} locked={!unlocked} delay={80}
            tooltip="Charged on every swap. Most of it stays in the pool for liquidity providers. After launch only the pool's owner can change it."
            value={`${draft.feePct}%`}
          >
            <FeePicker
              feePct={draft.feePct}
              custom={feeCustom}
              onFee={(pct, custom) => { setFeeCustom(custom); (custom ? set : setScene)({ feePct: pct }) }}
            />
          </Step>

          <Step n={5} title="" done={false} locked={!unlocked} delay={120} bare>
            <AdvancedSection
              draft={draft}
              tokens={tokens}
              owner={walletAddress}
              onCap={(address, value) => set({ caps: { ...draft.caps, [address]: value } })}
              onLpCap={(value) => set({ lpMaxSupply: value })}
            />
          </Step>

          <Step n={6} title="Review" done={created !== null} locked={!unlocked || hasErrors(issues)} delay={180}>
            <ReviewDeploy
              draft={draft}
              tokens={tokens}
              owner={walletAddress}
              issues={issues}
              onConnect={connectWallet}
              onDeploying={setDeploying}
              onCreated={setCreated}
              created={created}
              onSeed={seed}
              metaFor={metaFor}
            />
          </Step>
        </div>

        <div className="lg:sticky lg:top-24">
          <p className="text-[11px] uppercase tracking-wider font-semibold mb-2.5" style={{ color: 'var(--c-text-faint)' }}>
            Preview · your row in /pools
          </p>
          <PoolPreviewCard
            tokens={tokens}
            name={name}
            amp={draft.amp}
            aRight={draft.aRight}
            feePct={draft.feePct}
            owner={walletAddress}
            state={created ? 'live' : deploying ? 'deploying' : 'draft'}
            backendLabel={created?.backend === 'demo' ? 'Demo' : undefined}
          />
        </div>
      </div>
    </div>
  )
}

// One step card. Locked steps sit lower, desaturated and inert, with a
// staggered delay so unlocking ripples down the page. The number turns into
// a check when the step has a valid answer.
interface StepProps {
  n: number
  title: string
  done: boolean
  locked: boolean
  delay?: number
  tooltip?: string
  value?: string
  bare?: boolean
  children: React.ReactNode
}

function Step({ n, title, done, locked, delay = 0, tooltip, value, bare, children }: StepProps) {
  return (
    <section
      aria-disabled={locked}
      className="rounded-2xl p-4 sm:p-5 mb-3 transition-all duration-300"
      style={{
        backgroundColor: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        opacity: locked ? 0.4 : 1,
        transform: locked ? 'translateY(6px)' : 'none',
        filter: locked ? 'saturate(0)' : 'none',
        pointerEvents: locked ? 'none' : undefined,
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: 'cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
      {!bare && (
        <header className="flex items-center gap-2.5 mb-3">
          <span
            className="w-[22px] h-[22px] rounded-full text-[11px] font-semibold flex items-center justify-center transition-colors duration-200 shrink-0"
            style={{
              backgroundColor: done ? 'var(--c-cta-bg)' : 'transparent',
              border: `1px solid ${done ? 'var(--c-cta-bg)' : 'var(--c-border-2)'}`,
              color: done ? 'var(--c-cta-text)' : 'var(--c-text)',
            }}
          >
            {done ? <Check size={12} strokeWidth={2.5} /> : n}
          </span>
          <h2 className="text-sm font-semibold flex items-center flex-1 min-w-0" style={{ color: 'var(--c-text)' }}>
            {title}
            {tooltip && <Tooltip text={tooltip} label={`About ${title.toLowerCase()}`} />}
            {value && (
              <GlowValue
                value={value}
                className="ml-auto pl-3 text-[12px] font-medium truncate"
                style={{ color: 'var(--c-text-muted)' }}
              />
            )}
          </h2>
        </header>
      )}
      {children}
    </section>
  )
}
