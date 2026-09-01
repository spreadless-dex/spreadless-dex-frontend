import {
  FEE_MAX_PCT,
  FEE_MIN_PCT,
  FEE_PRESETS,
  PROTOCOL_SHARE_PCT,
  formatSharePct,
  logToSlider,
  sliderToLog,
} from '../../lib/stellar/poolParams'
import SegmentedControl from './SegmentedControl'
import HairlineSlider from './HairlineSlider'
import Tooltip from '../Tooltip'

// Step 3: the swap fee. Presets first; Custom opens a log slider spanning
// 0.001% to 1%. How the fee splits is fixed by the protocol, so it is stated
// here rather than offered as a choice.

interface FeePickerProps {
  feePct: number
  custom: boolean
  onFee: (pct: number, custom: boolean) => void
}

export default function FeePicker({ feePct, custom, onFee }: FeePickerProps) {
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
          <HairlineSlider
            min={0}
            max={100}
            step={1}
            value={logToSlider(feePct, FEE_MIN_PCT, FEE_MAX_PCT)}
            onChange={(v) => onFee(Number(sliderToLog(v, FEE_MIN_PCT, FEE_MAX_PCT).toPrecision(2)), true)}
            ariaLabel="Swap fee"
            ariaValueText={`${feePct}%`}
            marks={[0, 1 / 3, 2 / 3, 1]}
            ticks={49}
            className="flex-1"
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
      <div className="flex items-center flex-wrap gap-x-1 gap-y-1 mt-3 text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
        <span className="flex items-center">
          A fixed {formatSharePct(PROTOCOL_SHARE_PCT)}% of the fee goes to the protocol, the rest to LPs.
          <Tooltip
            text="Every pool splits the same way and the creator gets no cut for deploying it. You set the swap fee, not the split, and you can change the fee after launch."
            label="About the fee split"
          />
        </span>
      </div>
    </div>
  )
}
