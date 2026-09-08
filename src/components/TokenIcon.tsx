import { tokenAvatarLabel } from '../lib/utils'

// Real icons, one per symbol. Two rules, both learned the hard way:
//
//   1. A logo is only listed here when it is traceable to the issuer itself,
//      normally the `image` of the [[CURRENCIES]] entry in that issuer's
//      stellar.toml (fetched via stellar.expert). An earlier pass used
//      Synthetix's Ethereum sUSD logo for SUSD, which is a different asset.
//   2. A symbol we cannot place stays out of this map and falls back to the
//      letter avatar below. A wrong logo is worse than no logo.
//
// The pool's four assets:
//   - SUSD: the Stellar-native asset issued by synt.tech (GCHW7CW...JYIH),
//     NOT Synthetix's Ethereum sUSD.
//   - USDx: FxDAO's Decentralized USD Coin (assets.fxdao.io).
//   - PYUSD: PayPal USD.
//   - sUSDC: open-license crypto-icon set (spothq/cryptocurrency-icons, CC0).
//
// The 2026-09-05 catalog. These are open-mint *test* tokens named after real
// assets, so the logo is the real asset's, sourced per token:
//   CC0 set     BTC, ETH, XRP, XLM, USDC (spothq/cryptocurrency-icons)
//   issuer toml BnUSD (SODAX), oUSD (Orbit CDP), EURx (FxDAO), USDM
//               (Montelibero), SolvBTC + xSolvBTC (Solv Protocol),
//               ZUSD (GMO Trust), USDGLO (Glo Foundation)
//   asset list  EURC (Circle), USDT0, yBTC/yETH/yUSDC/yXLM (Ultra Capital),
//               from the Soroswap and stellar.expert curated SEP-42 lists
//   XRPL meta   RLUSD, from the official Ripple issuer rMxCKb...J8m5De.
//               Ripple issues no RLUSD on Stellar; every Stellar RLUSD is a
//               lookalike, so the XRPL original is the honest source.
//
// abUSDC and apUSDC are Allbridge's bridged and pooled USDC. Allbridge's own
// toml gives both the plain USDC mark, so both point at usdc.svg rather than
// shipping two copies of it.
//
// Deliberately absent, and rendering as letter avatars until someone confirms
// which asset is meant:
//   POM     PomDEX's POM is the only Stellar POM with a logo, but the catalog
//           files POM as a USD stable, which PomDEX's token is not.
//   USDP    Paxos USD, or LUX Payband's Stellar USDP. Both are real USDPs.
//   USDM1   issuer GDM5QWWX... publishes no home domain and no toml.
//   yXRP    issuer GCVYYPPM... likewise; Ultra Capital, whose other y-assets
//           are listed above, publishes no yXRP icon.
const ICON_SRC: Record<string, string> = {
  // The live pool
  USDx: '/tokens/usdx.png',
  PYUSD: '/tokens/pyusd.png',
  SUSD: '/tokens/susd.png',
  sUSDC: '/tokens/usdc.svg',
  // Catalog — USD
  USDC: '/tokens/usdc.svg',
  abUSDC: '/tokens/usdc.svg',
  apUSDC: '/tokens/usdc.svg',
  BnUSD: '/tokens/bnusd.png',
  oUSD: '/tokens/ousd.png',
  RLUSD: '/tokens/rlusd.png',
  USDGLO: '/tokens/usdglo.png',
  USDM: '/tokens/usdm.png',
  USDT0: '/tokens/usdt0.png',
  yUSDC: '/tokens/yusdc.png',
  ZUSD: '/tokens/zusd.png',
  // Catalog — EUR
  EURC: '/tokens/eurc.png',
  EURx: '/tokens/eurx.png',
  // Catalog — BTC
  BTC: '/tokens/btc.svg',
  SolvBTC: '/tokens/solvbtc.png',
  xSolvBTC: '/tokens/xsolvbtc.png',
  yBTC: '/tokens/ybtc.png',
  // Catalog — ETH
  ETH: '/tokens/eth.svg',
  yETH: '/tokens/yeth.png',
  // Catalog — XLM. XLM is also shown in the profile panel.
  XLM: '/tokens/xlm.svg',
  yXLM: '/tokens/yxlm.png',
  // Catalog — XRP
  XRP: '/tokens/xrp.svg',
}

interface TokenIconProps {
  symbol: string
  size?: number
  className?: string
}

export default function TokenIcon({ symbol, size = 36, className = '' }: TokenIconProps) {
  const src = ICON_SRC[symbol]

  // Falls back gracefully for a symbol we don't have art for (e.g. the pool
  // gets redeployed with a new asset) — same degrade-not-break spirit as
  // pool.ts's metaFor() falling back to a shortened address.
  if (!src) {
    return (
      <div
        className={`rounded-full flex items-center justify-center font-bold shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.32,
          backgroundColor: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
          color: 'var(--c-text-muted)',
        }}
      >
        {tokenAvatarLabel(symbol).slice(0, 2)}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      className={`rounded-full shrink-0 ${className}`}
      style={{ width: size, height: size, border: '1px solid var(--c-border)', backgroundColor: 'var(--c-surface-2)' }}
    />
  )
}
