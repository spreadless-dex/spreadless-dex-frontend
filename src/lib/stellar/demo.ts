// Routing demo: the Tranche 2 vault set, before the Factory exists.
//
// The pathfinder only becomes visible when there is something to choose
// between, and today the chain holds exactly one pool. This module adds the
// two vaults the deliverables doc describes (A: USDx/sUSDC, B: sUSDC/PYUSD)
// as *local* pools: real StableSwap math over seeded reserves, run in the
// browser instead of on the RPC. The existing pool keeps being quoted live.
//
// Nothing here is ever signed. A demo route executes as a staged walk through
// the same phases a real Router call goes through, so the team can evaluate
// the flow end to end (including the all-or-nothing revert) before the Router
// is deployed. Every screen that touches a demo vault says so.
//
// Delete this file when the Factory registry is wired; nothing else imports
// its internals.

import { create } from "zustand";
import { TOKENS } from "./config";

// ── Switches ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "spreadless-routing-demo";

interface RoutingDemoState {
  /** Demo vaults are part of the registry and demo routes can "execute". */
  enabled: boolean;
  /**
   * Make the next demo execution revert at this leg (1-based) to show the
   * atomic rollback. null: execute normally.
   */
  failHop: number | null;
  setEnabled: (on: boolean) => void;
  setFailHop: (hop: number | null) => void;
}

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("routing") === "demo") {
      localStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export const useRoutingDemo = create<RoutingDemoState>((set) => ({
  enabled: readStored(),
  failHop: null,
  setEnabled: (on) => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch {
      // Private mode or blocked storage: the toggle still works for this tab.
    }
    set({ enabled: on, failHop: null });
  },
  setFailHop: (hop) => set({ failHop: hop }),
}));

/** Non-React read, for the registry and router modules. */
export function isRoutingDemo(): boolean {
  return useRoutingDemo.getState().enabled;
}

// ── Demo vaults ──────────────────────────────────────────────────────────

export interface DemoVault {
  address: string;
  label: string;
  tokens: string[];
  /** Reserves in raw units, same order as `tokens`. */
  reserves: bigint[];
  feeBps: number;
  amp: bigint;
}

const addr = (symbol: string) => {
  const t = TOKENS.find((x) => x.symbol === symbol);
  if (!t) throw new Error(`Demo vault references unknown token ${symbol}`);
  return t.contractId;
};

// Valid-looking contract ids that cannot collide with anything deployed: the
// prefix is a real C-address shape, the body is a fixed tag. They exist so
// the graph, the activity log and the drawer treat a demo hop like any other.
export const DEMO_VAULT_A = "CDEMO000000000000000000000000000000000000000000000VAULTA";
export const DEMO_VAULT_B = "CDEMO000000000000000000000000000000000000000000000VAULTB";

const M = 10_000_000n; // one token at 7 decimals

/**
 * Seeding matters more than code here. The doc asks Quinn to seed A and B so
 * the multi-hop route beats direct Vault C at an agreed test amount. These
 * reserves are deep and cheap on purpose: at 1 bps per leg the two-hop route
 * costs 2 bps in fees and almost nothing in impact, while the live pool's
 * impact grows with size. Small trades favour direct, large trades favour the
 * hop, and the crossover is visible on screen.
 */
export const DEMO_VAULTS: DemoVault[] = [
  {
    address: DEMO_VAULT_A,
    label: "Vault A",
    tokens: [addr("USDx"), addr("sUSDC")],
    reserves: [2_500_000n * M, 2_500_000n * M],
    feeBps: 1,
    amp: 200n,
  },
  {
    address: DEMO_VAULT_B,
    label: "Vault B",
    tokens: [addr("sUSDC"), addr("PYUSD")],
    reserves: [1_800_000n * M, 1_800_000n * M],
    feeBps: 1,
    amp: 200n,
  },
];

export function demoVault(address: string): DemoVault | undefined {
  return DEMO_VAULTS.find((v) => v.address === address);
}

export function isDemoVault(address: string): boolean {
  return demoVault(address) !== undefined;
}

// ── StableSwap math ──────────────────────────────────────────────────────
//
// Integer Newton iterations, the same shape the contract runs. Kept in bigint
// so a demo quote rounds the way an on-chain quote rounds.

function getD(xp: bigint[], amp: bigint): bigint {
  const n = BigInt(xp.length);
  const S = xp.reduce((a, b) => a + b, 0n);
  if (S === 0n) return 0n;
  const Ann = amp * n;
  let D = S;
  for (let i = 0; i < 255; i++) {
    let D_P = D;
    for (const x of xp) D_P = (D_P * D) / (x * n);
    const prev = D;
    D = ((Ann * S + D_P * n) * D) / ((Ann - 1n) * D + (n + 1n) * D_P);
    if ((D > prev ? D - prev : prev - D) <= 1n) break;
  }
  return D;
}

function getY(i: number, j: number, x: bigint, xp: bigint[], amp: bigint): bigint {
  const n = BigInt(xp.length);
  const D = getD(xp, amp);
  const Ann = amp * n;
  let c = D;
  let S = 0n;
  for (let k = 0; k < xp.length; k++) {
    let _x: bigint;
    if (k === i) _x = x;
    else if (k !== j) _x = xp[k];
    else continue;
    S += _x;
    c = (c * D) / (_x * n);
  }
  c = (c * D) / (Ann * n);
  const b = S + D / Ann;
  let y = D;
  for (let k = 0; k < 255; k++) {
    const prev = y;
    y = (y * y + c) / (2n * y + b - D);
    if ((y > prev ? y - prev : prev - y) <= 1n) break;
  }
  return y;
}

/**
 * Exact-input quote against a demo vault. Throws like a contract would when
 * the vault does not hold the pair or the trade would drain it, so a dead
 * leg shows up in the graph the same way a real revert does.
 */
export function simulateDemoSwap(
  vault: DemoVault,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): bigint {
  const i = vault.tokens.indexOf(tokenIn);
  const j = vault.tokens.indexOf(tokenOut);
  if (i < 0 || j < 0 || i === j) throw new Error("Error(Contract, #3) TokenNotInPool");
  if (amountIn <= 0n) throw new Error("Error(Contract, #5) InvalidAmount");
  const y = getY(i, j, vault.reserves[i] + amountIn, vault.reserves, vault.amp);
  const gross = vault.reserves[j] - y - 1n;
  if (gross <= 0n || gross >= vault.reserves[j]) {
    throw new Error("Error(Contract, #9) InsufficientLiquidity");
  }
  return (gross * BigInt(10_000 - vault.feeBps)) / 10_000n;
}

/** A recognisable but obviously fake hash, so the explorer link is never shown. */
export const DEMO_TX_HASH = "";

export const DEMO_STEP_MS = { preparing: 700, signing: 1500, submitting: 2600 } as const;
