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
/** Raised from 1 000 to 50 000 per DEX-61. */
export const AMP_MAX = 50_000;
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

/** A for UI copy: "50,000" rather than "50000". */
export function fmtAmp(a: number): string {
  return a.toLocaleString("en-US");
}

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

/**
 * What the builder knows about a pool that already exists. `amp` and
 * `feeBps` are optional because the config-backed vault has no getters for
 * either; a pool with unknown settings can never be called an exact twin.
 * `tvl` is filled in lazily (readPoolState per twin) and is what separates
 * two pools that carry the same settings.
 */
export interface ExistingPool {
  address: string;
  tokens: string[];
  amp?: number;
  feeBps?: number;
  /** Total value locked in USD terms, once read. */
  tvl?: number;
}

/** Every existing pool holding exactly this asset set, whatever its settings. */
export function findTwins<V extends { tokens: string[] }>(tokens: string[], vaults: V[]): V[] {
  return vaults.filter((v) => sameTokenSet(v.tokens, tokens));
}

/**
 * Same assets, same A, same fee. The Factory deploys this happily, so the
 * builder allows it too and only says what it means: the new pool starts at
 * zero TVL next to one that already has depth.
 */
export function findDuplicate<V extends ExistingPool>(draft: PoolDraft, vaults: V[]): V | undefined {
  return findTwins(draft.tokens, vaults).find(
    (v) => v.amp === draft.amp && v.feeBps === percentToBps(draft.feePct),
  );
}

/** "A 100 · 0.04% fee" for twin notices, listing only what is known. */
export function describeSettings(p: { amp?: number; feeBps?: number }): string {
  const parts: string[] = [];
  if (p.amp !== undefined) parts.push(`A ${fmtAmp(p.amp)}`);
  if (p.feeBps !== undefined) parts.push(`${(p.feeBps / 100).toFixed(2)}% fee`);
  return parts.length ? parts.join(" · ") : "settings unknown";
}

/** True when both A and fee are known, so the twin check can be conclusive. */
export function settingsKnown(p: { amp?: number; feeBps?: number }): boolean {
  return p.amp !== undefined && p.feeBps !== undefined;
}

// ── Validation ───────────────────────────────────────────────────────────

/** "config" covers the asset set together with A and fee: the twin check. */
export type DraftField = "tokens" | "config" | "amp" | "fee" | "caps" | "lpMaxSupply";

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
  existing: ExistingPool[],
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const n = draft.tokens.length;

  if (n < MIN_TOKENS) {
    issues.push({ field: "tokens", message: "Pick at least two assets.", severity: "error" });
  } else if (n > MAX_TOKENS) {
    issues.push({ field: "tokens", message: `${MAX_TOKENS} assets max.`, severity: "error" });
  } else if (new Set(draft.tokens).size !== n) {
    issues.push({ field: "tokens", message: "Each asset can only be in the pool once.", severity: "error" });
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

  // An identical pool is allowed, the Factory permits it, so this is a note
  // and never a block: it sits on its own field, so the curve and fee steps
  // stay usable if the user would rather make the pool distinct after all.
  if (n >= MIN_TOKENS) {
    const twin = findDuplicate(draft, existing);
    if (twin) {
      issues.push({
        field: "config",
        message: `A pool with these assets and the same settings, ${describeSettings(twin)}, already exists. Yours deploys next to it and starts empty, so TVL decides which one traders and depositors land in.`,
        severity: "warning",
      });
    }
  }

  if (!Number.isInteger(draft.amp) || draft.amp < AMP_MIN || draft.amp > AMP_MAX) {
    issues.push({ field: "amp", message: `A must be a whole number from ${AMP_MIN} to ${fmtAmp(AMP_MAX)}.`, severity: "error" });
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
//
// A convention: the contract (like Curve's) uses Ann = A·n, not the
// whitepaper's A·nⁿ. Verified 2026-09-02 against the testnet vault: a
// simulated swap matches A·n to the 0.01% fee and misses A·nⁿ by ~0.3%.

export function getY(x: number, amp: number, D: number): number {
  const n = 2;
  const Ann = amp * n;
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

// n-coin form of the same solver, floats. Balanced pools give the same
// per-pair curve for any n under the A·n scaling, but the preview should
// price what the user actually picked rather than assume two coins.

export function getDN(xp: number[], amp: number): number {
  const n = xp.length;
  const Ann = amp * n;
  const S = xp.reduce((a, b) => a + b, 0);
  let D = S;
  for (let k = 0; k < 255; k++) {
    let DP = D;
    for (const x of xp) DP = (DP * D) / (x * n);
    const prev = D;
    D = ((Ann * S + DP * n) * D) / ((Ann - 1) * D + (n + 1) * DP);
    if (Math.abs(D - prev) < 1e-9) break;
  }
  return D;
}

/** Reserve of coin `j` after coin `i` moves to `x`, all others unchanged. */
export function getYN(i: number, j: number, x: number, xp: number[], amp: number): number {
  const n = xp.length;
  const Ann = amp * n;
  const D = getDN(xp, amp);
  let c = D;
  let S = 0;
  for (let k = 0; k < n; k++) {
    let v: number;
    if (k === i) v = x;
    else if (k !== j) v = xp[k];
    else continue;
    S += v;
    c = (c * D) / (v * n);
  }
  c = (c * D) / (Ann * n);
  const b = S + D / Ann;
  let y = D;
  for (let k = 0; k < 255; k++) {
    const prev = y;
    y = (y * y + c) / (2 * y + b - D);
    if (Math.abs(y - prev) < 1e-9) break;
  }
  return y;
}

/**
 * Percent of a trade lost to curvature (fees excluded) when swapping
 * `amount` of one coin for another in a balanced `n`-coin pool holding
 * `reserve` of each.
 */
export function priceImpactPct(amp: number, n = 2, reserve = 1_000_000, amount = 10_000): number {
  const coins = Math.max(2, n);
  const xp = Array<number>(coins).fill(reserve);
  const yAfter = getYN(0, 1, reserve + amount, xp, amp);
  const out = reserve - yAfter;
  return Math.max(0, (1 - out / amount) * 100);
}

// ── Narratives ───────────────────────────────────────────────────────────
//
// One sentence per choice for the preview. Bucketed on purpose: the text
// should change when the meaning changes, not on every slider tick, so the
// scene transition fires a handful of times per session rather than a
// hundred.

export function curveNarrative(amp: number): string {
  if (amp >= 500) return "Nearly a straight line. Trades at 1:1 until the pool is badly lopsided, then the price snaps.";
  if (amp >= 150) return "Flat around 1:1. Suited to assets that hold their peg tightly.";
  if (amp >= 50) return "The usual shape for stable pairs: cheap near balance, firm when one side runs low.";
  if (amp >= 10) return "Bends early. Prices react sooner when one asset drifts, which protects the other side.";
  return "Close to constant product. Every trade moves the price; only for pairs that really wobble.";
}

export function feeNarrative(feePct: number): string {
  if (feePct <= 0.015) return "A thin fee for volume. Routers pick this pool first; LPs earn on turnover.";
  if (feePct < 0.07) return "The standard fee. Competitive for stable pairs without starving LPs.";
  if (feePct <= 0.2) return "A wider fee for thin or volatile pairs. Fewer routed trades, more per trade.";
  return "A steep fee. Only pays off where there is no other venue for this pair.";
}

export function assetsNarrative(symbols: string[]): string {
  const n = symbols.length;
  if (n === 0) return "Pick assets to see how this pool would trade.";
  if (n === 1) return "One more asset makes a pool.";
  if (n === 2) return `${symbols[0]} and ${symbols[1]} on one curve.`;
  return `${n} assets on one curve. Every pair trades at the same A; the sketch shows ${symbols[0]} against ${symbols[1]}.`;
}

/** What LPs keep of the swap fee on $1M of daily volume, in dollars. */
export function lpEarnPerMillion(feePct: number, sharePct = PROTOCOL_SHARE_PCT): number {
  return 1_000_000 * (feePct / 100) * (1 - sharePct / 100);
}

/**
 * Meter width, 0..100, for the price impact bar. Log scale from the flattest
 * reachable curve (~A 50 000) to the constant-product baseline for the same
 * swap, so a full bar means "as steep as constant product"; a linear scale
 * saturates for every A below ~66.
 */
export function impactMeterPct(impactPct: number): number {
  const floor = 0.00001;
  const ceil = 0.99;
  const v = (Math.log(Math.max(impactPct, floor) / floor) / Math.log(ceil / floor)) * 100;
  return Math.min(100, Math.max(0, v));
}

// Curves are clamped well above the sketch's 0..200 viewBox instead of at
// its edge: at low amp the visible run-off stays steep rather than folding
// into a flat plateau with a corner. The SVG hides everything above y=200.
const CURVE_Y_CLIP = 400;

/**
 * Curve sample points on a fixed 0..200 domain (balanced pool at 100 per
 * coin), as [x, y] pairs for the first two coins of an `n`-coin pool. Same
 * x for every amp, so two curves can be tweened.
 */
export function stableCurvePoints(amp: number, n = 2, samples = 80): [number, number][] {
  const xp = Array<number>(Math.max(2, n)).fill(100);
  const pts: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const x = 6 + (194 * i) / samples;
    pts.push([x, Math.min(getYN(0, 1, x, xp, amp), CURVE_Y_CLIP)]);
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
