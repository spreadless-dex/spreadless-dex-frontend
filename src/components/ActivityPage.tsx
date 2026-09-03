import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { getActivities, type ActivityRecord, type ActivityType, type ActivityStatus } from '../lib/activity/db'
import TxDetailDrawer from './TxDetailDrawer'

type TypeFilter = 'all' | ActivityType
type StatusFilter = 'all' | ActivityStatus
type DateFilter = 'all' | '24h' | '7d' | '30d'

function FilterPill<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { key: T; label: string }[]
  onChange: (v: T) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = options.find((o) => o.key === value)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5"
        style={{ border: '1px solid var(--c-border)', color: 'var(--c-text-muted)' }}
      >
        {label}: {current?.label ?? value}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 rounded-xl overflow-hidden z-30 min-w-[140px]"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border-2)', boxShadow: 'var(--c-widget-shadow)' }}
        >
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => { onChange(o.key); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-xs transition-colors"
              style={{
                color: o.key === value ? 'var(--c-text)' : 'var(--c-text-muted)',
                backgroundColor: o.key === value ? 'var(--c-surface-2)' : 'transparent',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ActivityStatus }) {
  const style =
    status === 'completed'
      ? { border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }
      : status === 'failed'
        ? { border: '1px solid #ef444466', color: '#ef4444' }
        : { border: '1px solid var(--c-border)', color: 'var(--c-text-faint)' }
  return (
    <span className="inline-block px-2.5 py-1 text-[11px] font-medium rounded-full capitalize whitespace-nowrap" style={style}>
      {status}
    </span>
  )
}

function formatDate(ts: number): string {
  if (Date.now() - ts < 60_000) return 'Just now'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function exportCsv(records: ActivityRecord[]) {
  const headers = ['Date', 'Type', 'Title', 'Subtitle', 'Asset/Pool', 'Amount', 'Status', 'Sent', 'Received', 'Effective Rate', 'Slippage', 'Fee', 'Tx Hash']
  const rows = records.map((a) => [
    new Date(a.timestamp).toISOString(),
    a.type,
    a.title,
    a.subtitle,
    a.assetPool,
    a.amount,
    a.status,
    a.sent ?? '',
    a.received ?? '',
    a.effectiveRate?.toString() ?? '',
    a.slippage ?? '',
    a.fee ?? '',
    a.txHash ?? '',
  ])
  const csv = [headers, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spreadless-activity-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ActivityPage() {
  const { walletConnected, walletAddress, connectWallet } = useAppStore()
  const [activities, setActivities] = useState<ActivityRecord[] | null>(null)
  const [selected, setSelected] = useState<ActivityRecord | null>(null)

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [assetFilter, setAssetFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('30d')

  useEffect(() => {
    if (!walletAddress) {
      setActivities(null)
      return
    }
    let cancelled = false
    getActivities(walletAddress).then((records) => {
      if (!cancelled) setActivities(records)
    })
    return () => { cancelled = true }
  }, [walletAddress])

  if (!walletConnected) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-24 text-center">
        <p className="text-sm mb-4" style={{ color: 'var(--c-text-muted)' }}>
          Connect your wallet to see your activity.
        </p>
        <button
          onClick={connectWallet}
          className="px-6 py-3 text-sm font-semibold rounded-xl btn-lift"
          style={{ backgroundColor: 'var(--c-cta-bg)', color: 'var(--c-cta-text)' }}
        >
          Log In
        </button>
      </div>
    )
  }

  if (activities === null) return null

  const assetOptions = Array.from(
    new Set(activities.flatMap((a) => a.assetPool.split('/'))),
  ).sort()

  const filtered = activities.filter((a) => {
    if (typeFilter !== 'all' && a.type !== typeFilter) return false
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    if (assetFilter !== 'all' && !a.assetPool.split('/').includes(assetFilter)) return false
    if (dateFilter !== 'all') {
      const days = dateFilter === '24h' ? 1 : dateFilter === '7d' ? 7 : 30
      if (a.timestamp < Date.now() - days * 24 * 60 * 60 * 1000) return false
    }
    return true
  })

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>Activity</h1>
          <p className="text-sm max-w-lg" style={{ color: 'var(--c-text-muted)' }}>
            All swaps, liquidity actions, and yield-related interactions connected to your wallet.
          </p>
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
          className="px-4 py-2 text-sm font-semibold rounded-xl btn-lift disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
        >
          Export CSV
        </button>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <FilterPill
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { key: 'all', label: 'All' },
            { key: 'swap', label: 'Swap' },
            { key: 'deposit', label: 'Deposit' },
            { key: 'withdraw', label: 'Withdraw' },
            { key: 'ownership', label: 'Ownership' },
          ]}
        />
        <FilterPill
          label="Asset"
          value={assetFilter}
          onChange={setAssetFilter}
          options={[{ key: 'all', label: 'All' }, ...assetOptions.map((s) => ({ key: s, label: s }))]}
        />
        <FilterPill
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { key: 'all', label: 'All' },
            { key: 'completed', label: 'Completed' },
            { key: 'failed', label: 'Failed' },
            { key: 'pending', label: 'Pending' },
          ]}
        />
        <FilterPill
          label="Date"
          value={dateFilter}
          onChange={setDateFilter}
          options={[
            { key: 'all', label: 'All time' },
            { key: '24h', label: 'Last 24 hours' },
            { key: '7d', label: 'Last 7 days' },
            { key: '30d', label: 'Last 30 days' },
          ]}
        />
        <span className="ml-auto text-[11px]" style={{ color: 'var(--c-text-faint)' }}>
          Wallet ledger · Testnet preview
        </span>
      </div>

      {filtered.length === 0 ? (
        <div
          className="p-10 rounded-2xl text-center"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
            {activities.length === 0
              ? 'No activity yet. Swaps, deposits, and withdrawals you make will show up here.'
              : 'No activity matches these filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--c-border)' }}>
          <table className="w-full text-sm" style={{ backgroundColor: 'var(--c-surface)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                {['Date', 'Activity', 'Asset / Pool', 'Amount', 'Status'].map((h, i) => (
                  <th
                    key={h}
                    className={`text-[11px] uppercase tracking-wider font-medium px-4 py-3 ${i === 3 ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--c-text-faint)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className="cursor-pointer transition-colors hover:opacity-80"
                  style={{ borderBottom: '1px solid var(--c-border)' }}
                >
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--c-text-faint)' }}>
                    {formatDate(a.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold" style={{ color: 'var(--c-text)' }}>{a.title}</p>
                    {a.subtitle && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-faint)' }}>{a.subtitle}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap"
                      style={{ border: '1px solid var(--c-border-2)', color: 'var(--c-text-muted)' }}
                    >
                      {a.assetPool}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: 'var(--c-text)' }}>
                    {a.amount}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TxDetailDrawer activity={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
