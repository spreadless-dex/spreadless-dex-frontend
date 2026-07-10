export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(2)}`
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Label for the round token avatars. Only strips the lowercase "s"
// Spreadless prefix (sDAI → DAI) — a leading capital is part of the name
// (SUSD stays SUSD). Slicing to two chars made sUSDT/SUSD/sUSDC all "US".
export function tokenAvatarLabel(symbol: string): string {
  return symbol.replace(/^s(?=[A-Z0-9])/, '')
}
