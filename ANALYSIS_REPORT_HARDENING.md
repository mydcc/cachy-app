# Status & Risiko-Bericht (Schritt 1)

## Zusammenfassung
Die Codebasis ist grundsätzlich robust (Nutzung von `Decimal.js`, `safeJsonParse`, OMS-Watchdog), weist jedoch kritische Risiken in der Datenverarbeitung von WebSocket-Nachrichten und potenzielles Speicher-Überlauf-Verhalten im News-Service auf.

## 🔴 CRITICAL (Kritisch)
**Gefahr von Datenverlust oder Inkonsistenz**

1.  **Präzisionsverlust bei WebSocket-IDs (`src/services/bitunixWs.ts`)**
    *   **Befund:** Der Code warnt explizit: `CRITICAL: orderId is number!`. Die Verarbeitung verlässt sich vollständig auf `safeJsonParse`. Sollte das Regex-Matching fehlschlagen (z.B. durch geänderte JSON-Formatierung der API), werden 19-stellige IDs zu JavaScript-Numbers und verlieren Präzision (letzte Stellen werden 0).
    *   **Risiko:** Order-Management versagt; Orders können nicht mehr storniert oder getrackt werden.
    *   **Empfehlung:** `safeJsonParse` Regex robuster gestalten und Zod-Schema erzwingen, dass IDs Strings sein *müssen* (Parse-Fehler statt stiller Korruption).

2.  **Unbegrenzter Speicherverbrauch (`src/services/newsService.ts`)**
    *   **Befund:** `fetchNews` lädt via `dbService.getAll("news")` *alle* jemals gespeicherten News-Einträge in den RAM, um sie zu sortieren und zu deduplizieren (`newsItems = [...newsItems, ...mapped]`).
    *   **Risiko:** Bei längerer Laufzeit wächst die IDB. Ein Laden von Tausenden News-Objekten (mit Strings) führt zum Absturz des Browser-Tabs (OOM).
    *   **Empfehlung:** Limitierung der `getAll`-Abfrage oder Paginierung implementieren.

## 🟡 WARNING (Warnung)
**Performance & UX Risiken**

1.  **Optimistic Order Ghosting (`src/services/tradeService.ts`)**
    *   **Befund:** `flashClosePosition` erstellt eine optimistische Order. Bei einem Netzwerkfehler (nicht API-Fehler) bleibt diese bestehen.
    *   **Mitigation:** `omsService.ts` enthält einen Watchdog (`removeOrphanedOptimistic`), der alle 30s aufräumt. Das ist gut, aber ein Restrisiko für "Ghost Orders" im UI für 30s bleibt.

2.  **Hardcoded Strings (Fehlende i18n)**
    *   **Befund:** In `src/components/shared/MarketOverview.svelte` wurden Strings gefunden:
        *   `"No market data available"`
        *   `"RSI Settings"` (in Tooltip)
        *   `"Open Real-time Chart"`
    *   **Risiko:** Inkonsistente UX für nicht-englische Nutzer.

3.  **Thread Contention durch Timer**
    *   **Befund:** `MarketWatcher`, `MarketManager` und `BitunixWs` nutzen jeweils eigene `setInterval`-Loops (teilweise 250ms).
    *   **Risiko:** Erhöhte CPU-Last im Leerlauf.

## 🔵 REFACTOR (Technisch)

1.  **{@html} Usage**
    *   **Befund:** 22 Verwendungen von `{@html}`.
    *   **Bewertung:** Die meisten nutzen `icons` (vertrauenswürdig aus `constants.ts`) oder `renderSafeMarkdown` (sanitized).
    *   **Aktion:** Keine direkte Gefahr, aber sollte bei Reviews stets beachtet werden.

---

**Empfohlener Aktionsplan (Schritt 2):**
1.  **Härtung `safeJsonParse`:** Unit Tests für Edge-Cases hinzufügen.
2.  **News-Service optimieren:** `slice()` oder Index-Limitierung einbauen.
3.  **i18n Fixes:** Hardcoded Strings extrahieren.
