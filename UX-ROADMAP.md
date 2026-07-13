# UX-Roadmap — Fintech-grade UI/UX (Trade-Republic-inspiriert)

Ergebnis des UI/UX-Audits vom 08.07.2026. Jeder Punkt hat eine Checkbox und einen Status.

**Status-Legende:** `offen` · `in Arbeit` · `erledigt` · `verworfen`

---

## P1 — Kritisch: Vertrauen & Verständlichkeit

### 1. Transaktions-Lifecycle
- [x] **Status:** erledigt (10.07.2026)
- Betrifft: `SwapWidget.tsx`, `PoolDetailModal.tsx`, `Faucet.tsx`, `RainButton.tsx`
- Aktuell: Button → Regen-Animation "loading" → kleine grüne Textzeile. Der Nutzer weiß nie, wo er gerade ist.
- Soll:
  - [x] Stepper/Status-Phasen: „Confirm in wallet" → „Submitting" → „Confirmed" — neue Shared-Komponente `TxStatus.tsx`; die Phasen kommen aus einem `onPhase`-Callback in `pool.ts`/`faucet.ts` (der Wallet-Signer ist gewrappt: `signTransaction`-Aufruf = Wallet offen, Resolve = Submit läuft)
  - [x] Hinweis, dass sich die Wallet zum Signieren öffnet — Hinweiszeile unter dem Stepper je Phase („Your wallet is open — review and approve the transaction.")
  - [x] Nach Erfolg: Tx-Hash anzeigen + Link zu stellar.expert — war schon da (ExplorerLink), jetzt in `TxStatus` konsolidiert inkl. komplett abgehaktem Stepper
  - [x] Gilt für Swap, Deposit, Withdraw und Faucet gleichermaßen — alle vier Flows nutzen `TxStatus` + `onPhase`

### 2. Fehler-Mapping (rohe `err.message` ersetzen)
- [x] **Status:** erledigt (10.07.2026)
- Betrifft: `SwapWidget.tsx:224`, `PoolDetailModal.tsx`, `Faucet.tsx`
- Aktuell: Soroban-Fehler wie `HostError: Error(Contract, #10)` landen ungefiltert im UI.
- Soll: Mapping auf menschliche Sätze — „Slippage überschritten — Kurs hat sich bewegt", „Nicht genug Guthaben", „In der Wallet abgelehnt".
- Umsetzungsnotiz: `mapTxError()` in `errors.ts` mappt Wallet-Ablehnung, Trustline, `#100 InsufficientBalance`, `#14 SlippageExceeded`, `#15 CapExceeded`, `#1000 EnforcedPause`, `#10/#11 InvalidAmount/ZeroDeposit`, XLM-Underfunded, Timeout und Netzwerkfehler (Codes aus dem SDK-Error-Enum). Unbekannte Fehler: generischer Satz + gekürzte Roh-Meldung als faint Detail-Zeile.

### 3. Fake-Zahlen auf der Landingpage entfernen/echt machen
- [ ] **Status:** offen
- Betrifft: `src/pages/index.astro:67-69`
- Aktuell: `$31.5M TVL / $5.8M Volume / 8.42% APY` hardcodiert, während die Earn-Seite echte Testnet-Daten zeigt. Vertrauenskiller.
- Soll: Live aus `readPoolState()` speisen oder rausnehmen.

### 4. APY & Fees sichtbar machen
- [ ] **Status:** teilweise erledigt (09.07.2026)
- Betrifft: `PoolsPage.tsx`, `PoolCard.tsx`, `PoolDetailModal.tsx`, `SwapWidget.tsx`
- Aktuell: „Deposit and earn" ohne eine einzige Zahl. Swap-Fee nirgends sichtbar.
- Soll: Pool-Fee anzeigen; APY als Zahl (oder „—" mit Tooltip, solange keine Volumen-Historie existiert).
- Fortschritt: APY wird jetzt als klar gekennzeichnete Preview-Zahl (`mockPoolStats.ts`) auf Card + Modal + My Liquidity angezeigt (siehe #24). **Noch offen:** Swap-/Pool-Fee ausweisen (Contract exponiert bisher keinen Fee-Getter) und Preview-APY durch echte Daten ersetzen, sobald der Oracle-Service des Contract-Devs liefert.

### 5. Quote ohne verbundene Wallet
- [ ] **Status:** offen
- Betrifft: `SwapWidget.tsx:117-151`, `lib/stellar/pool.ts`
- Aktuell: Quote simuliert gegen die verbundene Adresse — ohne Wallet passiert beim Tippen nichts, ohne Erklärung. Erste Erfahrung jedes neuen Besuchers.
- Soll: Gegen feste Read-Only-Adresse simulieren oder StableSwap-Kurve lokal aus Reserven rechnen; Kurs schon vor dem Connect zeigen.

---

## P2 — Wichtig: Unfertige Flows

### 6. Positions-Ansicht („Your position") auf Earn
- [x] **Status:** erledigt (10.07.2026)
- Betrifft: `PoolsPage.tsx` (neu: Positions-Karte)
- Aktuell: Nach Deposit gibt es keinen Ort für: meine LP-Shares, deren Wert, mein Pool-Anteil. LP-Balance nur versteckt im Withdraw-Tab.
- Soll: „Your position"-Karte auf der Earn-Seite bei verbundener Wallet. Größter einzelner Hebel.
- Umsetzungsnotiz: Neue `PositionSummary.tsx` — kompakte Leiste über dem Pools-Grid (Wert · LP-Shares · Pool-Anteil · „View details" → wechselt zum My-Liquidity-Tab). Rendert nur bei verbundener Wallet mit Position, refetcht bei jedem Pool-State-Refresh (bleibt nach Deposit/Withdraw synchron). „Pool Share" außerdem als vierte Kennzahl in der My-Liquidity-Übersichtskarte ergänzt.

### 7. Deposit-Vorab-Quote
- [x] **Status:** erledigt (10.07.2026)
- Betrifft: `PoolDetailModal.tsx`
- Aktuell: Withdraw zeigt „≈ X Token" vor dem Klick, Deposit zeigt die LP-Shares erst nach der Transaktion.
- Soll: „Du erhältst ~X LP" vor dem Deposit (wichtig wegen Bonus/Malus bei unbalancierten single-sided Deposits).
- Umsetzungsnotiz: Neues `quoteDepositSingleSided()` in `pool.ts` (Simulation mit `min_lp_out: 0`), im Deposit-Tab als debounced Zeile „You receive ≈ X LP shares" über der Rendite-Projektion. Braucht wie die Swap-Quote eine verbundene Wallet (Simulation läuft gegen den Account); Quote-Fehler beim Tippen (z. B. zu wenig Guthaben) zeigen „—" statt einer Fehlermeldung.

### 8. Max-Button + Insufficient-Balance-Validierung
- [x] **Status:** erledigt (Swap 10.07.2026 via #5; Deposit-Modal 13.07.2026)
- Betrifft: `SwapWidget.tsx`, `PoolDetailModal.tsx` (Deposit-Tab)
- Aktuell: Balance sichtbar, aber nicht klickbar; kein Max im Swap; Deposit-Modal zeigt Token-Balance gar nicht; Fehler kommt erst on-chain.
- Soll:
  - [x] 25/50/75/100 %-Buttons im Swap („You pay"-Panel, nur bei verbundener Wallet mit Guthaben)
  - [x] Token-Balance im Deposit-Modal anzeigen (+ 25/50/Max-Buttons dort) — via `getTokenBalance`, beim Modal-Redesign (siehe #30)
  - [x] Button-Label „Insufficient sDAI balance" + disabled bei zu wenig Guthaben (Swap; zusätzlich „Insufficient liquidity" wenn der Verkaufsbetrag die Reserve des Zieltokens übersteigt, und „Enter an amount" ohne Eingabe). Deposit-Modal: „Not enough EURC balance"-CTA-State analog.

### 9. Slippage-Settings + Min received + Price-Impact-Warnung
- [ ] **Status:** teilweise erledigt
- Betrifft: `SwapWidget.tsx` (Zahnrad inzwischen funktional), `lib/stellar/pool.ts`
- Soll:
  - [x] Zahnrad funktional machen: Slippage-Toleranz einstellbar — `TransactionSettings` mit Presets (Auto/0.1/0.5/1 %) + Custom, auf 0.01–50 % geclampt, fließt als `toleranceBps` in den On-Chain-`min_out`-Floor
  - [x] „Minimum received"-Zeile — Teil der neuen Swap-Detail-Box (GitHub-Issue #5, 10.07.2026): exakt derselbe BigInt-Floor, den `swapExactIn` on-chain submitted; daneben Route, Exchange Rate (per Klick invertierbar), Price Impact und Network Fee (echt, aus `minResourceFee` der Quote-Simulation)
  - [~] Farbwarnung bei Price Impact: >1 % rot umgesetzt; gelbe Zwischenstufe + Bestätigungsdialog bei >3 % noch offen

### 10. Onboarding-Pfad / Zero-Balance-State
- [ ] **Status:** offen
- Betrifft: `SwapWidget.tsx`, Cross-Links zwischen Swap ↔ Earn ↔ Faucet
- Aktuell: Neuer Nutzer mit 0 Guthaben bekommt keinen Hinweis auf den Faucet.
- Soll: Zero-Balance-State mit „Hol dir Test-Token im Faucet →"-CTA; Seiten verlinken aufeinander.

### 11. `paused`-State durchsetzen
- [ ] **Status:** offen
- Betrifft: `SwapWidget.tsx`, `PoolDetailModal.tsx`
- Aktuell: Stats zeigen „Paused", aber Swap/Deposit bleiben bedienbar und scheitern on-chain.
- Soll: Banner + deaktivierte CTAs bei pausiertem Pool.

### 12. Erfolgs-Feedback aufwerten
- [ ] **Status:** offen
- Betrifft: alle Transaktions-Flows
- Aktuell: 12px-Textzeile.
- Soll: Toast/Bestätigungsmoment mit Betrag, neuem Kontostand und Explorer-Link.

---

## P3 — Feinschliff

### 13. Testnet-Badge im Header
- [ ] **Status:** offen
- Betrifft: `Header.tsx`
- Permanenter, dezenter „Testnet"-Badge.

### 14. Zahlenformatierung vereinheitlichen
- [ ] **Status:** offen
- Betrifft: `lib/stellar/units.ts`, `lib/utils.ts`, alle Anzeigen
- Aktuell: volle Präzision („1234.5678901"), keine Tausendertrennung, kein USD-Gegenwert unter Inputs.
- Soll: einheitliches Format, `tabular-nums`, Anzeige 2–4 Nachkommastellen (Vollwert im Tooltip), „≈ $1,000.00" unter Amount-Inputs.

### 15. Wallet-Dropdown statt Sofort-Disconnect
- [ ] **Status:** offen
- Betrifft: `Header.tsx:146-161`
- Aktuell: Klick auf die verbundene Adresse trennt kommentarlos.
- Soll: Dropdown mit „Adresse kopieren", „Auf Explorer ansehen", „Disconnect".

### 16. Tote Nav-Links kennzeichnen
- [ ] **Status:** offen
- Betrifft: `Header.tsx:11-17` (Analytics, Docs)
- Soll: „Soon"-Badge statt nur ausgegraut — sonst wirkt es kaputt statt geplant.

### 17. SwapWidget-Skeleton statt `return null`
- [ ] **Status:** offen
- Betrifft: `SwapWidget.tsx:259`
- Aktuell: Widget poppt verzögert ins Layout (Layout-Shift auf der Landingpage).
- Soll: Skeleton in Widget-Größe, konsistent mit der Earn-Seite.

### 18. Hover-States ergänzen
- [ ] **Status:** offen
- Betrifft: Zahnrad, Flip-Button, Close-Button, Theme-Toggle, PoolCard-Deposit-Button u. a.
- Aktuell: `transition-*` gesetzt, aber keine Hover-Farbe definiert — es animiert nichts.

### 19. Accessibility
- [ ] **Status:** offen
- Betrifft: `TokenSelect` (SwapWidget), `TokenDropdown` (Faucet), `PoolDetailModal`, `PoolCard`
- Soll:
  - [ ] Dropdowns: Keyboard-Navigation + ARIA (die zwei Implementierungen ggf. zu einer Komponente zusammenführen)
  - [ ] Modal: Focus-Trap
  - [ ] `PoolCard`: `role="button"` + `tabIndex` (klickbares `div`)

### 20. Faucet: SUSD-Hinweis + neuer Kontostand
- [ ] **Status:** offen
- Betrifft: `Faucet.tsx`, `lib/stellar/config.ts` (SUSD `openMint: false`)
- Soll: Erklären, dass SUSD nicht mintbar ist; nach dem Mint neuen Kontostand zeigen.

### 21. Footer & Mobile-Hero
- [ ] **Status:** offen
- Betrifft: `index.astro`
- Soll: Footer-Links (GitHub, Contract-Adresse, Docs); mobil „Try the swap"-CTA zu `/swap`, da das Widget dort ausgeblendet ist.

### 22. Code-Hygiene
- [ ] **Status:** offen
- Betrifft: `Header.tsx:48-56`, `pool.ts:101-105` (auskommentierter Code), `README.md` (noch Astro-Starter-Template)

---

## P-Perena — Erkenntnisse aus dem Perena-Vergleich (app.perena.org/earn, analysiert 09.07.2026)

Referenz: Perenas Earn-Card-View. Was ihre Cards besser machen und was wir übernehmen wollen.

### 23. Card-Anatomie: Antwort auf „Was bekomme ich? Was riskiere ich?"
- [x] **Status:** erledigt (09.07.2026)
- Betrifft: `PoolCard.tsx`
- Perena-Card von oben nach unten: Hero-Artwork mit Badges (Chain + Lockup) → Token-Icon → **Zielgruppen-Eyebrow** („For most depositors", „For cautious depositors", „For high risk tolerance depositors") → Titel → **1–2 Sätze Klartext inkl. Risiko** („Your principal is backed by Perena. Capped at $1M", „your capital takes the hit first in bad times") → Stats-Row → Aktions-Buttons.
- Unsere Card sagt nur: Symbol, „StableSwap pool", TVL, Reserve, Pool Share — alles Protokoll-Metriken, nichts aus Nutzersicht.
- Soll:
  - [x] Eyebrow-Zeile pro Token/Pool (Zielgruppe oder Kategorie) — `POOL_COPY`-Map in `PoolCard.tsx` mit Fallback für unbekannte Symbole
  - [x] Ein Klartext-Satz pro Card: was passiert mit meinem Geld, was ist das Risiko
  - [x] Badges für Netzwerk („Stellar Testnet") und Eigenschaften („No lockup")
- Umsetzungsnotiz: Reserve/Pool Share von der Card entfernt (bleiben im Detail-Modal); Card ist nicht mehr als Ganzes klickbar — Aktionen laufen über die Buttons (#25), was nebenbei das A11y-Problem „klickbares div" aus #19 für die Card entschärft.

### 24. Stats-Row: APY zuerst, mit Akzentfarbe
- [x] **Status:** erledigt (09.07.2026)
- Betrifft: `PoolCard.tsx`
- Perena: segmentierte 3er-Stat-Box **APY / TVL / Holders** (bzw. Price). APY steht immer an Position 1 und ist die einzige farbige Zahl der Card (Lila-Akzent) — das Auge landet sofort auf der Rendite. Holders-Zahl = Social Proof.
- Wir: große TVL-Zahl als Held der Card, kein APY, kein Social Proof. (Verknüpft mit #4.)
- Soll:
  - [x] Stat-Box mit APY (Akzentfarbe, Position 1) · TVL · Holders — segmentierte 3er-Box; APY/Holders kommen aus `mockPoolStats` und sind mit `*`-Fußnote „Preview data" + Tooltip gekennzeichnet, TVL ist live
  - [x] Akzentfarbe eingeführt: `--c-accent` in `global.css` (Light `#6D28D9`, Dark `#A78BFA` — Lila) — **ausschließlich für Rendite-Zahlen (APY)**, sonst nirgends verwenden. Buttons und alle CTAs bleiben schwarz/weiß (`--c-cta-bg`/`--c-cta-text`), Trade-Republic-Stil. Auch der Preview-APY im `PoolDetailModal` trägt das Lila. (Erste Version war Grün + grüner Deposit-Button — auf Nutzerwunsch am 09.07. auf Lila-nur-für-APY geändert.)

### 25. Direkte Aktionen auf der Card (Deposit + Withdraw)
- [x] **Status:** erledigt (09.07.2026)
- Betrifft: `PoolCard.tsx`, `PoolDetailModal.tsx`
- Perena: jede Card hat zwei echte Buttons — **Deposit (primär, gefüllt, Akzent) + Withdraw (sekundär)**. Ein Klick = direkt im richtigen Flow-Modal.
- Wir: ganze Card klickbar, darin ein Ghost-Button „Deposit", der aber nur das Detail-Modal öffnet, wo man den Tab erst wählen muss.
- Soll:
  - [x] Deposit- und Withdraw-Button direkt auf der Card, öffnen das Modal im jeweiligen Modus — `PoolsGrid.onSelectToken(token, mode)` → `modalMode`-State in `PoolsPage` → `defaultMode`-Prop am `PoolDetailModal`
  - [x] Primär-CTA gefüllt (schwarz/weiß, `--c-cta-bg`) statt Ghost; Withdraw als sekundärer Outline-Button

### 26. Vergleichs-Tabelle („Compare all three")
- [ ] **Status:** offen
- Betrifft: `PoolsPage.tsx` (neu)
- Perena: aufklappbare Tabelle unter den Cards mit Zeilen wie **Expected APY, Age, If a loss occurs, Principal protected (Yes/Partial/No als farbige Chips), Lockup, Best for**. Beantwortet „Welcher ist für mich?" ohne die Seite zu verlassen.
- Soll: „Compare pools"-Expander unter unserem Grid (APY, TVL, Auslastung, Risiko-Hinweis, Best for). Bei 4 Stablecoins überschaubar und sehr wirkungsvoll.

### 27. Deposit-Modal: Rendite-Projektion + Gebühren-Transparenz
- [x] **Status:** erledigt (09.07.2026) — Kapazitäts-Balken blockiert, siehe Notiz
- Betrifft: `PoolDetailModal.tsx` (verknüpft mit #7)
- Perena-Modal zeigt: APY prominent · **„Est. returns per year: X USD"** (live aus dem eingegebenen Betrag gerechnet — der Trade-Republic-Moment) · Balance + Max · CTA passt sich Wallet-Status an („Connect Wallet") · Footer-Zeile mit Gebühren („Withdrawal: Instant (0.05% redemption fee)") · Kapazitäts-Fortschrittsbalken.
- Soll:
  - [x] „Est. returns per year" im Deposit-Tab, live aus Betrag × Preview-APY — Zeile unter dem Amount-Input, Wert in `--c-accent` (Rendite-Zahl), mit `*`-Kennzeichnung + Tooltip, da der APY aus `mockPoolStats` kommt
  - [x] Gebühren-Disclosure als feste Footer-Zeile im Modal (alle Tabs): „No lockup — deposits and withdrawals are instant. Single-sided amounts can shift slightly with pool balance (1% slippage guard). Stellar network fees apply." — keine erfundenen Fee-Zahlen, der 1%-Slippage-Guard ist der echte `toleranceBps`-Wert aus `pool.ts`
  - [ ] Kapazität/Auslastung visualisieren — **blockiert:** der Contract hat `max_caps`/`lp_max_supply` (Constructor, `set_token_cap`), exponiert aber keinen Getter dafür; SDK bietet nur `get_amp`/`get_owner`/`get_tokens`/`get_reserves`. Nachziehen, sobald ein Cap-Getter existiert (Contract-Dev ansprechen).

### 28. Portfolio-Tab auf der Earn-Seite
- [ ] **Status:** offen
- Betrifft: `PoolsPage.tsx` (verknüpft mit #6)
- Perena: Tabs **Invest / Portfolio / Rewards** direkt unter dem Seitentitel. Portfolio ist ohne Wallet disabled mit Tooltip „Connect your wallet to view your portfolio" — die Struktur verspricht: dein Geld hat hier einen Ort.
- Soll: Tab-Struktur „Invest / Portfolio" auf Earn; Portfolio zeigt LP-Position (disabled + Tooltip ohne Wallet).

### 29. Onboarding-Banner über dem Grid
- [ ] **Status:** offen
- Betrifft: `PoolsPage.tsx` (verknüpft mit #10)
- Perena: Banner „Make your first deposit easily — Take our quiz to get paired with your match" + CTA „Find my match". Nimmt Neulinge an die Hand, bevor sie die Cards vergleichen müssen.
- Soll: Für uns reicht ein schlankes Banner: „Neu hier? Hol dir Test-Token im Faucet →" bzw. später ein „Which pool fits you?"-Hinweis.

### 30. Deposit/Withdraw-Modal entrümpeln (Perena-Simplizität)
- [x] **Status:** erledigt (13.07.2026)
- Betrifft: `PoolDetailModal.tsx`
- Perena-Modal (Screenshots 13.07.): eine einzige Entscheidung — „Wie viel?". Deposit = Hero (APY + Est. returns) → Amount-Feld mit Token-Pill + Balance + Max → ein CTA → Fee-Footer. Withdraw noch schlanker (nur Betrag + Max, keine Hero-Zeile). **Keine** Reserve/TVL/Share/Amp/Decimals/Type/Holders/Vol im Handlungs-Flow.
- Wir vorher: Amount-Input war unter „Your Liquidity"-Callout, 6-Zellen-Statraster und Preview-Block vergraben (`max-h-[85vh]` mit Scroll); dazu ein dritter „Sparplan"-Tab.
- Soll:
  - [x] Statraster (Reserve/TVL/Share/Amp/Decimals/Type) + Preview-Daten (Holders/Vol) + „Your Liquidity" aus dem Modal entfernt. Zunächst in ein einklappbares „Pool details" verschoben, dann (siehe #31) durch einen „View full pool details →"-Link auf die dedizierte Pool-Seite ersetzt — Modal ist jetzt reiner Handlungs-Flow.
  - [x] Deposit: Hero-Zeile APY (Lila) + Est. returns/Jahr; Amount-Karte im Perena-Stil (großes Feld, Token-Pill rechts, Balance + 25/50/Max) — schließt zugleich #8
  - [x] Withdraw: keine Hero, nur LP-Betrag + Max + Live-Quote
  - [x] Sparplan als dritter Tab entfernt, als dezenter „Recurring · Soon"-Toggle in den Deposit-Flow gefaltet (analog Perenas „Amplify"-Toggle); Frequenz-Chips + Coming-soon-Hinweis beim Aufklappen
  - [x] In Light + Dark verifiziert, keine Konsolenfehler, `tsc` clean

### 31. Pool-Detail-/Transparency-Seite pro Pool (GitHub-Issue #24)
- [x] **Status:** erledigt (13.07.2026)
- Betrifft: `PoolDetailPage.tsx` (neu), `src/pages/pools/[token].astro` (neu, SSG via `getStaticPaths`), `PoolDetailModal.tsx`, `PoolCard.tsx`, `config.ts`
- Perena legt Reserven/Amp/Fees/Holder-Stats in ein eigenes Transparency-Dashboard statt in den Aktionsdialog. Wir haben das Gegenstück gebaut, damit die Tiefe sauber lebt und das Modal (siehe #30) reiner Handlungs-Flow bleibt.
- Umgesetzt:
  - [x] Eigene Route `/pools/[token]` (Slug = kleingeschriebenes Symbol), 4 statische Seiten; Live-Daten client-seitig aus dem Store
  - [x] Sektionen: Key-Metrics-Band (APY*/TVL/Share/Vol*), **Pool-Zusammensetzung** (Stacked-Share-Bar + alle 4 Token mit Reserve/Share/Rohbetrag, aktiver Token in Akzent), **Parameter & Health** (A, Pool-Typ, Status, LP-Supply, Decimals, Holders*), **Your position** (Wallet-gated), **How this pool works** (StableSwap-/Amplification-Erklärung — knüpft an #8/Lucas), **Contracts & network** (Pool- + Token-Contract mit Explorer-Links — schließt #15 für Pools)
  - [x] Erreichbar von Card („Pool details →") und Modal („View full pool details →"); `hideDetailsLink`-Prop unterdrückt den Link, wenn das Modal von der Detail-Seite selbst geöffnet wird
  - [x] `explorerContractUrl()` in `config.ts` ergänzt (Contract- statt Tx-Link)
  - [x] Preview-Daten weiterhin klar mit `*` markiert; Live vs. Preview im Footer erklärt
  - [x] Light + Dark verifiziert, keine Konsolenfehler, `tsc` clean, `astro build` erzeugt alle 4 Seiten
  - **Offen (blockiert, wie gehabt):** echte APY/Fees/Volumen/Holder + Cap-Auslastung — warten auf Contract-Getter bzw. Oracle (ROADMAP #4/#27)

### Bewusst NICHT übernehmen
- Search + Filter-Chips (Lockup/Strategy) — lohnt erst ab ~10+ Pools, wir haben 4.
- Hero-Artwork pro Card — Perenas KI-Blumenbilder sind Branding-Geschmackssache; unser reduziertes Schwarz/Weiß ist eine bewusst andere, seriösere Richtung. Falls visuelles Gewicht gewünscht: eher dezente Token-Farbakzente als Vollbild-Artwork.
- Rewards-Tab / Punkteprogramm — kein Äquivalent bei uns.

---

## Empfohlene Reihenfolge (Top 5)

1. **#1 + #2** Transaktions-Lifecycle + Fehler-Mapping + Explorer-Links — betrifft jede Interaktion, größter Vertrauensgewinn.
2. **#6 + #7** Positions-Karte auf Earn + Deposit-Quote — macht „Earn" erst zu einem Produkt.
3. **#5 + #8** Quote ohne Wallet + Max-Button + Balance-Validierung — repariert die Erstnutzer-Erfahrung.
4. **#3 + #4 + #13** Landing-Stats echt machen, Fee/APY ausweisen, Testnet-Badge — Ehrlichkeit sichtbar machen.
5. **#9** Slippage-Settings + Min received + Price-Impact-Warnung.

---

## Changelog

- 2026-07-08 — Audit durchgeführt, Roadmap erstellt. Alle Punkte offen.
- 2026-07-09 — Perena-Earn-Seite analysiert (Card-View-Vergleich), Punkte #23–#29 ergänzt.
- 2026-07-09 — Card-Überarbeitung umgesetzt: #23, #24, #25 erledigt, #4 teilweise (Preview-APY sichtbar, Fee noch offen). Akzentfarbe `--c-accent` eingeführt. Verifiziert im Browser (Light + Dark, Withdraw-Button öffnet Modal im Withdraw-Tab).
- 2026-07-09 — Akzentfarbe nach Feedback von Grün auf Lila umgestellt und strikt auf APY-Zahlen beschränkt; Deposit-Button zurück auf monochromes Schwarz/Weiß.
- 2026-07-09 — #27 umgesetzt: „Est. returns per year" live im Deposit-Tab + Gebühren-Footer im Modal. Kapazitäts-Balken blockiert (kein Cap-Getter im Contract). Im Browser verifiziert (1500 sDAI × 6.8% → ≈ $102.00).
- 2026-07-10 — #1 + #2 umgesetzt: Transaktions-Lifecycle-Stepper (`TxStatus.tsx`, gespeist aus `onPhase`-Callbacks in `pool.ts`/`faucet.ts`) in Swap, Deposit, Withdraw und Faucet; Fehler-Mapping `mapTxError()` ersetzt rohe `err.message` überall. Stepper-, Erfolgs- und Fehler-Zustand im Browser verifiziert (u. a. `Error(Contract, #14)` → Slippage-Klartext).
- 2026-07-10 — #6 + #7 umgesetzt: „Your position"-Leiste über dem Pools-Grid (`PositionSummary.tsx`) + Pool-Share-Kennzahl in My Liquidity; Deposit-Vorab-Quote „You receive ≈ X LP shares" via `quoteDepositSingleSided()`. Beides im Browser verifiziert (Layout mit Temp-Daten, danach zurückgebaut).
- 2026-07-10 — Alle Flows end-to-end auf Testnet verifiziert (frischer Friendbot-Account, echte Transaktionen): Faucet-Mint, Swap (250 sDAI → 249.953 sUSDT), Deposit (Quote 499.993859157 LP == tatsächlich erhaltene LP), Position-Leiste/My Liquidity mit echten Werten, Withdraw (Quote == Ergebnis), Fehler-Mapping („Not enough sDAI in your wallet for this amount."). Dabei gefundener Bug gefixt: Bei fehlgeschlagener Simulation liefert das SDK ein `Err`-Objekt statt zu werfen — Quote-Zeilen zeigten „[object Object]". Fix: `unwrapResult()` in `pool.ts` an allen `.result`-Stellen; `mapTxError` erkennt zusätzlich die dekodierte InsufficientBalance-Docstring-Meldung. Bekannte Kleinigkeit (vorbestehend): Balance-Refresh direkt nach Tx-Erfolg kann dem Ledger einen Moment hinterherhinken.
- 2026-07-10 — Verifikations-Findings gefixt und erneut auf Testnet verifiziert: (1) Balance-Refresh nach Tx-Erfolg pollt jetzt bis sich der Wert ändert (`refetch.ts`, in Swap-Balances und LP-Balance nach Deposit/Withdraw; My Liquidity refetcht bei Pool-State-Refresh) — Swap 50 sDAI: beide Balances aktualisierten sich ohne Reload exakt. (2) Token-Avatare zeigten „US" für sUSDT/SUSD/sUSDC (`slice(0,2)`) — jetzt `tokenAvatarLabel()` (nur s-Präfix strippen): DAI · USDT · SUSD · USDC, überall (Cards, Modal, My Liquidity, Faucet).
- 2026-07-10 — GitHub-Issues #11 + #20 (Quick Wins, PR #21 gemerged): Landing-Hero neu getextet („Global asset exchange, built on Stellar" / „Trade clear, spread less"), CTAs „Generate Yield" + „Exchange Assets", Stats-Reihe auf die vorgegebenen Werte inkl. „Not live data"-Disclaimer mit stabble.org-Link, How-it-works-Karten mit neuer Copy (Transparent Execution / Minimal Slippage / Single-Asset Deposits). Issue #18 als Duplikat von #16 geschlossen.
- 2026-07-10 — GitHub-Issue #5 umgesetzt (deckt Roadmap #8-Swap-Teil und #9-Rest mit ab): 25/50/75/100 %-Buttons im „You pay"-Panel; Swap-Detail-Box mit Route, invertierbarer Exchange Rate, Price Impact (`<0.01%`-Format, rot ab >1 %), Network Fee aus der Quote-Simulation (`quoteSwapExactIn` gibt jetzt `{amountOut, networkFeeXlm}` zurück) sowie „Execution protection" (Slippage-Toleranz + Minimum received, exakt der On-Chain-Floor); CTA-States „Enter an amount" / „Insufficient X balance" / „Insufficient liquidity". Pool-Fee-Zeile bewusst weggelassen (kein Fee-Getter im Contract, Roadmap #4). End-to-end auf Testnet verifiziert: 25 %-Button → Swap 74.9969135 sDAI → erhalten exakt die gequotete Menge 74.9765754 sUSDT, Min received 74.2268097 == Quote × 0.99, Balances in-place aktualisiert.
- 2026-07-13 — GitHub-Issue #28 umgesetzt: Earn-Seite semantisch entwirrt. Die Asset-Karten sind keine „Pools", sondern Wege, in den EINEN StableSwap-Pool einzuzahlen — daher Tabs umbenannt zu **Invest** (die Karten) · **Pools** · **Portfolio** (vorher „Pools"/„My Liquidity"). Neuer **Pools**-Tab zeigt den einen Pool register-artig als eine Zeile (`PoolsRegister.tsx`: Icon-Cluster, A/Status, Assets, TVL, APY-Range 4.9–8.1 %) → Klick öffnet die neue **pool-weite** Transparency-Seite `/pools/stableswap` (`PoolOverviewPage.tsx`): Header mit Icon-Cluster + Invest/Swap-CTAs, Key-Metrics (APY-Range/TVL/Assets/24h-Vol\*), Composition (alle 4 Assets, jede Zeile verlinkt auf die per-Token-Detailseite `/pools/[token]`), Parameters & Health, StableSwap-Erklärung, alle Kontrakte + Network. Subtitle wechselt pro Tab. `Section`/`Field`/`ContractRow` aus `PoolDetailPage` exportiert und wiederverwendet. Live vs. Preview weiter strikt getrennt (`*`). Verifiziert im Browser (Light + Dark): Tabs, Register-Zeile, Detailseite, Contracts. `tsc` clean, `astro build` erzeugt `/pools/stableswap`.
- 2026-07-13 — Nachschärfung zu #28 (Feedback Lucas): „Pools" ist jetzt ein eigener **Header-Menüpunkt**, kein Earn-Tab. Routing entwirrt: `/pools` = Pools-Registerliste (`PoolsListPage` → `PoolsRegister`), Earn-Seite umgezogen auf `/earn` (Header „Earn" → `/earn`, „Pools" → `/pools`). Earn hat wieder nur **Invest** + **Portfolio**. Detailseiten bleiben unter `/pools/[token]` bzw. `/pools/stableswap`, alle mit `currentPage="pools"`. „Earn/Deposit"-CTAs (Landing „Generate Yield" ×2, Swap-Erfolg „Generate Yield", Activity-Retry für deposit/withdraw, Overview-„Invest") zeigen jetzt auf `/earn`; Backlinks der Detailseiten auf `/pools` (Register). Verifiziert im Browser (Light + Dark).
- 2026-07-14 — GitHub-Issue #30 (Feedback Lucas): Landing-CTA „Exchange Assets" vom nackten Text-Link zu einem **Ghost-Button** aufgewertet — gleiche Maße wie das primäre „Generate Yield" (px-6 py-3, font-bold, rounded-xl, SVG-Pfeil), aber Outline (`--c-border-2`) statt Fill. Damit klar als zweite Aktion erkennbar. Verifiziert im Browser (Light + Dark).
