// Client-side transaction history — no backend/indexer, so every completed
// or failed action gets logged straight to the browser's IndexedDB, keyed by
// the connected wallet. IndexedDB (not localStorage) because the amount of
// detail per record (rate, slippage, hash, etc.) and the need to query by
// wallet warrant a real object store with an index, not a JSON blob.

export type ActivityType = "swap" | "deposit" | "withdraw";
export type ActivityStatus = "completed" | "failed" | "pending";

export interface ActivityRecord {
  id: string;
  walletAddress: string;
  timestamp: number;
  type: ActivityType;
  title: string;
  subtitle: string;
  assetPool: string;
  amount: string;
  status: ActivityStatus;
  sent?: string;
  received?: string;
  effectiveRate?: number;
  slippage?: string;
  fee?: string;
  txHash?: string;
  explorerUrl?: string;
  /** Truncated raw error text, only set on failed entries with no clean message. */
  detail?: string;
  /** For routed swaps: the token path, e.g. "USDx → sUSDC → PYUSD". */
  route?: string;
  /** For routed swaps: number of legs executed in the one transaction. */
  hops?: number;
}

const DB_NAME = "spreadless-activity";
const DB_VERSION = 1;
const STORE = "activities";

// Lazy singleton, same "cache the promise" pattern as the wallet kit boot —
// indexedDB.open() is only ever touched inside this function body, so
// importing this module during Astro's SSR is safe (no top-level DOM access).
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("byWallet", "walletAddress", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function addActivity(record: ActivityRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** All records for a wallet, newest first. */
export async function getActivities(walletAddress: string): Promise<ActivityRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("byWallet").getAll(walletAddress);
    req.onsuccess = () => {
      const records = (req.result as ActivityRecord[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getActivity(id: string): Promise<ActivityRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as ActivityRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}
