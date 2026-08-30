import {
  FEE_MAX_PCT,
  FEE_MIN_PCT,
  FEE_PRESETS,
  SHARE_PRESETS,
  logToSlider,
  sliderToLog,
} from '../../lib/stellar/poolParams'
import SegmentedControl from './SegmentedControl'
import Tooltip from '../Tooltip'

// Step 3: the swap fee and how it is split. Presets first; Custom opens a
// log slider spanning 0.001% to 1%. Protocol share is a small inline control
// because for most creators the default is right.

interface FeePickerProps {
  feePct: number
  custom: boolean
  sharePct: number
  onFee: (pct: number, custom: boolean) => void
  onShare: (pct: number) => void
}

export default function FeePicker({ feePct, custom, sharePct, onFee, onShare }: FeePickerProps) {
  const value = custom ? 'custom' : (FEE_PRESETS.find((p) => p.pct === feePct) ? String(feePct) : 'custom')

  return (
    <div>
      <SegmentedControl
        ariaLabel="Swap fee preset"
        options={[
          ...FEE_PRESETS.map((p) => ({ key: String(p.pct), label: `${p.pct}%`, hint: p.hint })),
          { key: 'custom', label: 'Custom', hint: `${FEE_MIN_PCT}% to ${FEE_MAX_PCT}%` },
        ]}
        value={value}
        onChange={(key) => {
          if (key === 'custom') onFee(feePct, true)
          else onFee(Number(key), false)
        }}
      />
      {custom && (
        <div className="flex items-center gap-3 mt-3 animate-fade-up">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={logToSlider(feePct, FEE_MIN_PCT, FEE_MAX_PCT)}
            onChange={(e) => onFee(Number(sliderToLog(Number(e.target.value), FEE_MIN_PCT, FEE_MAX_PCT).toPrecision(2)), true)}
            aria-label="Swap fee"
            className="flex-1"
            style={{ accentColor: 'var(--c-accent)' }}
          />
          <div className="relative">
            <input
              value={feePct}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (Number.isFinite(v)) onFee(Math.max(FEE_MIN_PCT, Math.min(FEE_MAX_PCT, v)), true)
              }}
              inputMode="decimal"
              aria-label="Fee percent"
              className="w-24 pl-2.5 pr-6 py-1.5 rounded-lg text-[13px] text-right tabular-nums outline-none"
              style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: 'var(--c-text-faint)' }}>%</span>
          </div>
        </div>
      )}
      <div className="flex items-center flex-wrap gap-2 mt-3 text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
        <span className="flex items-center">
          Protocol share
          <Tooltip text="Part of the swap fee sent to the beneficiary. The rest stays with LPs." label="About protocol share" />
        </span>
        <SegmentedControl
          size="sm"
          ariaLabel="Protocol share"
          options={SHARE_PRESETS.map((s) => ({ key: s, label: `${s}%` }))}
          value={SHARE_PRESETS.includes(sharePct) ? sharePct : SHARE_PRESETS[0]}
          onChange={(s) => onShare(s)}
        />
      </div>
    </div>
  )
}
