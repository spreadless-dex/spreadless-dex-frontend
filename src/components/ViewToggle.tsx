import { useAppStore } from '../store/useAppStore'

export default function ViewToggle() {
  const { viewMode, setViewMode } = useAppStore()

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      <button
        onClick={() => setViewMode('card')}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
          viewMode === 'card'
            ? 'bg-white/10 text-white'
            : 'text-white/40 hover:text-white/60'
        }`}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
        Cards
      </button>
      <button
        onClick={() => setViewMode('table')}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
          viewMode === 'table'
            ? 'bg-white/10 text-white'
            : 'text-white/40 hover:text-white/60'
        }`}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="3" cy="6" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="3" cy="12" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="3" cy="18" r="0.7" fill="currentColor" stroke="none" />
        </svg>
        Expert
      </button>
    </div>
  )
}
