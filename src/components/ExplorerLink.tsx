import { explorerTxUrl } from '../lib/stellar/config'

export default function ExplorerLink({ hash }: { hash: string }) {
  if (!hash) return null
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs underline underline-offset-2 transition-opacity hover:opacity-70"
      style={{ color: 'inherit' }}
    >
      View on Stellar Expert ↗
    </a>
  )
}
