import { useAppStore } from '../store/useAppStore'

export default function ViewToggle() {
  const { viewMode, setViewMode } = useAppStore()

  return (
    <div
      className="flex items-center gap-1 p-1 rounded-lg"
      style={{
        backgroundColor: 'var(--c-surface-2)',
        border: '1px solid var(--c-border)',
      }}
    >
      {[
        {
          mode: 'card' as const,
          label: 'Cards',
          icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
          ),
        },
        {
          mode: 'table' as const,
          label: 'Expert',
          icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <circle cx="3" cy="6" r="0.7" fill="currentColor" stroke="none" />
              <circle cx="3" cy="12" r="0.7" fill="currentColor" stroke="none" />
              <circle cx="3" cy="18" r="0.7" fill="currentColor" stroke="none" />
            </svg>
          ),
        },
      ].map(({ mode, label, icon }) => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150"
          style={{
            backgroundColor: viewMode === mode ? 'var(--c-surface)' : 'transparent',
            color: viewMode === mode ? 'var(--c-text)' : 'var(--c-text-faint)',
            boxShadow: viewMode === mode ? 'var(--c-card-shadow)' : 'none',
          }}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  )
}
