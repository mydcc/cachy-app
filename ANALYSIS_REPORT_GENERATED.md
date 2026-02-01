# Statusbericht: Systematische Wartung & Hardening

Dieser Bericht fasst die Ergebnisse der "Step 1" Tiefenanalyse zusammen.

## Zusammenfassung
Die Codebasis befindet sich in einem soliden Zustand ("Institutional Grade" in vielen Bereichen). Kritische Sicherheits- oder Datenintegritätslücken wurden nicht gefunden. Es bestehen jedoch Risiken im Bereich Performance (Skalierbarkeit der UI) und Wartbarkeit (WebSocket-Parser).

---

## 🔴 CRITICAL (Kritische Risiken)
*Keine kritischen Risiken identifiziert.*
- **Datenintegrität:** `Decimal.js` wird konsequent für Finanzberechnungen in `TradeService` und `MarketStore` verwendet.
- **Sicherheit:** Benutzereingaben werden client-seitig regex-validiert und API-Antworten werden serverseitig schema-validiert (Zod).

---

## 🟡 WARNING (Handlungsbedarf)

### 1. Performance: `MarketOverview` Timer-Explosion
- **Ort:** `src/components/shared/MarketOverview.svelte`
- **Problem:** Jede Instanz der Kachel (Tile) startet ein eigenes `setInterval` (1000ms) für den Funding-Countdown. Bei 50+ Kacheln führt dies zu unnötiger CPU-Last und "Timer-Thrashing" im Browser.
- **Empfehlung:** Zentralisierung des Countdowns in `MarketStore` oder einen globalen `TimeService`, der ein Signal emittiert.

### 2. Wartbarkeit: WebSocket "Fast Path" Fragilität
- **Ort:** `src/services/bitunixWs.ts`
- **Problem:** Der "Fast Path" (Performance-Optimierung) umgeht die Zod-Schema-Validierung und greift manuell auf Eigenschaften zu (`data.lp`, `data.lastPrice`). Wenn die API das Format ändert (z.B. Umbenennung von Feldern), greift der Code ins Leere, bevor der Fallback einspringt.
- **Empfehlung:** Hinzufügen von "Safe Accessor"-Funktionen oder Unit-Tests, die exakt diese Pfade mit Mock-Daten abdecken.

### 3. I18n: Audit Script False Positives
- **Ort:** `scripts/audit_translations.py` vs. `src/services/tradeService.ts`
- **Problem:** Das Audit-Skript meldet Fehler (Unused Keys) für dynamisch genutzte Keys wie `apiErrors.fetchFailed`.
- **Empfehlung:** Anpassung des Regex-Patterns im Audit-Skript, um auch String-Literale in `Error()` Konstruktoren zu finden.

---

## 🔵 REFACTOR (Technische Schulden)

### 1. DRY: Timeframe Mapping Duplikation
- **Ort:** `src/services/marketWatcher.ts` vs. `src/services/bitunixWs.ts`
- **Problem:** Die Logik zur Umwandlung von Timeframes (`1m` -> `1min`) ist an mehreren Stellen dupliziert.
- **Empfehlung:** Auslagerung in `src/utils/symbolUtils.ts` oder `technicalsTypes.ts`.

---

## Nächste Schritte (Vorschlag für Step 2)

1. **Refactoring `MarketOverview`**: Implementierung eines globalen Tickers für Countdowns.
2. **Hardening `BitunixWs`**: Unit-Tests für den "Fast Path" schreiben, um Regressionen bei API-Änderungen zu verhindern.
3. **Fix Audit Script**: `audit_translations.py` robuster machen.
