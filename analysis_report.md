# Status- & Risiko-Bericht (Phase 1)

**Datum:** 2024-05-23
**Projekt:** Cachy-App (Trading Platform)
**Rolle:** Lead Architect

## Zusammenfassung
Die Codebasis zeigt bereits ein hohes Maß an Reife (Verwendung von `Decimal.js`, `Zod`-Validierung, `BufferPools`). Es wurden jedoch einige Risiken identifiziert, insbesondere im Bereich der `MarketWatcher`-Logik (potenzielle Endlosschleifen), der WebSocket-Abonnement-Verwaltung und der UX (native `confirm()` Dialoge).

---

## 🔴 CRITICAL (Risiko für Kapitalverlust, Absturz oder Sicherheit)

1.  **Potenzielle Endlosschleife in `MarketWatcher.fillGaps`**
    *   **Ort:** `src/services/marketWatcher.ts`
    *   **Problem:** Die `while (nextTime < curr.time)` Schleife verlässt sich darauf, dass `intervalMs` korrekt und positiv ist. Wenn `intervalMs` 0 oder NaN ist (z.B. durch fehlerhaftes Parsen des Timeframes), entsteht eine Endlosschleife, die den Browser einfriert.
    *   **Risiko:** Absturz der Anwendung während des Handels.

2.  **Fehlerhafte Key-Extraktion in `BitunixWs.flushPendingSubscriptions`**
    *   **Ort:** `src/services/bitunixWs.ts`
    *   **Problem:** Die Zeile `const [channel, symbol] = key.split(":");` funktioniert nur korrekt, wenn das Symbol *keinen* Doppelpunkt enthält. Während dies bei Bitunix aktuell der Fall ist, ist die Logik fragil.
    *   **Risiko:** Fehlgeschlagene Wiederherstellung von Abonnements nach Verbindungsabbruch.

3.  **Typ-Unsicherheit bei `ensureHistory` Backfill**
    *   **Ort:** `src/services/marketWatcher.ts`
    *   **Problem:** `backfillBuffer` ist als `any[]` typisiert. Es gibt keine Garantie, dass die Datenstruktur den Erwartungen von `marketState.updateSymbolKlines` entspricht, bevor sie übergeben wird.
    *   **Risiko:** Inkonsistente Chart-Daten oder Laufzeitfehler bei der Verarbeitung.

---

## 🟡 WARNING (Performance, UX, Wartbarkeit)

1.  **Blockierende UI durch native Dialoge**
    *   **Ort:** `src/components/shared/PositionsList.svelte`
    *   **Problem:** Verwendung von `confirm(...)` blockiert den gesamten Render-Thread.
    *   **Empfehlung:** Ersetzen durch `Modal`-Komponente.

2.  **Komplexe Puffer-Logik im Main-Thread**
    *   **Ort:** `src/stores/market.svelte.ts` (`applySymbolKlines`)
    *   **Problem:** Das Mergen und Rebuilden der Buffer Arrays geschieht im Main-Thread. Bei großen Datensätzen (Backfill > 2000 Kerzen) kann dies zu "Jank" (Ruckeln) führen.
    *   **Empfehlung:** Auslagerung in WebWorker oder Optimierung der `splice`-Logik.

3.  **Hartcodierte Timeframe-Map in `BitunixWs`**
    *   **Ort:** `src/services/bitunixWs.ts`
    *   **Problem:** `getBitunixChannel` nutzt eine feste Map. Neue Timeframes erfordern Code-Änderungen an mehreren Stellen.

4.  **Fehlende `untrack` Absicherung in Intervallen**
    *   **Ort:** `src/services/bitunixWs.ts`
    *   **Problem:** Timer, die auf Reactive State zugreifen, könnten versehentlich Re-Runs auslösen, wenn sie nicht strikt gekapselt sind (Svelte 5 Runes).

---

## 🔵 REFACTOR (Technische Schulden)

1.  **Manuelle Tooltip-Positionierung**
    *   **Ort:** `PositionsList.svelte`
    *   **Problem:** Eigene Berechnung von `x/y` Koordinaten ist fehleranfällig bei Randbereichen.
    *   **Empfehlung:** Nutzung von `floating-ui` (bereits in `package.json`).

2.  **Zentralisierung der API-Fehler**
    *   **Ort:** `TradeService.ts` vs `orders/+server.ts`
    *   **Problem:** Fehler-Codes werden an mehreren Stellen definiert.
    *   **Empfehlung:** Eine zentrale `errors.ts` Datei für alle Services und API-Routen.
