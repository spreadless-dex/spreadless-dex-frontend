# Pool Creation: UX-Flow und Implementierungsplan

Stand: 30.08.2026. Feature: "User can create new pools and configure assets and fees" (Tranche 2, D1).

## 1. Ausgangslage

| Fakt | Konsequenz |
| --- | --- |
| `FACTORY_CONTRACT_ID` ist `null`, kein Factory-Client im SDK | Die UI wird gegen eine `createPool()`-Schnittstelle gebaut, die drei Backends kennt (Demo, Direct Deploy, Factory). |
| SDK hat `Client.deploy({ owner, tokens, amp_factor, swap_fee, protocol_fee, beneficiary, max_caps, lp_max_supply }, { wasmHash })` | Das Parameter-Set ist final. Fehlt nur der auf Testnet installierte WASM-Hash des Pool-Contracts. |
| `swap_fee` ist in 1e9-Skala (1e9 = 100 %), "within the configured fee range" | UI rechnet in Prozent, konvertiert einmal an der Grenze. Gültiger Bereich muss vom Contract-Team kommen. |
| Registry (`registry.ts`) cached 60 s, `invalidateVaults()` existiert | Nach dem Deploy: invalidieren, neuer Pool erscheint sofort in /pools. |
| Pool-Detailseiten sind statisch per Token-Symbol | Neue Pools brauchen eine adressbasierte Seite `/pools/v/[address]` (client-side gerendert). |
| Keine Tooltip-Komponente | Kleine `Tooltip`-Komponente wird Teil dieses Features. |
| Doc nennt Vault A (USDx/sUSDC) und Vault B (sUSDC/PYUSD) als Demo-Pools | Die zwei sind die "Presets", mit denen das Feature vorgeführt wird. |

## 2. Produktentscheidungen

1. **Eigene Seite, kein Modal.** `/pools/new`. Fünf Entscheidungen mit Live-Vorschau passen nicht in ein Modal; eine URL ist teilbar und im Demo-Video ansteuerbar.
2. **Eine Seite, kein versteckter Wizard.** Alle Schritte stehen untereinander, werden aber nacheinander "aufgeschlossen" (Schritt n+1 ist ausgegraut bis Schritt n valide ist). Man sieht immer, wie viel noch kommt.
3. **Die Vorschau ist das Spielzeug.** Rechts klebt eine Karte, die genau so aussieht wie die spätere Zeile in /pools plus ein Mini-Kurvenplot. Jede Eingabe verändert sie sofort. Das ist der "spaßige" Teil, nicht Konfetti.
4. **Presets zuerst, Zahlen danach.** Amp und Fee werden über drei benannte Presets gewählt; "Custom" öffnet den Slider. Niemand muss wissen, was A = 100 bedeutet, um einen guten Pool zu bauen.
5. **Alle Tooltips mit einem Satz.** Kein Fließtext im Formular. Erklärung on hover / on tap, Link in die Docs wo es tiefer geht.
6. **Kein Pool ohne Liquidität.** Nach dem Deploy ist der nächste Schritt "Seed liquidity" mit dem bestehenden Deposit-Modal, vorausgewählt auf den neuen Pool. Ein leerer Pool ist in /pools als "Empty" markiert.
7. **Testnet: permissionless.** Jede verbundene Wallet darf erstellen. Owner = Wallet. Falls die Factory später gated ist, wird der Button für Nicht-Berechtigte zu "Request access" (nur Copy-Änderung).

## 3. Der Flow

### Einstieg: /pools

- Header-Zeile bekommt rechts einen schwarzen CTA **"Create pool"** (+ Icon). Ohne Wallet: Klick öffnet Wallet-Connect, danach weiter.
- Tabelle wird mehrzeilig (Registry statt `poolState`), Spalten: Pool, Assets, Fee, TVL, APY. Neue Pools ohne Reserven zeigen "Empty · Seed" statt TVL.
- Leerer Zustand (nur der eine Pool): kleine Zeile unter der Tabelle "Missing a pair? Create your own pool."

### /pools/new: Layout

```
┌───────────────────────────────────────────────────┬──────────────────────┐
│ ← Pools                                           │  PREVIEW (sticky)    │
│ Create a pool                                     │  ┌────────────────┐  │
│ Pick assets, set the curve, choose a fee. Deploy. │  │ ◎◎ USDx/sUSDC  │  │
│                                                   │  │ A 200 · 0.04%  │  │
│ 1  Assets        [USDx] [PYUSD] [SUSD] [sUSDC] +  │  │ Empty          │  │
│ 2  Curve         (Tight) Standard  Loose  Custom  │  ├────────────────┤  │
│ 3  Fee           0.01%  (0.04%)  0.10%  Custom    │  │  mini curve    │  │
│ 4  Advanced ▸    caps · LP cap · beneficiary      │  │  $10k swap:    │  │
│ 5  Review        summary → [Deploy pool]          │  │  0.002% impact │  │
│                                                   │  └────────────────┘  │
└───────────────────────────────────────────────────┴──────────────────────┘
```

Mobile: Preview wird zur kompakten Sticky-Leiste oben (Icons, Name, A, Fee), Kurve nur im Review.

### Schritt 1: Assets

- Chip-Grid der bekannten Tokens (TokenIcon + Symbol + Wallet-Balance). Tippen = an/aus. 2 bis 4 Tokens (Contract-Limit "supported token count", Annahme 4 wie Vault C).
- Reihenfolge: canonical = sortiert nach Contract-Adresse (Factory validiert das). UI sortiert automatisch, zeigt aber die gewählte Reihenfolge nicht als Entscheidung an.
- **"+ Add by address"**: Textfeld für eine Contract-Adresse. Liest `symbol`/`decimals` on-chain, zeigt Chip mit "Unverified" Badge. Tooltip: "Not on our list. Check the address on Stellar Expert before you pool it."
- Live-Check gegen die Registry (DEX-58, 02.09.2026): Zwilling ist nur "gleiche Tokens + gleiches A + gleiche Fee". Der exakte Zwilling sperrt Deploy mit Hinweis und Link zum bestehenden Pool; gleiche Tokens mit anderer Konfiguration sind ein eigener Pool und bekommen nur eine Notiz ("deploys as a separate pool"). Die Prüfung sitzt auf einem eigenen Feld `config`, damit Curve- und Fee-Schritt offen bleiben, denn dort löst man den Konflikt. Pools ohne bekanntes A/Fee (der Config-Vault) können nie als Zwilling gelten.
- Peg-Hinweis: Alle Listen-Tokens tragen ein `peg: 'USD' | 'EUR'`-Feld (Doc: "EURC nur EUR, Dollar zu Dollar"). Gemischte Pegs → Warnung "Mixed pegs. StableSwap expects assets that trade near 1:1."
- Pool-Name wird generiert: "USDx / sUSDC". Nicht editierbar (Name ist on-chain nicht vorhanden, nur Anzeige).

### Schritt 2: Curve (Amplification)

Drei Presets als Segmented Control, jeweils Label + Untertitel:

| Preset | A | Untertitel |
| --- | --- | --- |
| Tight | 200 | Same-peg stables. Lowest slippage. |
| Standard | 100 | Default for most stable pairs. |
| Loose | 20 | Pegs may drift. Safer if one asset wobbles. |
| Custom | 1 bis 1000 | Slider, logarithmisch |

Tooltip am Titel: "Higher A keeps the price closer to 1:1 but reacts harder if a peg breaks."
Die Preview-Kurve (aus `CurveVisualizer` extrahiert, 2-Coin-Fall) zeigt die Kurve und die Zahl "Price impact on a $10k swap" (berechnet mit `getY`, Annahme Reserven 1M je Seite). Beim Preset-Wechsel morpht die Kurve (CSS transition auf `d`, reduced-motion respektiert).

### Schritt 3: Fee

- Presets 0.01 % / 0.04 % / 0.10 % / Custom (0.001 % bis 1 %, Eingabefeld mit % Suffix). Standard: 0.04 %.
- Zweite Zeile, kleiner: **Protocol share** (Anteil der Swap-Fee, der an den Beneficiary geht). Preset 0 % / 10 % / 20 %, Standard aus Vault C übernehmen sobald bekannt, sonst 0 %. Tooltip: "The rest stays in the pool for liquidity providers."
- Beneficiary = Wallet-Adresse, änderbar unter Advanced.
- Live-Zahl in der Preview: "LPs earn ≈ $X per $1M daily volume." Macht die Fee greifbar, ohne APY zu versprechen.

### Schritt 4: Advanced (eingeklappt)

- Per-token cap: Standard "No cap" (Contract-Maximum). Eingabe in Token-Einheiten, wird per `toRawUnits` konvertiert.
- LP supply cap: Standard "No cap".
- Beneficiary: Adresse, vorbelegt mit Wallet.
- Owner: fix = Wallet, nur angezeigt, Tooltip "The owner can pause the pool, change fees and ramp A."

### Schritt 5: Review und Deploy

- Summary-Liste: Assets, A, Swap fee, Protocol share, Caps, Owner, Beneficiary, Network fee (aus Simulation, XLM).
- Button: **"Deploy pool"** (schwarz, `btn-lift`). Darunter ein Satz: "One transaction. You can seed liquidity right after."
- `TxStatus` mit den Phasen preparing → signing → submitting. Fehler über `errors.ts` gemappt (Duplicate, InvalidFee, InvalidAmp, InvalidCap).
- Erfolg (in place, kein Redirect): Karte kippt in den Erfolgszustand (`animate-bounce-in`), zeigt Adresse + Explorer-Link, zwei CTAs: **"Seed liquidity"** (primär, öffnet `PoolDetailModal` im Deposit-Modus für den neuen Pool) und "View pool".
- Erfolgstext: "USDx / sUSDC is live." Nächste Zeile: "It has no liquidity yet. Seed it so it can quote."

## 4. Architektur

### Neue Dateien

| Datei | Zweck |
| --- | --- |
| `src/lib/stellar/factory.ts` | `createPool(params, onPhase)`, `quoteCreatePool(params)`, `findDuplicate(tokens)`. Backend-Wahl: `FACTORY_CONTRACT_ID` → Factory-Call (Stub, wie `readFactoryVaults`); sonst `POOL_WASM_HASH` gesetzt → `Client.deploy`; sonst Demo. |
| `src/lib/stellar/poolParams.ts` | Reine Konvertierung: Prozent ↔ 1e9-Skala, Presets, Validierung (Anzahl, Duplikate, Fee-Range, Amp-Range), canonical sort. Unit-testbar ohne SDK. |
| `src/lib/stellar/localPools.ts` | localStorage-Liste selbst erstellter Pool-Adressen. Bis die Factory-Registry live ist, hängt `listVaults()` diese an, damit ein direkt deployter Pool in /pools sichtbar bleibt. |
| `src/pages/pools/new.astro` | Seite. |
| `src/pages/pools/v/[address].astro` | Adressbasierte Detailseite (SSR via Cloudflare-Adapter, Rendering client-side). Lädt Pool-State über `readClient(address)`. |
| `src/components/create/CreatePoolPage.tsx` | Container, `useReducer` für den Draft, Gate-Logik der Schritte. |
| `src/components/create/AssetPicker.tsx` | Chips, Add-by-address, Duplicate- und Peg-Check. |
| `src/components/create/CurvePicker.tsx` | Presets + Slider. |
| `src/components/create/FeePicker.tsx` | Presets + Custom + Protocol share. |
| `src/components/create/AdvancedSection.tsx` | Caps, LP cap, Beneficiary, Owner. |
| `src/components/create/ReviewDeploy.tsx` | Summary, Deploy, TxStatus, Erfolg. |
| `src/components/create/PoolPreviewCard.tsx` | Sticky-Vorschau mit Mini-Kurve. |
| `src/components/Tooltip.tsx` | Info-Icon + Popover, Hover und Tap, Escape schließt, `aria-describedby`. |

### Anpassungen an Bestehendem

- `config.ts`: `POOL_WASM_HASH: string | null`, `peg` in `TokenInfo`, `TOKENS` bekommt `peg: 'USD'`.
- `registry.ts`: `listVaults()` hängt `localPools` an; `VaultInfo` bekommt `amp?`, `feeBps` wird für neue Pools aus den Deploy-Parametern gefüllt (der Contract hat keinen Getter).
- `pool.ts`: `readPoolState(poolId?)` parametrisieren (heute fix auf `POOL_CONTRACT_ID`); `depositSingleSided` und Quote bekommen `poolId`.
- `PoolsRegister.tsx`: rendert die Registry statt `poolState`, mehrzeilig, Fee-Spalte, "Empty"-Zustand.
- `PoolsListPage.tsx`: "Create pool"-CTA.
- `demo.ts`: `DEMO_VAULTS` wird mutierbar (Demo-Backend pusht neue Vaults rein), sonst unverändert.
- `errors.ts`: Mapping für Deploy-Fehler.
- Docs: neuer Guide `guides/create-pool.mdx`, Contract-Referenz um Konstruktor erweitern.

### Reihenfolge

1. ✅ (30.08.2026) `poolParams.ts` + `Tooltip` + `PoolPreviewCard`.
2. ✅ (30.08.2026) `CreatePoolPage` mit allen Schritten, Backend = Demo. Flow komplett klickbar.
3. `factory.ts` Direct-Deploy-Pfad ist implementiert, wartet nur auf `POOL_WASM_HASH` in config.ts. Dann Testnet-Deploy von Vault A und B über die UI.
4. ✅ (30.08.2026) Registry-Anbindung: `localPools`, mehrzeiliges /pools, `/pools/v/[address]` (SSR, prerender=false), Deposit/Withdraw auf beliebigen Pool (poolId durch pool.ts und PoolDetailModal gezogen), Seed-CTA öffnet das Deposit-Modal des neuen Pools via ?seed=1.
5. Factory-Pfad, wenn D1 deployed ist. Betrifft nur `factory.ts` und `readFactoryVaults`.

## 5. Offene Punkte für das Contract-Team

1. WASM-Hash des Pool-Contracts auf Testnet (für Direct Deploy vor der Factory).
2. Gültiger Bereich für `swap_fee` und `protocol_fee`, gültiger Bereich für `amp_factor`, maximale Token-Anzahl.
3. Werte von Vault C für `protocol_fee` und `beneficiary`, damit die Defaults dazu passen.
4. Factory: Methodenname und Signatur für Create und Registry-Read, und ob Create permissionless ist.

Annahmen bis dahin: Fee 0.001 % bis 1 %, 2 bis 4 Tokens, permissionless. A 1 bis 50 000 ist bestätigt (DEX-61).
