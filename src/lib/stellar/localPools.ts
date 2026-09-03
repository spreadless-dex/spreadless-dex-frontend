// Pools this browser created, kept in localStorage until the Factory registry
// exists. Two kinds live here:
//   - "deploy": a real vault deployed straight through the SDK. The registry
//     appends these so /pools and the router see them like any other vault.
//   - "demo":   created in demo mode, nothing on chain. Shown in /pools with a
//     Demo badge so the flow can be evaluated end to end; never routed.
//
// Delete this module when readFactoryVaults() is wired; the Factory's registry
// is the source of truth from then on.

import { create } from "zustand";
import type { PoolConstructorArgs } from "./poolParams";

export type CreateBackend = "factory" | "deploy" | "demo";

export interface LocalPool {
  address: string;
  /** Canonical token order, as passed to the constructor. */
  tokens: string[];
  label: string;
  amp: number;
  feeBps: number;
  protocolSharePct: number;
  owner: string;
  backend: CreateBackend;
  /** Tx hash for deploy-backed pools, empty for demo. */
  hash: string;
  createdAt: number;
}

const STORAGE_KEY = "spreadless-local-pools";

function readStored(): LocalPool[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalPool[]) : [];
  } catch {
    return [];
  }
}

interface LocalPoolsState {
  pools: LocalPool[];
  add: (pool: LocalPool) => void;
  remove: (address: string) => void;
  /** Reflect a completed on-chain handover (or a demo one) in the stored record. */
  setOwner: (address: string, owner: string) => void;
}

// A store rather than a plain array so /pools re-renders the moment the
// builder adds a pool, without a reload or a refetch.
export const useLocalPools = create<LocalPoolsState>((set) => ({
  pools: readStored(),
  add: (pool) =>
    set((s) => {
      const pools = [pool, ...s.pools.filter((p) => p.address !== pool.address)];
      persist(pools);
      return { pools };
    }),
  remove: (address) =>
    set((s) => {
      const pools = s.pools.filter((p) => p.address !== address);
      persist(pools);
      return { pools };
    }),
  setOwner: (address, owner) =>
    set((s) => {
      const pools = s.pools.map((p) => (p.address === address ? { ...p, owner } : p));
      persist(pools);
      return { pools };
    }),
}));

function persist(pools: LocalPool[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pools));
  } catch {
    // Private mode or blocked storage: the pool still exists for this tab.
  }
}

/** Non-React read, for the registry. */
export function listLocalPools(backend?: CreateBackend): LocalPool[] {
  const all = useLocalPools.getState().pools;
  return backend ? all.filter((p) => p.backend === backend) : all;
}

export function localPoolFromArgs(
  address: string,
  args: PoolConstructorArgs,
  label: string,
  backend: CreateBackend,
  hash: string,
  meta: { feeBps: number; protocolSharePct: number },
): LocalPool {
  return {
    address,
    tokens: args.tokens,
    label,
    amp: args.amp_factor,
    feeBps: meta.feeBps,
    protocolSharePct: meta.protocolSharePct,
    owner: args.owner,
    backend,
    hash,
    createdAt: Date.now(),
  };
}
