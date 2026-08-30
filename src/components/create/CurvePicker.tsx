import {
  AMP_MAX,
  AMP_MIN,
  AMP_PRESETS,
  logToSlider,
  priceImpactPct,
  sliderToLog,
} from '../../lib/stellar/poolParams'
import SegmentedControl from './SegmentedControl'

// Step 2: amplification. Three named presets carry the decision; Custom
// reveals a log slider plus a typed field. The hint line translates A into
// the one number people feel: what a $10k swap does to the price.

interface CurvePickerProps {
  amp: number
  custom: boolean
  onChange: (amp: number, custom: boolean) => void
}

const fmtImpact = (v: number) => (v < 0.0005 ? 'under 0.001%' : `${v.toFixed(3)}%`)

export default function CurvePicker({ amp, custom, onChange }: CurvePickerProps) {
  const value = custom ? 'custom' : (AMP_PRESETS.find((p) => p.amp === amp)?.key ?? 'custom')

  return (
    <div>
      <SegmentedControl
        ariaLabel="Amplification preset"
        options={[
          ...AMP_PRESETS.map((p) => ({ key: p.key, label: p.label, hint: p.hint })),
          { key: 'custom', label: 'Custom', hint: `${AMP_MIN} to ${AMP_MAX}` },
        ]}
        value={value}
        onChange={(key) => {
          if (key === 'custom') onChange(amp, true)
          else onChange(AMP_PRESETS.find((p) => p.key === key)!.amp, false)
        }}
      />
      {custom && (
        <div className="flex items-center gap-3 mt-3 animate-fade-up">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={logToSlider(amp, AMP_MIN, AMP_MAX)}
            onChange={(e) => onChange(Math.round(sliderToLog(Number(e.target.value), AMP_MIN, AMP_MAX)), true)}
            aria-label="Amplification"
            className="flex-1"
            style={{ accentColor: 'var(--c-accent)' }}
          />
          <input
            value={amp}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (Number.isFinite(v)) onChange(Math.max(AMP_MIN, Math.min(AMP_MAX, v)), true)
            }}
            inputMode="numeric"
            aria-label="A value"
            className="w-20 px-2.5 py-1.5 rounded-lg text-[13px] text-right tabular-nums outline-none"
            style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
          />
        </div>
      )}
      <p className="text-[12px] mt-2.5" style={{ color: 'var(--c-text-muted)' }}>
        A {amp}: a $10k swap moves the price {fmtImpact(priceImpactPct(amp))}.
      </p>
    </div>
  )
}
