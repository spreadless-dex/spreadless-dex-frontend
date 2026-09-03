import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppStore } from '../store/useAppStore'
import { shortenAddress } from '../lib/utils'
import { useLocalPools } from '../lib/stellar/localPools'
import { mapTxError } from '../lib/stellar/errors'
import type { TxPhase } from '../lib/stellar/types'
import {
  acceptOwnership,
  aRightOf,
  A_RIGHT_LABEL,
  A_RIGHT_TIP,
  inviteLink,
  looksLikeAddress,
  offerOwnership,
  protocolOwnerFor,
  renounceOwnership,
  usePendingOffers,
  validateAddress,
  withdrawOffer,
  OFFER_VALID_DAYS,
  OFFER_VALID_MS,
  type PendingOffer,
} from '../lib/stellar/ownership'
import { recordOwnership } from '../lib/activity/record'
import RainButton from './RainButton'
import TxStatus, { type TxUiStatus } from './TxStatus'
import ExplorerLink from './ExplorerLink'
import Tooltip from './Tooltip'
import { Check, ClipboardPaste, Copy, Landmark, Lock, Wallet } from 'lucide-react'

// The "Owner" row of a pool page, and everything that can happen to it.
//
// Ownership moves in two signed steps (see ownership.ts): the owner sends an
// offer, the recipient accepts. The panel therefore has three faces and shows
// exactly one of them beneath the address:
//   - the owner, no open offer:  a quiet "Transfer" action that opens the dialog,
//                                where the pool goes to Spreadless (flexible A),
//                                to nobody (fixed A) or to another wallet
//   - the owner, offer open:     who it went to, until when, copy the invite,
//                                or take it back
//   - the offered wallet:        one card, one button: Accept
// Everyone else just sees the address. The dialog is a native <dialog> that
// stays mounted and animates through the same CSS as the login chooser.

interface OwnershipPanelProps {
  poolId: string
  poolLabel: string
  /** Current owner as read from chain, or from the stored record for a demo pool. */
  owner: string | undefined
  isDemo: boolean
  /** Ask the page to re-read pool state once ownership may have moved. */
  onOwnerChanged: () => void
}

type Recipient = 'protocol' | 'fixed' | 'custom'
type Step = 'offer' | 'withdraw' | 'accept' | 'renounce'

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Demo pools have nothing on chain: walk the same phases at a human pace so
// the flow reads the same, then return without a hash.
async function demoTx(onPhase: (p: TxPhase) => void): Promise<{ hash: string }> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  onPhase('preparing'); await wait(500)
  onPhase('signing'); await wait(800)
  onPhase('submitting'); await wait(900)
  return { hash: '' }
}

export default function OwnershipPanel({ poolId, poolLabel, owner, isDemo, onOwnerChanged }: OwnershipPanelProps) {
  const { walletAddress, connectWallet } = useAppStore()
  const setLocalOwner = useLocalPools((s) => s.setOwner)
  const offer: PendingOffer | undefined = usePendingOffers((s) => s.offers.find((o) => o.pool === poolId))
  const setOffer = usePendingOffers((s) => s.set)
  const clearOffer = usePendingOffers((s) => s.clear)

  const isOwner = !!walletAddress && walletAddress === owner
  const aRight = aRightOf(owner)
  const protocolOwner = protocolOwnerFor(isDemo)

  // ?accept=1 is the invite link: the recipient has no local record of the
  // offer, so the link is what puts the Accept step in front of them.
  const [acceptRequested, setAcceptRequested] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAcceptRequested(new URLSearchParams(window.location.search).get('accept') === '1')
    }
  }, [])
  // Stays on screen after a successful accept, even though the wallet is
  // the owner by then: the card is where the confirmation lives.
  const [accepted, setAccepted] = useState(false)
  const showAccept = accepted || (!!walletAddress && !isOwner && !!owner && (acceptRequested || offer?.to === walletAddress))

  // The offer was accepted from another browser: the chain now names someone
  // else, so the record here is history.
  useEffect(() => {
    if (offer && owner && offer.from !== owner) clearOffer(poolId)
  }, [offer, owner, poolId, clearOffer])

  // ── one in-flight transaction at a time, wherever it was started ──
  const [busy, setBusy] = useState<Step | null>(null)
  const [phase, setPhase] = useState<TxPhase | null>(null)
  const [rowStatus, setRowStatus] = useState<TxUiStatus>({ kind: 'idle' })
  const [dialogStatus, setDialogStatus] = useState<TxUiStatus>({ kind: 'idle' })
  const [acceptStatus, setAcceptStatus] = useState<TxUiStatus>({ kind: 'idle' })

  // ── dialog ──
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState<{ to: string; hash: string; kind: 'offer' | 'fixed' } | null>(null)
  const [recipient, setRecipient] = useState<Recipient>(protocolOwner ? 'protocol' : 'custom')
  // Giving the pool up is the one step with no way back, so the button asks
  // twice: the first press arms it, the second within a few seconds fires.
  const [armed, setArmed] = useState(false)
  const armTimer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(armTimer.current), [])
  useEffect(() => { setArmed(false) }, [recipient, open])
  const [custom, setCustom] = useState('')
  const [customValid, setCustomValid] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  const openDialog = () => {
    setSent(null)
    setDialogStatus({ kind: 'idle' })
    setOpen(true)
  }

  // Format check as they type, the strict checksum once it looks complete.
  useEffect(() => {
    const v = custom.trim()
    if (!v) { setCustomValid(null); return }
    if (!looksLikeAddress(v)) { setCustomValid(false); return }
    let cancelled = false
    validateAddress(v).then((ok) => { if (!cancelled) setCustomValid(ok) })
    return () => { cancelled = true }
  }, [custom])

  useEffect(() => {
    if (open && recipient === 'custom') inputRef.current?.focus()
  }, [open, recipient])

  const target = recipient === 'protocol' ? protocolOwner : recipient === 'fixed' ? null : custom.trim()
  const targetOk = recipient === 'protocol' ? !!protocolOwner : recipient === 'fixed' ? true : customValid === true
  const targetIsSelf = !!walletAddress && target === walletAddress
  const targetIsOwner = !!owner && target === owner

  const pasteAddress = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setCustom(text.trim())
    } catch {
      inputRef.current?.focus()
    }
  }

  // ── actions ──
  const run = async <T extends { hash: string }>(step: Step, fn: () => Promise<T>, report: (s: TxUiStatus) => void): Promise<T | null> => {
    if (!walletAddress || busy) return null
    setBusy(step)
    report({ kind: 'idle' })
    try {
      return await fn()
    } catch (err) {
      console.error(`Ownership ${step} failed:`, err)
      const mapped = mapTxError(err)
      report({ kind: 'error', ...mapped })
      recordOwnership({ walletAddress, status: 'failed', step, poolLabel, poolAddress: poolId, detail: mapped.message })
        .catch((e) => console.error('Failed to record activity:', e))
      return null
    } finally {
      setBusy(null)
      setPhase(null)
    }
  }

  const sendOffer = async () => {
    if (!walletAddress || !target || !targetOk) return
    const res = await run('offer', async () => {
      if (isDemo) {
        const d = await demoTx(setPhase)
        return { hash: d.hash, liveUntilLedger: 0 }
      }
      return offerOwnership({ from: walletAddress, poolId, newOwner: target, onPhase: setPhase })
    }, setDialogStatus)
    if (!res) return
    setOffer({ pool: poolId, from: walletAddress, to: target, liveUntilLedger: res.liveUntilLedger, hash: res.hash, createdAt: Date.now() })
    setSent({ to: target, hash: res.hash, kind: 'offer' })
    recordOwnership({ walletAddress, status: 'completed', step: 'offer', poolLabel, poolAddress: poolId, counterparty: target, txHash: res.hash })
      .catch((e) => console.error('Failed to record activity:', e))
  }

  const giveUp = async () => {
    if (!walletAddress) return
    if (!armed) {
      setArmed(true)
      window.clearTimeout(armTimer.current)
      armTimer.current = window.setTimeout(() => setArmed(false), 6000)
      return
    }
    setArmed(false)
    const res = await run('renounce', async () => {
      if (isDemo) return demoTx(setPhase)
      return renounceOwnership({ from: walletAddress, poolId, onPhase: setPhase })
    }, setDialogStatus)
    if (!res) return
    setSent({ to: '', hash: res.hash, kind: 'fixed' })
    recordOwnership({ walletAddress, status: 'completed', step: 'renounce', poolLabel, poolAddress: poolId, txHash: res.hash })
      .catch((e) => console.error('Failed to record activity:', e))
    if (isDemo) setLocalOwner(poolId, '')
    else onOwnerChanged()
  }

  const takeBack = async () => {
    if (!walletAddress || !offer) return
    const res = await run('withdraw', async () => {
      if (isDemo) return demoTx(setPhase)
      return withdrawOffer({ from: walletAddress, poolId, pendingOwner: offer.to, onPhase: setPhase })
    }, setRowStatus)
    if (!res) return
    clearOffer(poolId)
    setRowStatus({ kind: 'idle' })
    recordOwnership({ walletAddress, status: 'completed', step: 'withdraw', poolLabel, poolAddress: poolId, counterparty: offer.to, txHash: res.hash })
      .catch((e) => console.error('Failed to record activity:', e))
  }

  const previousOwner = useRef('')
  const accept = async () => {
    if (!walletAddress) return
    previousOwner.current = owner ?? ''
    const res = await run('accept', async () => {
      if (isDemo) return demoTx(setPhase)
      return acceptOwnership({ to: walletAddress, poolId, onPhase: setPhase })
    }, setAcceptStatus)
    if (!res) return
    setAcceptStatus({ kind: 'success', message: 'You own this pool now.', hash: res.hash })
    setAccepted(true)
    clearOffer(poolId)
    setAcceptRequested(false)
    setLocalOwner(poolId, walletAddress)
    recordOwnership({ walletAddress, status: 'completed', step: 'accept', poolLabel, poolAddress: poolId, counterparty: owner, txHash: res.hash })
      .catch((e) => console.error('Failed to record activity:', e))
    onOwnerChanged()
  }

  // ── copy invite ──
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number>(0)
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(poolId))
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy the invite link', inviteLink(poolId))
    }
  }
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const expiresAt = offer ? offer.createdAt + OFFER_VALID_MS : 0

  return (
    <>
      {/* Owner row */}
      <div className="flex items-center justify-between py-3 gap-3">
        <span className="text-sm shrink-0" style={{ color: 'var(--c-text-muted)' }}>Owner</span>
        <span className="flex items-center gap-3 min-w-0">
          {owner ? (
            <span key={owner} className="owner-swap font-mono text-[12px] truncate" style={{ color: 'var(--c-text)' }}>
              {shortenAddress(owner)}
              {isOwner ? ' · you' : ''}
            </span>
          ) : (
            <span className="font-mono text-[12px]" style={{ color: 'var(--c-text-faint)' }}>none · given up</span>
          )}
          {aRight === 'flexible' && (
            <span className="text-[12px]" style={{ color: 'var(--c-text-faint)' }}>Spreadless</span>
          )}
          {isOwner && !offer && aRight === 'undecided' && (
            <button
              onClick={openDialog}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-lg btn-lift shrink-0"
              style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            >
              Transfer
            </button>
          )}
        </span>
      </div>

      {/* What the owner means for A */}
      <div className="flex items-center justify-between py-3 gap-3">
        <span className="text-sm shrink-0 flex items-center" style={{ color: 'var(--c-text-muted)' }}>
          Right to change A
          <Tooltip text={A_RIGHT_TIP[aRight]} label="About the right to change A" />
        </span>
        <span key={aRight} className="owner-swap text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--c-text)' }}>
          {aRight === 'fixed' ? <Lock size={11} /> : aRight === 'flexible' ? <Landmark size={11} /> : null}
          {A_RIGHT_LABEL[aRight]}
          {aRight === 'undecided' && isOwner && !offer && (
            <span className="ml-1 font-normal" style={{ color: 'var(--c-text-faint)' }}>· decide with Transfer</span>
          )}
        </span>
      </div>

      {/* Open offer, seen by the owner */}
      {isOwner && offer && (
        <div className="handover-card mb-3 rounded-xl px-4 py-3.5" style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
          <FlowLine from={owner!} to={offer.to} live />
          <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
            <span className="pending-dot" style={{ color: 'var(--c-text)' }} />
            <span>
              Offer open until <span style={{ color: 'var(--c-text)' }}>{shortDate(expiresAt)}</span>. Nothing changes until {shortenAddress(offer.to)} accepts.
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={copyInvite}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg btn-lift"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy invite link'}
            </button>
            <button
              onClick={takeBack}
              disabled={busy !== null}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-lg btn-lift disabled:opacity-50"
              style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            >
              Take it back
            </button>
            {offer.hash && (
              <span className="ml-auto text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
                <ExplorerLink hash={offer.hash} />
              </span>
            )}
          </div>
          <TxStatus phase={busy === 'withdraw' ? phase : null} status={rowStatus} />
        </div>
      )}

      {/* The offered wallet */}
      {showAccept && (
        <div className="handover-card mb-3 rounded-xl px-4 py-4" style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
          <FlowLine from={accepted ? offer?.from ?? previousOwner.current : owner!} to={walletAddress!} live={!accepted} />
          <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            {acceptStatus.kind === 'success' ? 'The pool is yours.' : 'This pool is being offered to you.'}
          </p>
          <p className="learn-only text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
            {accepted
              ? 'From here on your wallet is the one address that can pause the pool, ramp A and change the swap fee.'
              : 'Accepting makes your wallet the owner: the one address that can pause the pool, ramp A and change the swap fee. No funds move.'}
          </p>
          {acceptStatus.kind !== 'success' && (
            <RainButton
              onClick={accept}
              disabled={busy !== null}
              className="mt-3 w-full py-2.5 text-sm font-semibold rounded-xl btn-lift disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              Accept ownership
            </RainButton>
          )}
          <TxStatus phase={busy === 'accept' ? phase : null} status={acceptStatus} />
        </div>
      )}

      {/* Offered, but not logged in with any wallet yet */}
      {acceptRequested && !walletAddress && (
        <div className="handover-card mb-3 rounded-xl px-4 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
          <p className="text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
            Log in with the wallet this pool was offered to.
          </p>
          <button
            onClick={connectWallet}
            className="px-4 py-2 text-[13px] font-semibold rounded-xl btn-lift"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            Log in
          </button>
        </div>
      )}

      {/* Transfer dialog */}
      <dialog
        ref={dialogRef}
        aria-labelledby="handover-title"
        className="wallet-dialog handover-dialog"
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget && busy === null) setOpen(false) }}
        onCancel={(e) => { if (busy !== null) e.preventDefault() }}
      >
        <div className="flex flex-col">
          <div className="flex items-start justify-between p-5 pb-3">
            <div>
              <h3 id="handover-title" className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>
                Hand over the pool
              </h3>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--c-text-faint)' }}>{poolLabel}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              disabled={busy !== null}
              aria-label="Close"
              className="w-8 h-8 -mr-2 -mt-1 flex items-center justify-center rounded-lg transition-all disabled:opacity-40"
              style={{ color: 'var(--c-text-faint)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {sent ? (
            <div className="px-5 pb-5 pt-2 flex flex-col items-center text-center">
              <span className="stamp-in w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}>
                <Check size={26} strokeWidth={2.5} />
              </span>
              <p className="stamp-late mt-4 text-base font-semibold" style={{ color: 'var(--c-text)' }}>
                {sent.kind === 'fixed' ? 'A is fixed for good' : 'Offer sent'}
              </p>
              <p className="stamp-late mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
                {sent.kind === 'fixed'
                  ? 'The pool has no owner now. Nobody can change A, the fee or pause it, ever.'
                  : `Share the link so ${shortenAddress(sent.to)} can accept it. You stay the owner until they do, for up to ${OFFER_VALID_DAYS} days.`}
              </p>
              {sent.kind === 'offer' && (
                <button
                  onClick={copyInvite}
                  className="stamp-late mt-5 w-full inline-flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-xl btn-lift"
                  style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
                >
                  {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} />}
                  {copied ? 'Copied' : 'Copy invite link'}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className={`stamp-late ${sent.kind === 'fixed' ? 'mt-5' : 'mt-2'} w-full py-2.5 text-sm font-semibold rounded-xl btn-lift`}
                style={sent.kind === 'fixed'
                  ? { backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }
                  : { border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
              >
                Done
              </button>
              {sent.hash && (
                <span className="stamp-late mt-3 text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
                  <ExplorerLink hash={sent.hash} />
                </span>
              )}
            </div>
          ) : (
            <div className="px-3 pb-4">
              <p className="learn-only text-[12px] mx-2 mb-3 leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
                The owner is the one address that can ramp A, pause the pool or change the fee. Give it to Spreadless, to nobody, or to another wallet. An offer to a wallet only takes effect once that wallet accepts it.
              </p>

              <div role="radiogroup" aria-label="New owner" className="flex flex-col gap-2">
                <ChoiceRow
                  index={0}
                  icon={<Landmark size={18} />}
                  title="Spreadless"
                  hint="Flexible A: Spreadless can ramp it later, as a slow glide, never a jump."
                  tag={protocolOwner ? null : 'Soon'}
                  checked={recipient === 'protocol'}
                  disabled={!protocolOwner}
                  onSelect={() => setRecipient('protocol')}
                />
                <ChoiceRow
                  index={1}
                  icon={<Lock size={18} />}
                  title="Nobody, fix it for good"
                  hint="Fixed A: give ownership up. Nothing about the pool can change again."
                  tag={null}
                  checked={recipient === 'fixed'}
                  onSelect={() => setRecipient('fixed')}
                />
                <div>
                  <ChoiceRow
                    index={2}
                    icon={<Wallet size={18} />}
                    title="Another wallet"
                    hint="A friend, a multisig, or one of your own accounts."
                    tag={null}
                    checked={recipient === 'custom'}
                    onSelect={() => setRecipient('custom')}
                  />
                  <div className="unfold" data-open={recipient === 'custom'}>
                    <div>
                      <div
                        className="addr-field mt-2 rounded-xl flex items-center gap-2 pl-3 pr-1.5 py-1.5"
                        data-valid={customValid === null ? undefined : customValid}
                      >
                        <input
                          ref={inputRef}
                          value={custom}
                          onChange={(e) => setCustom(e.target.value)}
                          spellCheck={false}
                          autoComplete="off"
                          placeholder="G… or C… address"
                          aria-label="New owner address"
                          aria-invalid={customValid === false}
                          className="flex-1 min-w-0 bg-transparent font-mono text-[12px] outline-none py-1.5"
                          style={{ color: 'var(--c-text)' }}
                        />
                        {customValid === true ? (
                          <span className="w-8 h-8 flex items-center justify-center" style={{ color: 'var(--c-text)' }}>
                            <Check size={15} strokeWidth={2.5} />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={pasteAddress}
                            aria-label="Paste address"
                            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                            style={{ color: 'var(--c-text-muted)' }}
                          >
                            <ClipboardPaste size={15} />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] mt-1.5 mx-1 min-h-[1rem]" style={{ color: 'var(--c-text-faint)' }}>
                        {customValid === false
                          ? 'That is not a Stellar address. It starts with G or C and has 56 characters.'
                          : targetIsSelf
                            ? 'That is your own wallet. The pool is already yours.'
                            : targetIsOwner
                              ? 'That address already owns the pool.'
                              : customValid === true
                                ? 'Looks right. Double-check it, a wrong address can never accept.'
                                : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mx-2 mt-3 mb-4">
                <FlowLine
                  from={walletAddress ?? ''}
                  to={targetOk && !targetIsSelf && target ? target : ''}
                  toLabel={recipient === 'fixed' ? 'no owner' : recipient === 'protocol' && targetOk ? 'Spreadless' : undefined}
                  live={busy === 'offer' || busy === 'renounce'}
                />
                <p className="text-[11px] mt-2 flex items-center" style={{ color: 'var(--c-text-faint)' }}>
                  {recipient === 'fixed'
                    ? 'One signature · not reversible · no funds move'
                    : `Open for ${OFFER_VALID_DAYS} days · they must accept · no funds move`}
                  <Tooltip text="Ownership means control, not money. The owner can pause the pool, ramp A and change the swap fee. LP shares and reserves stay exactly where they are." label="About what transfers" />
                </p>
              </div>

              {recipient === 'fixed' ? (
                <RainButton
                  onClick={giveUp}
                  disabled={busy !== null}
                  enableLoader={armed}
                  className="w-full py-3 text-sm font-semibold rounded-xl btn-lift disabled:opacity-50 disabled:cursor-not-allowed"
                  style={armed
                    ? { backgroundColor: 'transparent', color: 'var(--c-text)', border: '1px solid var(--c-text)' }
                    : { backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
                >
                  {armed ? 'Press again to confirm. This cannot be undone.' : 'Give up ownership'}
                </RainButton>
              ) : (
                <RainButton
                  onClick={sendOffer}
                  disabled={!targetOk || targetIsSelf || targetIsOwner || busy !== null}
                  className="w-full py-3 text-sm font-semibold rounded-xl btn-lift disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
                >
                  {recipient === 'protocol' ? 'Hand to Spreadless' : 'Send offer'}
                </RainButton>
              )}
              <TxStatus phase={busy === 'offer' || busy === 'renounce' ? phase : null} status={dialogStatus} />
            </div>
          )}
        </div>
      </dialog>
    </>
  )
}

// A recipient option, styled as the login chooser's rows so the two dialogs
// read as one family. Radio semantics: one is checked, arrows are not needed
// for two rows, Space and Enter select.
function ChoiceRow({ index, icon, title, hint, tag, checked, disabled, onSelect }: {
  index: number
  icon: ReactNode
  title: string
  hint: string
  tag: string | null
  checked: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className="wallet-option flex items-center gap-3 w-full text-left px-3 py-3 rounded-xl"
      style={{
        backgroundColor: 'var(--c-surface-2)',
        border: '1px solid var(--c-border)',
        ['--i' as string]: index,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg"
        style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
      >
        {icon}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{title}</span>
          {tag && (
            <span
              className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-px rounded-md whitespace-nowrap"
              style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text-muted)' }}
            >
              {tag}
            </span>
          )}
        </span>
        <span className="text-[12px] leading-snug" style={{ color: 'var(--c-text-muted)' }}>{hint}</span>
      </span>
      <span
        className="w-4 h-4 shrink-0 rounded-full flex items-center justify-center transition-all duration-200"
        style={{ border: `1px solid ${checked ? 'var(--c-text)' : 'var(--c-border-2)'}` }}
        aria-hidden
      >
        <span
          className="w-2 h-2 rounded-full transition-all duration-200"
          style={{ backgroundColor: 'var(--c-text)', scale: checked ? '1' : '0', opacity: checked ? 1 : 0 }}
        />
      </span>
    </button>
  )
}

// Owner on the left, recipient on the right, a dashed line between them. The
// dashes drift while a step is in flight or an offer is open; the recipient
// end only fills once there is one.
function FlowLine({ from, to, toLabel, live }: { from: string; to: string; toLabel?: string; live: boolean }) {
  const hasTo = !!to || !!toLabel
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--c-text)' }}>
        {from ? shortenAddress(from) : '—'}
      </span>
      <span className="flow-end w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--c-text)' }} />
      <svg className="flex-1 h-2 min-w-6" preserveAspectRatio="none" viewBox="0 0 100 8" aria-hidden>
        <line className="flow-line" data-live={live && hasTo} x1="0" y1="4" x2="100" y2="4" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="flow-end w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          backgroundColor: hasTo ? 'var(--c-text)' : 'transparent',
          boxShadow: hasTo ? 'none' : 'inset 0 0 0 1px var(--c-border-2)',
        }}
      />
      <span className="font-mono text-[11px] shrink-0 tabular-nums" style={{ color: hasTo ? 'var(--c-text)' : 'var(--c-text-faint)' }}>
        {toLabel ?? (hasTo ? shortenAddress(to) : 'new owner')}
      </span>
    </div>
  )
}
