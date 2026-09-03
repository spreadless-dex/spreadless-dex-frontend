// Pool ownership handover. The contract implements OpenZeppelin's two-step
// Ownable: the owner *offers* the pool to an address with an expiry ledger,
// and nothing changes until that address *accepts*. Until then the owner can
// withdraw the offer, and after the expiry it lapses on its own. A typo in
// the recipient therefore costs nothing: an address nobody controls can never
// accept, and the pool stays where it is.
//
// The contract exposes no getter for the pending recipient, so the UI keeps
// the offer it sent in localStorage (see pendingOwnership.ts) and the
// recipient learns about it through the invite link the owner shares.

import { create } from "zustand";
import { PROTOCOL_OWNER, RPC_URL } from "./config";
import type { ARight } from "./poolParams";
import { writeClient } from "./pool";
import type { OnPhase, TxResult } from "./types";

/** Stellar closes a ledger roughly every five seconds. */
const LEDGER_SECONDS = 5;

/** How long an offer stays open before it lapses. One value, no setting. */
export const OFFER_VALID_DAYS = 7;
export const OFFER_VALID_MS = OFFER_VALID_DAYS * 24 * 60 * 60 * 1000;

function ledgersFor(days: number): number {
  return Math.ceil((days * 24 * 60 * 60) / LEDGER_SECONDS);
}

// Both Stellar address kinds can own a pool: an account (G...) or a contract
// (C..., e.g. a multisig). Format check only; the wallet and the network do
// the checksum. StrKey lives in stellar-base, which is heavy and SSR-hostile,
// so the strict check is loaded on demand by validateAddress().
export function looksLikeAddress(value: string): boolean {
  return /^[GC][A-Z2-7]{55}$/.test(value.trim());
}

export async function validateAddress(value: string): Promise<boolean> {
  const v = value.trim();
  if (!looksLikeAddress(v)) return false;
  const { StrKey } = await import("@stellar/stellar-base");
  return v.startsWith("G") ? StrKey.isValidEd25519PublicKey(v) : StrKey.isValidContract(v);
}

async function latestLedger(): Promise<number> {
  const sdk = await import("@spreadless-dex/sdk");
  const server = new sdk.rpc.Server(RPC_URL);
  const { sequence } = await server.getLatestLedger();
  return sequence;
}

interface OfferArgs {
  /** The current owner: signer of the call. Must be the connected wallet. */
  from: string;
  poolId: string;
  newOwner: string;
  onPhase?: OnPhase;
}

export interface OfferResult extends TxResult<null> {
  liveUntilLedger: number;
}

/** Step one: offer the pool to `newOwner`. Ownership does not move yet. */
export async function offerOwnership({ from, poolId, newOwner, onPhase }: OfferArgs): Promise<OfferResult> {
  onPhase?.("preparing");
  const [pool, ledger] = await Promise.all([writeClient(from, onPhase, poolId), latestLedger()]);
  const liveUntilLedger = ledger + ledgersFor(OFFER_VALID_DAYS);
  const tx = await pool.transfer_ownership({ new_owner: newOwner, live_until_ledger: liveUntilLedger });
  const sent = await tx.signAndSend();
  return { result: null, hash: sent.sendTransactionResponse?.hash ?? "", liveUntilLedger };
}

interface WithdrawOfferArgs {
  from: string;
  poolId: string;
  /** The address the open offer names; the contract checks it matches. */
  pendingOwner: string;
  onPhase?: OnPhase;
}

/** Take an open offer back. A live_until_ledger of 0 is the contract's cancel. */
export async function withdrawOffer({ from, poolId, pendingOwner, onPhase }: WithdrawOfferArgs): Promise<TxResult<null>> {
  onPhase?.("preparing");
  const pool = await writeClient(from, onPhase, poolId);
  const tx = await pool.transfer_ownership({ new_owner: pendingOwner, live_until_ledger: 0 });
  const sent = await tx.signAndSend();
  return { result: null, hash: sent.sendTransactionResponse?.hash ?? "" };
}

interface AcceptArgs {
  /** The offered address: signer of the call. Must be the connected wallet. */
  to: string;
  poolId: string;
  onPhase?: OnPhase;
}

/** Step two: the offered wallet claims the pool. This is the moment ownership moves. */
export async function acceptOwnership({ to, poolId, onPhase }: AcceptArgs): Promise<TxResult<null>> {
  onPhase?.("preparing");
  const pool = await writeClient(to, onPhase, poolId);
  const tx = await pool.accept_ownership();
  const sent = await tx.signAndSend();
  return { result: null, hash: sent.sendTransactionResponse?.hash ?? "" };
}

interface RenounceArgs {
  /** The current owner: signer of the call. Must be the connected wallet. */
  from: string;
  poolId: string;
  onPhase?: OnPhase;
}

/**
 * Give the pool up for good. After this get_owner() is None: nobody can ramp
 * A, change the fee or pause, and there is no way back. Refused by the
 * contract while a transfer offer is open (#2101).
 */
export async function renounceOwnership({ from, poolId, onPhase }: RenounceArgs): Promise<TxResult<null>> {
  onPhase?.("preparing");
  const pool = await writeClient(from, onPhase, poolId);
  const tx = await pool.renounce_ownership();
  const sent = await tx.signAndSend();
  return { result: null, hash: sent.sendTransactionResponse?.hash ?? "" };
}

// ─── The right to change A, read off the owner ────────────
// Three states. "undecided" is a pool whose creator still holds it: pools
// from before this rule, or a fixed deploy whose second signature was
// declined. The pool page offers that owner the same choice the builder does.

export type ARightState = ARight | "undecided";

// Demo mode has no protocol address; this stands in so a flexible demo pool
// reads as flexible on its page instead of as undecided.
export const DEMO_PROTOCOL_OWNER = "GSPREADLESSDEMOOWNER00000000000000000000000000000000000000".slice(0, 56);

/** The address a flexible pool is deployed to, or handed to. Null until configured (demo excepted). */
export function protocolOwnerFor(demo: boolean): string | null {
  return PROTOCOL_OWNER ?? (demo ? DEMO_PROTOCOL_OWNER : null);
}

export function aRightOf(owner: string | undefined | null): ARightState {
  if (!owner) return "fixed";
  if ((PROTOCOL_OWNER && owner === PROTOCOL_OWNER) || owner === DEMO_PROTOCOL_OWNER) return "flexible";
  return "undecided";
}

export const A_RIGHT_LABEL: Record<ARightState, string> = {
  flexible: "Flexible",
  fixed: "Fixed",
  undecided: "Undecided",
};

export const A_RIGHT_TIP: Record<ARightState, string> = {
  flexible: "Spreadless owns the pool and can ramp A, always as a slow glide over a set time. The same role can pause the pool and adjust the fee.",
  fixed: "The pool has no owner. A, the fee and pause are frozen for good, for everyone.",
  undecided: "The creator still owns the pool. They can hand it to Spreadless (flexible A) or give ownership up (fixed A).",
};

// ─── Open offers this browser sent ─────────────────────────
// One record per pool. Cleared when the offer is withdrawn, accepted from
// this browser, or found lapsed on read. Accepting from another browser is
// invisible here; the owner row then simply shows the new owner from chain
// and the stale record is dropped the moment the owner no longer matches.

export interface PendingOffer {
  pool: string;
  from: string;
  to: string;
  liveUntilLedger: number;
  hash: string;
  createdAt: number;
}

const STORAGE_KEY = "spreadless-pending-ownership";

function readStored(): PendingOffer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as PendingOffer[]) : [];
    return all.filter((o) => Date.now() - o.createdAt < OFFER_VALID_MS);
  } catch {
    return [];
  }
}

function persist(offers: PendingOffer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
  } catch {
    // Private mode or blocked storage: the offer still shows for this tab.
  }
}

interface PendingOffersState {
  offers: PendingOffer[];
  set: (offer: PendingOffer) => void;
  clear: (pool: string) => void;
}

export const usePendingOffers = create<PendingOffersState>((set) => ({
  offers: readStored(),
  set: (offer) =>
    set((s) => {
      const offers = [offer, ...s.offers.filter((o) => o.pool !== offer.pool)];
      persist(offers);
      return { offers };
    }),
  clear: (pool) =>
    set((s) => {
      const offers = s.offers.filter((o) => o.pool !== pool);
      persist(offers);
      return { offers };
    }),
}));

/** The link a recipient opens to find the Accept step waiting for them. */
export function inviteLink(poolId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/pools/v/${poolId}?accept=1`;
}
