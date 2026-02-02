# Action Plan: System Hardening (Phase 2)

Basierend auf dem `ANALYSIS_REPORT_HARDENING_V8.md` werden folgende Maßnahmen zur Umsetzung freigegeben.

## Priorität 1: Data Safety & Precision (CRITICAL)

### Aufgabe 1.1: `nextFundingTime` Härtung
*   **Ziel:** Entfernen der "magischen" Heuristik in `src/stores/market.svelte.ts`.
*   **Maßnahme:**
    *   Ersetzen der Logik `if (nft < 10000000000)` durch eine explizite Prüfung basierend auf dem erwarteten Format (z.B. immer ms erwarten oder API-Doku prüfen).
    *   Implementierung einer Hilfsfunktion `parseFundingTime(val: number | string): number | null` in `src/utils/utils.ts`.
*   **Verifikation:** Unit Test mit verschiedenen Inputs (Sekunden-Timestamp, Millisekunden-Timestamp, ISO-String).

### Aufgabe 1.2: WebSocket OrderID Präzision
*   **Ziel:** Sicherstellen, dass Order-IDs niemals als Number interpretiert werden.
*   **Maßnahme:**
    *   In `src/services/bitunixWs.ts`: Anpassen der `sanitize`-Funktion im `order` Channel.
    *   Statt `typeof item.orderId === 'number'`, sollte der Code warnen, wenn `orderId` KEIN String ist.
    *   Prüfung, ob `safeJsonParse` korrekt greift (Testfall erstellen).

## Priorität 2: Performance Optimization (WARNING)

### Aufgabe 2.1: Optimierung `applySymbolKlines`
*   **Ziel:** Reduktion der CPU-Last bei einzelnen WebSocket-Updates.
*   **Maßnahme:**
    *   In `src/stores/market.svelte.ts`: Unterscheidung zwischen "Bulk Load" (REST) und "Single Update" (WS).
    *   Bei `klines.length === 1`: Überspringen von `sort()` und `deduplicate`. Einfaches Anhängen oder Update der letzten Candle.
    *   Nur bei `klines.length > 1`: Ausführen der Sortierlogik.

## Priorität 3: Refactoring & Maintenance (REFACTOR)

### Aufgabe 3.1: Zentralisiertes Timeframe Mapping
*   **Ziel:** Vermeidung von Code-Duplizierung und Inkonsistenz.
*   **Maßnahme:**
    *   Erstellen von `src/utils/timeframeMappings.ts`.
    *   Exportieren von `mapTimeframeToBitunix(tf: string): string` und `mapBitunixToTimeframe(tf: string): string`.
    *   Refactoring von `src/services/marketWatcher.ts` und `src/services/bitunixWs.ts` zur Nutzung dieser Utility.

### Aufgabe 3.2: Cleanup `TradeService`
*   **Ziel:** Vereinfachung der Payload-Serialisierung.
*   **Maßnahme:**
    *   Überarbeitung von `serializePayload` in `src/services/tradeService.ts`.
    *   Prüfung, ob `JSON.stringify` mit Custom Replacer effizienter/lesbarer ist.

## Testplan

Vor der Umsetzung (TDD) sind folgende Tests zu erstellen:

1.  **Unit Test `FundingTime`:**
    *   Input: `1700000000` (Sekunden) -> Erwartet: `1700000000000` (ms).
    *   Input: `1700000000000` (ms) -> Erwartet: `1700000000000` (ms).
    *   Input: `"2026-05-22T..."` -> Erwartet: Timestamp.

2.  **Unit Test `MarketManager` Performance:**
    *   Benchmark Test: 1000x Aufruf von `updateSymbolKlines` mit je 1 Candle. Messung der Zeit mit und ohne Sortierung.

3.  **Unit Test `BitunixWs` Precision:**
    *   Mock WS Message mit `orderId: 1234567890123456789` (als String im JSON).
    *   Verifizieren, dass `safeJsonParse` dies als String erhält.
    *   Verifizieren, dass `sanitize` keinen Fehler wirft.

## Zeitplan
*   **Tag 1:** Fix 1.1, 1.2 (Data Safety) + Tests.
*   **Tag 2:** Fix 2.1 (Performance) + Benchmarks.
*   **Tag 3:** Fix 3.1, 3.2 (Refactoring) + Final Review.
