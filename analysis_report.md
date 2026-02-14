# Status & Risiko-Bericht: cachy-app Hardening

## Zusammenfassung
Die Codebasis zeigt eine solide Architektur ("Institutional Grade" Ambitionen) mit fortschrittlichen Mustern wie Buffer-Pooling, SOA (Structure of Arrays) für Performance und strikter Typisierung via Zod. Dennoch wurde eine **kritische Lücke** in der Datenintegrität gefunden, die die Zuverlässigkeit von Trading-Signalen gefährdet.

## 🔴 CRITICAL (Sofortiger Handlungsbedarf)

### 1. Fehlende "Gap Filling" Logik in Marktdaten
*   **Ort:** `src/services/marketWatcher.ts`
*   **Problem:** Die Methode `fillGaps` ist implementiert, wird aber **nirgendwo aufgerufen**.
*   **Risiko:** Bei Verbindungsabbrüchen (WebSocket Reconnect) oder lückenhaften REST-Daten entstehen "Löcher" in der `Kline`-Historie.
*   **Auswirkung:** Technische Indikatoren (EMA, RSI, MACD) berechnen falsche Werte. Ein einziger fehlender Candle kann den EMA für hunderte Folge-Perioden verfälschen. Dies führt zu **falschen Trading-Signalen** und potenziellem Geldverlust.
*   **Beweis:** `grep` zeigt keine Aufrufe der Methode außerhalb ihrer Definition.

### 2. Typ-Unsicherheit in TradeService
*   **Ort:** `src/services/tradeService.ts`
*   **Problem:** Das Interface `TpSlOrder` nutzt `[key: string]: any`.
*   **Risiko:** Refactorings oder API-Änderungen werden vom TypeScript-Compiler nicht abgefangen. Laufzeitfehler beim Zugriff auf nicht vorhandene Properties möglich.

## 🟡 WARNING (Hohe Priorität)

### 1. Implizite "Empty String" Handhabung in JSON-Parsing
*   **Ort:** `src/utils/safeJson.ts`
*   **Problem:** Gibt bei leerem Input einen leeren String zurück, statt `null` oder Fehler.
*   **Risiko:** Verlässt sich darauf, dass nachgelagerte Validierer (Zod) dies abfangen. Explizites `null` wäre robuster.

### 2. Mutation von Objekten im "Fast Path"
*   **Ort:** `src/services/bitunixWs.ts`
*   **Problem:** Der WebSocket-Handler mutiert `data.lastPrice` etc. in-place (`if (typeof val === 'number') ...`).
*   **Risiko:** Wenn dieses Datenobjekt an anderer Stelle referenziert wird (z.B. in einem Cache, der immutable sein sollte), führt dies zu Seiteneffekten. (Aktuell scheint es sicher, da `JSON.parse` neue Objekte erzeugt, aber es ist ein "Code Smell" für Reactive State).

## 🔵 REFACTOR (Technische Schuld)

### 1. Hardcoded Strings & Magic Numbers in UI
*   **Ort:** `src/components/inputs/TradeSetupInputs.svelte`
*   **Findings:**
    *   Hardcodiertes "🙂" Smiley.
    *   "Magic Numbers" für die Berechnung der Input-Steps (`if (price > 1000) return 0.5`). Dies sollte in eine zentrale Config oder Utility ausgelagert werden.

### 2. Dead Code
*   **Ort:** `src/services/marketWatcher.ts`
*   **Findings:** Neben dem kritischen `fillGaps` gibt es ungenutzte Importe oder Methoden-Fragmente, die bereinigt werden sollten.

---

## Empfohlener Aktionsplan (Vorschau)

1.  **Reproduktion:** Testfall erstellen, der eine Lücke in den Klines simuliert und beweist, dass diese aktuell nicht gefüllt wird.
2.  **Fix:** Integration von `fillGaps` in den `ensureHistory` und `pollSymbolChannel` Flow.
3.  **Hardening:** `TradeService` Typen strikter gestalten.
4.  **Cleanup:** I18n Keys ergänzen und Dead Code entfernen.
