// Pure helpers for the pool builder: presets, validation, unit conversion and
// the on-screen math (curve, price impact). No SDK, no network, so every rule
// here is testable in isolation and the UI never does its own arithmetic.
//
// Ranges below are assumptions until the contract team confirms them (see
// design/pool-creation-plan.md, section 5). Each one is a single constant so
// a confirmed number is a one-line change.

import { PROTOCOL_BENEFICIARY, TOKENS, type Peg } from "./config";
import { toRawUnits } from "./units";

// ── Limits ───────────────────────────────────────────────────────────────

export const MIN_TOKENS = 2;
/** Vault C has four, so four is known to work. */
export const MAX_TOKENS = 4;
export const AMP_MIN = 1;
export const AMP_MAX = 1000;
/** Swap fee bounds in percent. Contract says "within the configured fee range". */
export const FEE_MIN_PCT = 0.001;
export const FEE_MAX_PCT = 1;

/** The contract's fee unit: 1e9 == 100%. */
export const FEE_SCALE = 1_000_000_000n;

/**
 * "No cap" sentinel for max_caps and lp_max_supply. The contract rejects an
 * invalid cap (#107) but does not document the ceiling; half of i128 keeps
 * headroom for the invariant math. Confirm with the contract team.
 */
export const NO_CAP: bigint = 1n << 126n;

// ── Presets ──────────────────────────────────────────────────────────────

export interface AmpPreset {
  key: "tight" | "standard" | "loose";
  label: string;
  amp: number;
  hint: string;
}

export const AMP_PRESETS: AmpPreset[] = [
  { key: "tight", label: "Tight", amp: 200, hint: "A 200 · same peg" },
  { key: "standard", label: "Standard", amp: 100, hint: "A 100 · default" },
  { key: "loose", label: "Loose", amp: 20, hint: "A 20 · pegs drift" },
];

export const DEFAULT_AMP = 100;

export interface FeePreset {
  pct: number;
  hint: string;
}

export const FEE_PRESETS: FeePreset[] = [
  { pct: 0.01, hint: "volume play" },
  { pct: 0.04, hint: "standard" },
  { pct: 0.1, hint: "thin pairs" },
];

export const DEFAULT_FEE_PCT = 0.04;

/**
 * Share of the swap fee routed to the protocol, in percent; the rest stays
 * with the LPs. Fixed by the protocol: a pool creator sets the swap fee, not
 * how it is split, and gets no cut for having deployed the pool.
 */
export const PROTOCOL_SHARE_PCT = 100 / 3;

/** Share percent for UI copy; the exact value repeats, so round to one decimal. */
export function formatSharePct(pct: number): string {
  return `${Number(pct.toFixed(1))}`;
}

// ── Draft ────────────────────────────────────────────────────────────────

/** Everything the builder collects, in human units. */
export interface PoolDraft {
  /** Token contract addresses, in the order the user picked them. */
  tokens: string[];
  amp: number;
  feePct: number;
  /** Per-token cap in human units, keyed by address. Empty string: no cap. */
  caps: Record<string, string>;
  /** LP supply cap in human units. Empty string: no cap. */
  lpMaxSupply: string;
}

export function emptyDraft(): PoolDraft {
  return {
    tokens: [],
    amp: DEFAULT_AMP,
    feePct: DEFAULT_FEE_PCT,
    caps: {},
    lpMaxSupply: "",
  };
}

// ── Conversion ───────────────────────────────────────────────────────────

/** 0.04 (percent) → 400_000 (1e9 scale). Rounds to the nearest unit. */
export function percentToFeeScale(pct: number): bigint {
  return BigInt(Math.round((pct / 100) * Number(FEE_SCALE)));
}

export function feeScaleToPercent(v: bigint): number {
  return (Number(v) / Number(FEE_SCALE)) * 100;
}

/** Percent → basis points, for the registry's `feeBps` label. */
export function percentToBps(pct: number): number {
  return Math.round(pct * 100);
}

/**
 * Canonical token order: the Factory validates it and the doc calls it
 * "canonical token ordering" without defining it. Byte order of the strkey
 * (plain string compare on the C… address) is the usual Soroban choice.
 */
export function canonicalOrder(addresses: string[]): string[] {
  return [...addresses].sort();
}

/** Same set of tokens, regardless of order. */
export function sameTokenSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = canonicalOrder(a);
  const sb = canonicalOrder(b);
  return sa.every((x, i) => x === sb[i]);
}

export function findDuplicate<V extends { tokens: string[] }>(
  tokens: string[],
  vaults: V[],
): V | undefined {
  return vaults.find((v) => sameTokenSet(v.tokens, tokens));
}

// ── Validation ───────────────────────────────────────────────────────────

export type DraftField = "tokens" | "amp" | "fee" | "caps" | "lpMaxSupply";

export interface DraftIssue {
  field: DraftField;
  message: string;
  /** Warnings do not block deploy. */
  severity: "error" | "warning";
}

export interface TokenMeta {
  address: string;
  symbol: string;
  decimals: number;
  peg?: Peg;
}

export function isContractAddress(s: string): boolean {
  return /^C[A-Z2-7]{55}$/.test(s.trim());
}

export function isAccountAddress(s: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(s.trim());
}

export function validateDraft(
  draft: PoolDraft,
  metaFor: (address: string) => TokenMeta | undefined,
  existing: { tokens: string[] }[],
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const n = draft.tokens.length;

  if (n < MIN_TOKENS) {
    issues.push({ field: "tokens", message: "Pick at least two assets.", severity: "error" });
  } else if (n > MAX_TOKENS) {
    issues.push({ field: "tokens", message: `${MAX_TOKENS} assets max.`, severity: "error" });
  } else if (new Set(draft.tokens).size !== n) {
    issues.push({ field: "tokens", message: "Each asset can only be in the pool once.", severity: "error" });
  } else if (findDuplicate(draft.tokens, existing)) {
    issues.push({ field: "tokens", message: "This pool already exists.", severity: "error" });
  } else {
    const pegs = new Set(draft.tokens.map((a) => metaFor(a)?.peg).filter(Boolean));
    if (pegs.size > 1) {
      issues.push({
        field: "tokens",
        message: "Mixed pegs. StableSwap expects assets that trade near 1:1.",
        severity: "warning",
      });
    }
  }

  if (!Number.isInteger(draft.amp) || draft.amp < AMP_MIN || draft.amp > AMP_MAX) {
    issues.push({ field: "amp", message: `A must be a whole number from ${AMP_MIN} to ${AMP_MAX}.`, severity: "error" });
  }

  if (!(draft.feePct >= FEE_MIN_PCT && draft.feePct <= FEE_MAX_PCT)) {
    issues.push({ field: "fee", message: `Fee must be between ${FEE_MIN_PCT}% and ${FEE_MAX_PCT}%.`, severity: "error" });
  }

  for (const address of draft.tokens) {
    const cap = draft.caps[address]?.trim();
    if (cap && !(Number(cap) > 0)) {
      issues.push({ field: "caps", message: `Cap for ${metaFor(address)?.symbol ?? "a token"} must be a positive number.`, severity: "error" });
      break;
    }
  }

  const lp = draft.lpMaxSupply.trim();
  if (lp && !(Number(lp) > 0)) {
    issues.push({ field: "lpMaxSupply", message: "LP supply cap must be a positive number.", severity: "error" });
  }

  return issues;
}

export function hasErrors(issues: DraftIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

// ── Constructor args ─────────────────────────────────────────────────────

/** Mirrors the SDK's `__constructor` for the pool contract. */
export interface PoolConstructorArgs {
  owner: string;
  tokens: string[];
  amp_factor: number;
  swap_fee: bigint;
  protocol_fee: bigint;
  beneficiary: string;
  max_caps: bigint[];
  lp_max_supply: bigint;
}

export const LP_DECIMALS = 9;

export function toConstructorArgs(
  draft: PoolDraft,
  owner: string,
  metaFor: (address: string) => TokenMeta | undefined,
): PoolConstructorArgs {
  const tokens = canonicalOrder(draft.tokens);
  return {
    owner,
    tokens,
    amp_factor: draft.amp,
    swap_fee: percentToFeeScale(draft.feePct),
    // Read as "share of the swap fee that goes to the beneficiary", in the
    // same 1e9 scale as swap_fee. The contract doc says the protocol's cut of
    // the fee is routed to the beneficiary; confirm the scale before mainnet.
    protocol_fee: percentToFeeScale(PROTOCOL_SHARE_PCT),
    // Always the protocol's address, never the creator's.
    beneficiary: PROTOCOL_BENEFICIARY ?? owner,
    max_caps: tokens.map((address) => {
      const cap = draft.caps[address]?.trim();
      if (!cap) return NO_CAP;
      return toRawUnits(cap, metaFor(address)?.decimals ?? 7);
    }),
    lp_max_supply: draft.lpMaxSupply.trim() ? toRawUnits(draft.lpMaxSupply.trim(), LP_DECIMALS) : NO_CAP,
  };
}

// ── On-screen math ───────────────────────────────────────────────────────
//
// Two-coin StableSwap in floats: the preview sketch and the "price impact on
// a $10k swap" figure. Same recurrence as CurveVisualizer in the docs; the
// bigint version in demo.ts is for quotes that must round like the chain.

export function getY(x: number, amp: number, D: number): number {
  const n = 2;
  const Ann = amp * n * n;
  let c = D;
  c = (c * D) / (x * n);
  c = (c * D) / (Ann * n);
  const b = x + D / Ann;
  let y = D;
  for (let i = 0; i < 128; i++) {
    const prev = y;
    y = (y * y + c) / (2 * y + b - D);
    if (Math.abs(y - prev) < 1e-10) break;
  }
  return y;
}

/**
 * Percent of a trade lost to curvature (fees excluded) when swapping
 * `amount` into a balanced pool holding `reserve` of each side.
 */
export function priceImpactPct(amp: number, reserve = 1_000_000, amount = 10_000): number {
  const D = 2 * reserve;
  const yAfter = getY(reserve + amount, amp, D);
  const out = reserve - yAfter;
  return Math.max(0, (1 - out / amount) * 100);
}

/** What LPs keep of the swap fee on $1M of daily volume, in dollars. */
export function lpEarnPerMillion(feePct: number, sharePct = PROTOCOL_SHARE_PCT): number {
  return 1_000_000 * (feePct / 100) * (1 - sharePct / 100);
}

/**
 * Meter width, 0..100, for the price impact bar. Log scale from the flattest
 * reachable curve (~A 1000) to the constant-product baseline for the same
 * swap, so a full bar means "as steep as constant product"; a linear scale
 * saturates for every A below ~66.
 */
export function impactMeterPct(impactPct: number): number {
  const floor = 0.0005;
  const ceil = 0.99;
  const v = (Math.log(Math.max(impactPct, floor) / floor) / Math.log(ceil / floor)) * 100;
  return Math.min(100, Math.max(0, v));
}

// Curves are clamped well above the sketch's 0..200 viewBox instead of at
// its edge: at low amp the visible run-off stays steep rather than folding
// into a flat plateau with a corner. The SVG hides everything above y=200.
const CURVE_Y_CLIP = 400;

/**
 * Curve sample points on a fixed 0..200 domain (balanced pool at 100/100),
 * as [x, y] pairs. Same x for every amp, so two curves can be tweened.
 */
export function stableCurvePoints(amp: number, samples = 80): [number, number][] {
  const D = 200;
  const pts: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const x = 6 + (194 * i) / samples;
    pts.push([x, Math.min(getY(x, amp, D), CURVE_Y_CLIP)]);
  }
  return pts;
}

export function constantProductPoints(samples = 80): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const x = 6 + (194 * i) / samples;
    pts.push([x, Math.min(10_000 / x, CURVE_Y_CLIP)]);
  }
  return pts;
}

/** Log-scale slider helpers: 0..100 ↔ value in [min, max]. */
export function sliderToLog(v: number, min: number, max: number): number {
  return Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * (v / 100));
}

export function logToSlider(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  return ((Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 100;
}

/** Display metadata for a known token; unknown addresses fall through. */
export function knownTokenMeta(address: string): TokenMeta | undefined {
  const t = TOKENS.find((x) => x.contractId === address);
  return t ? { address, symbol: t.symbol, decimals: t.decimals, peg: t.peg } : undefined;
}

export function poolName(symbols: string[]): string {
  return symbols.join(" / ");
}
