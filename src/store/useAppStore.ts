import { create } from 'zustand'

export interface Pool {
  id: string
  token: string
  symbol: string
  apy: number
  tvl: number
  volume24h: number
  myDeposit: number
  fees: number
  reserves: number
  utilization: number
  depositors: number
}

interface AppState {
  pools: Pool[]
  viewMode: 'card' | 'table'
  setViewMode: (mode: 'card' | 'table') => void
  selectedPool: Pool | null
  setSelectedPool: (pool: Pool | null) => void
  walletConnected: boolean
  walletAddress: string | null
  connectWallet: () => void
  disconnectWallet: () => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const MOCK_POOLS: Pool[] = [
  {
    id: 'usdc',
    token: 'USD Coin',
    symbol: 'USDC',
    apy: 8.42,
    tvl: 12_500_000,
    volume24h: 2_100_000,
    myDeposit: 1_000,
    fees: 0.01,
    reserves: 12_500_000,
    utilization: 72,
    depositors: 1847,
  },
  {
    id: 'usdt',
    token: 'Tether USD',
    symbol: 'USDT',
    apy: 7.83,
    tvl: 9_800_000,
    volume24h: 1_800_000,
    myDeposit: 500,
    fees: 0.01,
    reserves: 9_800_000,
    utilization: 68,
    depositors: 1243,
  },
  {
    id: 'dai',
    token: 'Dai',
    symbol: 'DAI',
    apy: 6.21,
    tvl: 4_200_000,
    volume24h: 890_000,
    myDeposit: 0,
    fees: 0.01,
    reserves: 4_200_000,
    utilization: 54,
    depositors: 687,
  },
  {
    id: 'eurc',
    token: 'Euro Coin',
    symbol: 'EURC',
    apy: 5.94,
    tvl: 3_100_000,
    volume24h: 620_000,
    myDeposit: 0,
    fees: 0.01,
    reserves: 3_100_000,
    utilization: 45,
    depositors: 421,
  },
  {
    id: 'pyusd',
    token: 'PayPal USD',
    symbol: 'PYUSD',
    apy: 5.17,
    tvl: 1_900_000,
    volume24h: 380_000,
    myDeposit: 0,
    fees: 0.01,
    reserves: 1_900_000,
    utilization: 39,
    depositors: 289,
  },
]

const storedTheme =
  typeof localStorage !== 'undefined'
    ? (localStorage.getItem('spreadless-theme') as 'light' | 'dark' | null)
    : null

export const useAppStore = create<AppState>((set) => ({
  pools: MOCK_POOLS,
  viewMode: 'card',
  setViewMode: (mode) => set({ viewMode: mode }),
  selectedPool: null,
  setSelectedPool: (pool) => set({ selectedPool: pool }),
  walletConnected: false,
  walletAddress: null,
  connectWallet: () =>
    set({
      walletConnected: true,
      walletAddress: 'GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGZKEGFK5F7',
    }),
  disconnectWallet: () => set({ walletConnected: false, walletAddress: null }),
  theme: storedTheme ?? 'light',
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('spreadless-theme', next)
      return { theme: next }
    }),
}))
