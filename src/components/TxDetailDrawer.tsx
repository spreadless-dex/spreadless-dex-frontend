import { useState, useEffect } from 'react'
import type { ActivityRecord } from '../lib/activity/db'

interface TxDetailDrawerProps {
  activity: ActivityRecord | null
  onClose: () => void
}

const STATUS_COLOR: Record<ActivityRecord['status'], string> = {
  completed: '#22c55e',
  failed: '#ef4444',
  pending: 'var(--c-text-muted)',
}

const RETRY_HREF: Record<ActivityRecord['type'], string> = {
  swap: '/swap',
  deposit: '/earn',
  withdraw: '/earn',
}

export default function TxDetailDrawer({ activity, onClose }: TxDetailDrawerProps) {
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!activity) return
    setMounted(false)
    const raf = requestAnimationFrame(() => setMounted(true))
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', handleKey)
    }
  }, [activity, onClose])

  if (!activity) return null

  const rows: { label: string; value: string }[] = [
    { label: 'Action', value: activity.type[0].toUpperCase() + activity.type.slice(1) },
    { label: 'Pair', value: activity.assetPool },
    { label: 'Sent', value: activity.sent ?? '—' },
    { label: 'Received', value: activity.received ?? '—' },
    { label: 'Effective rate', value: activity.effectiveRate !== undefined ? activity.effectiveRate.toFixed(5) : '—' },
    { label: 'Slippage', value: activity.slippage ?? '—' },
    { label: 'Fee', value: activity.fee ?? '—' },
    { label: 'Status', value: activity.status[0].toUpperCase() + activity.status.slice(1) },
  ]

  const dateStr = new Date(activity.timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const copyHash = () => {
    if (!activity.txHash) return
    navigator.clipboard.writeText(activity.txHash).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)', opacity: mounted ? 1 : 0 }}
      />

      <div
        className="absolute top-0 right-0 h-full w-full max-w-md overflow-y-auto p-6 transition-transform duration-300"
        style={{
          backgroundColor: 'var(--c-surface)',
          borderLeft: '1px solid var(--c-border)',
          boxShadow: 'var(--c-widget-shadow)',
          transform: mounted ? 'translateX(0)' : 'translateX(100%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--c-text)' }}>
              {activity.title}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--c-text-faint)' }}>
              {activity.status[0].toUpperCase() + activity.status.slice(1)} · {dateStr}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
            style={{ border: '1px solid var(--c-border)', color: 'var(--c-text-faint)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-3 mb-6">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--c-border)' }}>
              <span className="text-sm" style={{ color: 'var(--c-text-faint)' }}>{label}</span>
              <span
                className="text-sm font-semibold"
                style={{ color: label === 'Status' ? STATUS_COLOR[activity.status] : 'var(--c-text)' }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {activity.txHash && (
          <button
            onClick={copyHash}
            className="w-full text-left p-3 rounded-lg mb-6 transition-colors"
            style={{ backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
          >
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-faint)' }}>
              Transaction hash {copied && '· Copied ✓'}
            </p>
            <p className="text-xs font-mono break-all" style={{ color: 'var(--c-text-muted)' }}>
              {activity.txHash}
            </p>
          </button>
        )}

        <div className="space-y-2">
          {activity.explorerUrl && (
            <a
              href={activity.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="block w-full text-center py-3 text-sm font-semibold rounded-xl transition-all active:scale-[0.99]"
              style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            >
              View on Explorer
            </a>
          )}
          {activity.status === 'failed' && (
            <a
              href={RETRY_HREF[activity.type]}
              className="block w-full text-center py-3 text-sm font-semibold rounded-xl transition-all active:scale-[0.99]"
              style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
            >
              Try Again
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
