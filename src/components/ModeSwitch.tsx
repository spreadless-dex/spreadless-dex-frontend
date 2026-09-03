/**
 * Learn / Pro: how much the interface explains itself. Lives in the profile
 * panel. The choice is written to <html data-mode> by the store, and every
 * explanatory element on the page carries .learn-only, so the page behind
 * the panel responds the moment the thumb moves (see global.css).
 */
import { useAppStore, type UiMode } from "../store/useAppStore";

const OPTIONS: { key: UiMode; label: string; hint: string }[] = [
  { key: "learn", label: "Learn", hint: "Tooltips and short explanations stay on." },
  { key: "pro", label: "Pro", hint: "Numbers only. Explanations step aside." },
];

export default function ModeSwitch() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  return (
    <div>
      <div role="radiogroup" aria-label="Interface mode" className="mode-switch" data-mode={mode}>
        <span className="mode-thumb" aria-hidden="true" />
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={mode === o.key}
            onClick={() => setMode(o.key)}
            className="mode-option"
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mode-hint text-[11px] leading-snug mt-2 px-0.5" style={{ color: "var(--c-text-faint)" }}>
        {OPTIONS.map((o) => (
          <span key={o.key} data-active={mode === o.key} aria-hidden={mode !== o.key}>
            {o.hint}
          </span>
        ))}
      </p>
    </div>
  );
}
