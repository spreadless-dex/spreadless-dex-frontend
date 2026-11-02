// Price alerts for one pool: list the wallet's, add one, remove one. Every
// change is a message the wallet signs (see src/pages/api/alerts.ts); the
// server checks the $1 of liquidity, so this only relays its answer.

import { useEffect, useState } from 'react'
import { signWalletMessage } from '../store/useAppStore'
import { NETWORK } from '../lib/stellar/config'

interface AlertItem {
  id: string
  pool: string
  token_a: string
  token_b: string
  bps: number
  channel: 'webhook' | 'telegram'
  firing: boolean
  pending: boolean
}

interface Props {
  owner: string
  pool: string
  tokens: { address: string; symbol: string }[]
}

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

const inputStyle = { backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }

export default function AlertsPanel({ owner, pool, tokens }: Props) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [tokenA, setTokenA] = useState(tokens[0]?.address ?? '')
  const [tokenB, setTokenB] = useState(tokens[1]?.address ?? '')
  const [bps, setBps] = useState(25)
  const [channel, setChannel] = useState<'telegram' | 'webhook'>('telegram')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [telegramLink, setTelegramLink] = useState<string | null>(null)

  const symbol = (address: string) => tokens.find((t) => t.address === address)?.symbol ?? address.slice(0, 4)

  const load = () =>
    fetch(`/api/alerts?owner=${owner}`)
      .then((r) => r.json())
      .then((b: { alerts?: AlertItem[] }) => setAlerts((b.alerts ?? []).filter((a) => a.pool === pool)))
      .catch(() => {})

  useEffect(() => { void load() }, [owner, pool])

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
        token_a: tokenA,
        token_b: tokenB,
        bps,
        channel,
        ...(channel === 'webhook' ? { webhook_url: webhookUrl } : {}),
      })
      if (res.telegram_link) setTelegramLink(res.telegram_link)
    })

  const remove = (id: string) => run(async () => { await signedCall('DELETE', owner, 'delete', { id }) })

  if (tokens.length < 2) return null

  return (
    <div style={{ borderTop: '1px solid var(--c-border)' }}>
      {alerts.map((a) => (
        <div key={a.id} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              {symbol(a.token_a)}/{symbol(a.token_b)} · {a.bps} bps
            </p>
            <p className="text-[11px]" style={{ color: a.firing ? 'var(--c-warn)' : 'var(--c-text-faint)' }}>
              {a.channel === 'telegram' ? 'Telegram' : 'Webhook'} ·{' '}
              {a.pending ? 'waiting for Start in Telegram' : a.firing ? 'past threshold' : 'watching'}
            </p>
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
      ))}

      <div className="px-5 py-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--c-text-muted)' }}>
          <select aria-label="First token" value={tokenA} onChange={(e) => setTokenA(e.target.value)} className="rounded-lg px-2 py-1.5" style={inputStyle}>
            {tokens.map((t) => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
          <span>vs</span>
          <select aria-label="Second token" value={tokenB} onChange={(e) => setTokenB(e.target.value)} className="rounded-lg px-2 py-1.5" style={inputStyle}>
            {tokens.map((t) => <option key={t.address} value={t.address}>{t.symbol}</option>)}
          </select>
          <span>more than</span>
          <input
            aria-label="Threshold in basis points"
            type="number" min={1} max={10000} step={1}
            value={bps}
            onChange={(e) => setBps(Math.round(Number(e.target.value)))}
            className="w-20 rounded-lg px-2 py-1.5 tabular-nums" style={inputStyle}
          />
          <span>bps apart</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Send alerts to" value={channel} onChange={(e) => setChannel(e.target.value as 'telegram' | 'webhook')} className="rounded-lg px-2 py-1.5" style={inputStyle}>
            <option value="telegram">Telegram</option>
            <option value="webhook">Webhook</option>
          </select>
          {channel === 'webhook' && (
            <input
              aria-label="Webhook URL"
              type="url" placeholder="https://…"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="flex-1 min-w-48 rounded-lg px-2 py-1.5" style={inputStyle}
            />
          )}
          <button
            onClick={create}
            disabled={busy || tokenA === tokenB || (channel === 'webhook' && !webhookUrl)}
            className="px-3 py-1.5 text-[12px] font-semibold rounded-lg btn-lift disabled:opacity-50"
            style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
          >
            {busy ? 'Sign in wallet…' : 'Add alert'}
          </button>
        </div>

        {telegramLink && (
          <p className="text-[12px]" style={{ color: 'var(--c-text)' }}>
            One more step: <a href={telegramLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 font-semibold">open the bot in Telegram</a> and press Start. The link works for 24 hours.
          </p>
        )}
        {error && <p role="alert" className="text-[12px]" style={{ color: 'var(--c-warn)' }}>{error}</p>}
        <p className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
          Checked every minute against the pool's mid price. Alerts need at least $1 of liquidity in a Spreadless pool; your wallet signs each change, no transaction.
        </p>
      </div>
    </div>
  )
}
