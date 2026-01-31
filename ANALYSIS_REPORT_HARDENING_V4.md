# Status- & Risiko-Bericht: Cachy-App Hardening (Phase 4)

**Datum:** 2025-05-24
**Status:** In-Depth Analysis Complete
**Rolle:** Senior Lead Developer

## 1. Executive Summary
Die Analyse hat **kritische Sicherheits- und Datenintegritäts-Lücken** aufgedeckt, die in vorherigen Audits übersehen wurden oder neu entstanden sind. Insbesondere die **Exponierung von API-Keys** im Frontend und die **stille Unterdrückung von Fehlern** bei der Positions-Synchronisierung stellen ein erhebliches Risiko dar.
Die Basis-Architektur ist solide, aber die "letzte Meile" der Implementierung weist Flüchtigkeitsfehler auf, die für eine "Institutional Grade" Plattform inakzeptabel sind.

## 2. Priorisierte Findings

### 🔴 CRITICAL (Sofortiger Handlungsbedarf)

#### 1. API-Key Exponierung (NewsService)
*   **Ort:** `src/services/newsService.ts` (`analyzeSentiment`)
*   **Problem:** OpenAI und Gemini API-Keys werden direkt im Client verwendet (`dangerouslyAllowBrowser: true`).
*   **Risiko:** Ein Angreifer kann die Keys aus dem Browser extrahieren und Kosten verursachen oder Quotas aufbrauchen.
*   **Impact:** Hoher finanzieller Schaden möglich.
*   **Action:** Logik zwingend in einen serverseitigen Endpunkt (`/api/ai/sentiment`) verschieben.

#### 2. Stille Datenverluste (TradeService)
*   **Ort:** `src/services/tradeService.ts` (`fetchOpenPositionsFromApi`)
*   **Problem:** "Best Effort Parsing" fängt Validierungsfehler bei Positionen ab und loggt sie nur (`logger.warn`). Ungültige Positionen werden aus der UI entfernt.
*   **Risiko:** Ein Nutzer sieht "Keine offenen Positionen", obwohl er eine (strukturell ungültige) Position an der Börse hält. Er kann diese nicht schließen -> Liquidationsrisiko.
*   **Action:** Bei Validierungsfehlern muss der Sync fehlschlagen (Fail Fast) und der Nutzer alarmiert werden ("Dateninkonsistenz"), anstatt Positionen zu verstecken.

#### 3. Unsichere Preis-Validierung
*   **Ort:** `src/types/apiSchemas.ts` (`BitunixTickerSchema`)
*   **Problem:** `StrictDecimal` erlaubt Fallback auf `0` bei Fehlern. `lastPrice` wird nicht explizit auf `> 0` geprüft.
*   **Risiko:** Ein Preis von `0` kann Algorithmen (z.B. ROI-Berechnung, Stop-Loss) zum Absturz bringen oder falsche Trades auslösen.
*   **Action:** `refine((v) => v.gt(0))` für alle Preis-Felder erzwingen.

#### 4. Race Condition bei Flash Close
*   **Ort:** `src/services/tradeService.ts` (`flashClosePosition`)
*   **Problem:** Bei Netzwerk-Timeouts bleibt eine "optimistische Order" bestehen oder wird gelöscht, ohne den echten Status zu kennen ("Two Generals Problem").
*   **Action:** Implementierung eines robusten "Reconciliation"-Mechanismus, der den Status der Order aktiv prüft, bevor der optimistische State bereinigt wird.

### 🟡 WARNING (Qualität & UX)

#### 1. Performance Hot-Path (MarketStore)
*   **Ort:** `src/stores/market.svelte.ts` (`applyUpdate`, `updateSymbolKlines`)
*   **Problem:** Massive Instanziierung von `Decimal` Objekten bei jedem Tick (High Frequency). `updateSymbolKlines` nutzt ineffizientes Array-Slicing und Copying (`[...history]`).
*   **Risiko:** UI-Freezes bei hoher Volatilität, schlechte LCP/INP-Werte.
*   **Action:** Optimierung der Update-Logik (String-Vergleich vor Decimal-Erstellung, In-Place Updates wo möglich).

#### 2. Fehlende i18n & Hardcoded Strings
*   **Ort:** `src/components/shared/PositionsList.svelte`, `NewsService`.
*   **Problem:** GUI-Texte und Fehlermeldungen sind hardcodiert.
*   **Action:** Extraktion in `locales/*.json`.

#### 3. Broken State (PositionsList)
*   **Ort:** `src/components/shared/PositionsList.svelte`
*   **Problem:** ROI-Berechnung zeigt `0%` oder stürzt ab, wenn `margin` fehlt/0 ist. Keine "Retry"-UI bei Ladefehlern.

### 🔵 REFACTOR

#### 1. Lose Typisierung
*   **Ort:** `PositionsList.svelte` (`positions: any[]`)
*   **Action:** Strenge Typisierung mit `OMSPosition[]`.

## 3. Strategische Empfehlung
Die Behebung der CRITICAL-Issues hat absoluten Vorrang vor Feature-Entwicklung. Die Umstellung der AI-Services auf Server-Side-Execution ist architektonisch notwendig.
