// Price alerts for one pool: list the wallet's, add one, remove one. An alert
// watches the whole pool, the gap between its dearest and cheapest token. Every
// change is a message the wallet signs (see src/pages/api/alerts.ts); the
// server checks the $1 of liquidity, so this only relays its answer.

import { useEffect, useState } from 'react'
import { signWalletMessage } from '../store/useAppStore'
import { NETWORK } from '../lib/stellar/config'
import { spread } from '../lib/server/alerts'
import SegmentedControl from './create/SegmentedControl'

type Channel = 'telegram' | 'webhook'

interface AlertItem {
  id: string
  pool: string
  bps: number
  channel: Channel
  firing: boolean
  pending: boolean
}

interface PricedPool {
  address: string
  tokens: { symbol: string; address: string; price: number; reserve: number }[]
}

const THRESHOLDS = [10, 25, 50, 100].map((bps) => ({ key: bps, label: `${bps} bps`, hint: `${(bps / 100).toFixed(2)}%` }))
const CHANNELS = [
  { key: 'telegram' as const, label: 'Telegram' },
  { key: 'webhook' as const, label: 'Webhook' },
]

async function signedCall(method: 'POST' | 'DELETE', owner: string, action: string, fields: Record<string, unknown>) {
  const message = JSON.stringify({ app: 'spreadless-alerts', network: NETWORK, action, owner, ts: Date.now(), ...fields })
  const signature = await signWalletMessage(message)
  const res = await fetch('/api/alerts', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

export default function AlertsPanel({ owner, pool }: { owner: string; pool: string }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [now, setNow] = useState<ReturnType<typeof spread> | null>(null)
  const [bps, setBps] = useState(25)
  const [channel, setChannel] = useState<Channel>('telegram')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [telegramLink, setTelegramLink] = useState<string | null>(null)

  const load = () =>
    fetch(`/api/alerts?owner=${owner}`)
      .then((r) => r.json())
      .then((b: { alerts?: AlertItem[] }) => setAlerts((b.alerts ?? []).filter((a) => a.pool === pool)))
      .catch(() => {})

  useEffect(() => { void load() }, [owner, pool])

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((b: { pools?: PricedPool[] }) => {
        const p = b.pools?.find((x) => x.address === pool)
        if (p && p.tokens.length > 1) setNow(spread(p))
      })
      .catch(() => {})
  }, [pool])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const create = () =>
    run(async () => {
      setTelegramLink(null)
      const res = await signedCall('POST', owner, 'create', {
        id: crypto.randomUUID(),
        pool,
        bps,
        channel,
        ...(channel === 'webhook' ? { webhook_url: webhookUrl } : {}),
      })
      if (res.telegram_link) setTelegramLink(res.telegram_link)
    })

  const remove = (id: string) => run(async () => { await signedCall('DELETE', owner, 'delete', { id }) })

  return (
    <div style={{ borderTop: '1px solid var(--c-border)' }}>
      {alerts.map((a) => {
        const state = a.pending ? 'Waiting for Start in Telegram' : a.firing ? 'Past threshold' : 'Watching'
        const dot = a.pending ? 'var(--c-text-faint)' : a.firing ? 'var(--c-warn)' : 'var(--c-accent)'
        return (
          <div key={a.id} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
                Over {a.bps} bps <span className="font-normal" style={{ color: 'var(--c-text-muted)' }}>· {a.channel === 'telegram' ? 'Telegram' : 'Webhook'}</span>
              </p>
              <p className="text-[11px]" style={{ color: a.firing ? 'var(--c-warn)' : 'var(--c-text-faint)' }}>{state}</p>
            </div>
            <button
              onClick={() => remove(a.id)}
              disabled={busy}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-lg btn-lift disabled:opacity-50"
              style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            >
              Remove
            </button>
          </div>
        )
      })}

      <div className="px-5 py-5 grid gap-5">
        {now && (
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span style={{ color: 'var(--c-text-muted)' }}>Widest gap right now</span>
            <span className="tabular-nums" style={{ color: 'var(--c-text)' }}>
              <span className="font-semibold">{now.bps.toFixed(1)} bps</span>
              <span style={{ color: 'var(--c-text-faint)' }}> · {now.high.symbol} ↔ {now.low.symbol}</span>
            </span>
          </div>
        )}

        <div className="grid gap-2">
          <p className="text-[12px]" style={{ color: 'var(--c-text-muted)' }}>Tell me when any two tokens drift more than</p>
          <SegmentedControl ariaLabel="Threshold" options={THRESHOLDS} value={bps} onChange={setBps} />
        </div>

        <div className="grid gap-2">
          <p className="text-[12px]" style={{ color: 'var(--c-text-muted)' }}>Send it to</p>
          <SegmentedControl ariaLabel="Send alerts to" size="sm" options={CHANNELS} value={channel} onChange={setChannel} />
          {channel === 'webhook' && (
            <input
              aria-label="Webhook URL"
              type="url"
              placeholder="https://your-server.com/hook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          )}
        </div>

        <button
          onClick={create}
          disabled={busy || (channel === 'webhook' && !webhookUrl)}
          className="w-full py-2.5 text-sm font-semibold rounded-xl btn-lift disabled:opacity-50"
          style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
        >
          {busy ? 'Sign in your wallet…' : 'Add alert'}
        </button>

        {telegramLink && (
          <p className="text-[12px] rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)', color: 'var(--c-text)' }}>
            One more step: <a href={telegramLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 font-semibold">open the bot in Telegram</a> and press Start. The link works for 24 hours.
          </p>
        )}
        {error && <p role="alert" className="text-[12px]" style={{ color: 'var(--c-warn)' }}>{error}</p>}
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text-faint)' }}>
          Checked every minute. You hear once when the gap opens and once when it closes. Needs $1 of liquidity in a Spreadless pool; your wallet signs, no transaction.
        </p>
      </div>
    </div>
  )
}
