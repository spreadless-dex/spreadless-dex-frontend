import { useMemo, useState } from "react";

// ── The StableSwap invariant, faithfully ──────────────────────────────────
// This is Curve's get_y for a 2-coin pool: given one reserve x, the total
// invariant D, and the amplification coefficient A, solve for the other reserve
// y that keeps the invariant satisfied. Newton's method, same recurrence the
// on-chain contract uses — so the shape you drag here is the shape the pool
// actually prices against.
function getY(x: number, A: number, D: number): number {
  const n = 2;
  const Ann = A * n * n; // A · nⁿ
  let c = D;
  c = (c * D) / (x * n); //  → D²/(2x)
  c = (c * D) / (Ann * n); //  → D³/(4·Ann·x)
  const b = x + D / Ann;
  let y = D;
  for (let i = 0; i < 128; i++) {
    const prev = y;
    y = (y * y + c) / (2 * y + b - D);
    if (Math.abs(y - prev) < 1e-10) break;
  }
  return y;
}

// Fixed invariant: a balanced 2-coin pool sitting at (100, 100), so D = 200 and
// the constant-product comparison shares k = 100·100.
const D = 200;
const DOMAIN = 200;
const X0 = 100; // balanced reserve
const K = X0 * X0; // constant-product k through the same point

// ── SVG plot geometry ──
const W = 360;
const H = 360;
const M = { l: 34, r: 14, t: 14, b: 30 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;
const mapX = (v: number) => M.l + (v / DOMAIN) * PW;
const mapY = (v: number) => M.t + PH - (v / DOMAIN) * PH;

// Amplification slider runs on a log scale from A=1 (≈ constant product) to
// the protocol's ceiling; above roughly A 1200 the curve is visually a flat
// line, so the top third of the slider mostly shows the impact figure moving.
const A_MIN = 1;
const A_MAX = 50_000;
const idxToA = (idx: number) =>
  Math.round(
    Math.exp(
      Math.log(A_MIN) + (Math.log(A_MAX) - Math.log(A_MIN)) * (idx / 100),
    ),
  );

function fmt(n: number, dp = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}
function pct(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v > 0 && v < 0.01) return "<0.01%";
  return `${fmt(v, 2)}%`;
}

export default function CurveVisualizer() {
  const [ampIdx, setAmpIdx] = useState(43); // ≈ A=100
  const [tradeIn, setTradeIn] = useState(40);
  const A = idxToA(ampIdx);

  const data = useMemo(() => {
    // StableSwap curve — sample across the domain.
    const ssPts: string[] = [];
    for (let x = 1; x <= DOMAIN - 1; x += 1.5) {
      const y = getY(x, A, D);
      if (y > 0 && y <= DOMAIN * 1.4) ssPts.push(`${mapX(x)},${mapY(y)}`);
    }
    // Constant-product curve y = k/x, clipped to the box.
    const cpPts: string[] = [];
    for (let x = K / DOMAIN; x <= DOMAIN; x += 1.5) {
      const y = K / x;
      if (y <= DOMAIN) cpPts.push(`${mapX(x)},${mapY(y)}`);
    }

    // Trade: push `tradeIn` of coin X into the balanced pool, read coin Y out.
    const newX = Math.min(X0 + tradeIn, DOMAIN - 0.5);
    const inAmt = newX - X0;
    const newYss = getY(newX, A, D);
    const outSS = X0 - newYss;
    const newYcp = K / newX;
    const outCP = X0 - newYcp;

    const slipSS = inAmt > 0 ? (1 - outSS / inAmt) * 100 : 0;
    const slipCP = inAmt > 0 ? (1 - outCP / inAmt) * 100 : 0;

    return {
      ssPts: ssPts.join(" "),
      cpPts: cpPts.join(" "),
      marker: { x: mapX(newX), y: mapY(newYss) },
      markerCP: { x: mapX(newX), y: mapY(newYcp) },
      inAmt,
      outSS,
      outCP,
      slipSS,
      slipCP,
    };
  }, [A, tradeIn]);

  const c = {
    text: "var(--c-text)",
    muted: "var(--c-text-muted)",
    faint: "var(--c-text-faint)",
    border: "var(--c-border)",
    border2: "var(--c-border-2)",
    surface: "var(--c-surface)",
    surface2: "var(--c-surface-2)",
  };

  const ampLabel =
    A <= 3
      ? "≈ constant product"
      : A >= 1200
        ? "≈ constant sum (flat)"
        : "stableswap";

  return (
    <div
      style={{
        border: `1px solid ${c.border2}`,
        borderRadius: "1rem",
        background: `color-mix(in srgb, ${c.surface} 82%, transparent)`,
        padding: "1.25rem",
        margin: "0 0 1.75rem",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
        {/* ── Plot ── */}
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            style={{ display: "block", overflow: "visible" }}
            role="img"
            aria-label="StableSwap invariant curve versus the constant-product curve"
          >
            <defs>
              <clipPath id="cv-plot">
                <rect x={M.l} y={M.t} width={PW} height={PH} />
              </clipPath>
            </defs>

            {/* frame + gridlines at the balanced midpoint */}
            <rect
              x={M.l}
              y={M.t}
              width={PW}
              height={PH}
              fill="none"
              stroke={c.border}
              strokeWidth={1}
            />
            <line
              x1={mapX(X0)}
              y1={M.t}
              x2={mapX(X0)}
              y2={M.t + PH}
              stroke={c.border}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <line
              x1={M.l}
              y1={mapY(X0)}
              x2={M.l + PW}
              y2={mapY(X0)}
              stroke={c.border}
              strokeWidth={1}
              strokeDasharray="2 4"
            />

            <g clipPath="url(#cv-plot)">
              {/* constant product — faint, dashed */}
              <polyline
                points={data.cpPts}
                fill="none"
                stroke={c.faint}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeLinejoin="round"
              />
              {/* stableswap — the emphasised curve, solid ink */}
              <polyline
                points={data.ssPts}
                fill="none"
                stroke={c.text}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* trade guide lines */}
              <line
                x1={data.marker.x}
                y1={data.marker.y}
                x2={data.marker.x}
                y2={M.t + PH}
                stroke={c.border2}
                strokeWidth={1}
              />
              <line
                x1={M.l}
                y1={data.marker.y}
                x2={data.marker.x}
                y2={data.marker.y}
                stroke={c.border2}
                strokeWidth={1}
              />
              {/* constant-product landing point for the same trade */}
              <circle
                cx={data.markerCP.x}
                cy={data.markerCP.y}
                r={3}
                fill={c.faint}
              />
              {/* start + end points on the stableswap curve */}
              <circle cx={mapX(X0)} cy={mapY(X0)} r={3} fill={c.muted} />
              <circle
                cx={data.marker.x}
                cy={data.marker.y}
                r={5}
                fill={c.text}
                stroke={c.surface}
                strokeWidth={1.5}
              />
            </g>

            {/* axis labels */}
            <text
              x={M.l + PW / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize={10}
              fill={c.faint}
            >
              reserve of USDC →
            </text>
            <text
              x={-(M.t + PH / 2)}
              y={11}
              textAnchor="middle"
              fontSize={10}
              fill={c.faint}
              transform="rotate(-90)"
            >
              reserve of PYUSD →
            </text>
          </svg>

          {/* legend */}
          <div
            style={{
              display: "flex",
              gap: "1.25rem",
              marginTop: "0.4rem",
              flexWrap: "wrap",
            }}
          >
            <Legend
              color={c.text}
              dash={false}
              label="StableSwap (A adjustable)"
            />
            <Legend color={c.faint} dash label="Constant product (x·y=k)" />
          </div>
        </div>

        {/* ── Controls + readout ── */}
        <div
          style={{
            flex: "1 1 240px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
          }}
        >
          <Control
            label="Amplification (A)"
            value={`${A.toLocaleString("en-US")}`}
            sub={ampLabel}
            min={0}
            max={100}
            step={1}
            val={ampIdx}
            onChange={setAmpIdx}
            color={c}
          />
          <Control
            label="Trade size"
            value={`${fmt(data.inAmt, 0)} USDC`}
            sub={`into a ${X0}-USDC / ${X0}-PYUSD pool`}
            min={1}
            max={160}
            step={1}
            val={tradeIn}
            onChange={setTradeIn}
            color={c}
          />

          <div
            style={{
              borderTop: `1px solid ${c.border}`,
              paddingTop: "0.9rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.7rem",
            }}
          >
            <Readout
              title="StableSwap"
              out={`${fmt(data.outSS, 3)} PYUSD`}
              slip={pct(data.slipSS)}
              strong
              color={c}
            />
            <Readout
              title="Constant product"
              out={`${fmt(data.outCP, 3)} PYUSD`}
              slip={pct(data.slipCP)}
              color={c}
            />
            <p
              style={{
                fontSize: "0.75rem",
                lineHeight: 1.5,
                color: c.muted,
                margin: 0,
              }}
            >
              Same trade, same reserves. The gap between the two slippage
              figures is exactly what the amplification factor buys you. Drag{" "}
              <strong style={{ color: c.text }}>A</strong> up and watch the
              StableSwap curve flatten toward 1:1.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({
  color,
  dash,
  label,
}: {
  color: string;
  dash: boolean;
  label: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
        fontSize: "0.75rem",
        color: "var(--c-text-muted)",
      }}
    >
      <svg width="22" height="8" aria-hidden="true">
        <line
          x1="0"
          y1="4"
          x2="22"
          y2="4"
          stroke={color}
          strokeWidth={dash ? 1.5 : 2.5}
          strokeDasharray={dash ? "4 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

function Control({
  label,
  value,
  sub,
  min,
  max,
  step,
  val,
  onChange,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  min: number;
  max: number;
  step: number;
  val: number;
  onChange: (n: number) => void;
  color: Record<string, string>;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "0.35rem",
        }}
      >
        <span
          style={{
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: color.faint,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: "0.95rem",
            fontWeight: 700,
            color: color.text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          accentColor: color.text as string,
          cursor: "pointer",
        }}
        aria-label={label}
      />
      <p
        style={{
          fontSize: "0.72rem",
          color: color.faint,
          margin: "0.2rem 0 0",
        }}
      >
        {sub}
      </p>
    </div>
  );
}

function Readout({
  title,
  out,
  slip,
  strong,
  color,
}: {
  title: string;
  out: string;
  slip: string;
  strong?: boolean;
  color: Record<string, string>;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "0.5rem",
      }}
    >
      <span
        style={{
          fontSize: "0.8rem",
          color: strong ? color.text : color.muted,
          fontWeight: strong ? 600 : 400,
        }}
      >
        {title}
      </span>
      <span
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "baseline",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ fontSize: "0.8rem", color: color.muted }}>{out}</span>
        <span
          style={{
            fontSize: "0.85rem",
            fontWeight: 700,
            color: strong ? color.text : color.muted,
            minWidth: "4.5rem",
            textAlign: "right",
          }}
        >
          {slip} slip
        </span>
      </span>
    </div>
  );
}
