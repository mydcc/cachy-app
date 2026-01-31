# Status & Risk Report (Institutional Grade Audit)

**Date:** 2026-05-21
**Scope:** `cachy-app` Codebase (Services, Stores, UI, Tests)
**Auditor:** Jules (Senior Lead Developer)

## 🔴 CRITICAL (Kritische Risiken)

### 1. Test Suite Regressions (Datenintegrität)
*   **Befund:** `npm test` schlägt in 3 kritischen Dateien fehl.
    *   `src/tests/tradeService_race.test.ts`: Mock-Fehler (`omsService.getOrder is not a function`). Dies verhindert die Verifizierung der "Optimistic Order Persistence" (Schutz gegen "Two Generals Problem").
    *   `src/stores/marketStore.test.ts`: Der Test "should prioritize WS updates over REST" schlägt fehl. Die Logik wurde laut Code-Kommentaren ("REMOVED: We now trust the upstream...") entfernt, aber der Test erwartet noch das alte Verhalten. **Risiko:** Race-Conditions zwischen REST-Backfill und Live-WS-Daten.
    *   `src/stores/market.test.ts`: Initialisierung von `klines` ist fehlerhaft (`undefined` statt `[]`).
*   **Empfehlung:** Tests müssen sofort an die neue Architektur angepasst werden. Die Entfernung der Schutzmechanismen im Store muss validiert werden.

### 2. Numerische Präzision (API-Grenzen)
*   **Befund:** `bitunixWs.ts` warnt explizit vor `orderId` als `number`.
*   **Risiko:** Standard `JSON.parse` (verwendet in `fetch` Responses, wenn nicht explizit `safeJson` genutzt wird) verliert Präzision bei 64-Bit Integers > `2^53` *bevor* `Decimal.js` greift.
*   **Mitigation:** `apiService.ts` nutzt teilweise `safeJsonParse`. Dies muss für **alle** Endpunkte (insb. Order-History) erzwungen werden.

## 🟡 WARNING (Warnungen)

### 1. Fehlende Internationalisierung (i18n)
*   **Befund:** Hardcodierte englische Strings in UI-Komponenten gefunden.
    *   `src/components/settings/tabs/ConnectionsTab.svelte`: `<label>API Key</label>`
    *   `src/components/settings/tabs/VisualsTab.svelte`: "Playback Speed", "Image / Video URL", "Particles".
*   **Auswirkung:** Inkonsistente UX in der deutschen Lokalisierung.

### 2. Doppelte Latenz (Performance)
*   **Befund:** `bitunixWs.ts` drosselt UI-Updates auf 200ms. `market.svelte.ts` puffert diese Updates erneut und flusht alle 250ms.
*   **Auswirkung:** Worst-Case Latenz von 450ms für Preis-Updates.
*   **Empfehlung:** Synchronisierung der Intervalle oder Entfernung des sekundären Puffers im Store.

### 3. CI/Test-Umgebung
*   **Befund:** `vitest` meldet `workerErrors.notAvailable` für `technicalsService`.
*   **Risiko:** Kritische Berechnungslogik (Indikatoren) wird in der CI nicht identisch zur Produktion getestet.

## 🔵 REFACTOR (Verbesserungspotenzial)

### 1. "Single Source of Truth" Architektur
*   Die Verantwortung für Daten-Priorisierung (REST vs WS) ist aktuell unklar verteilt (MarketWatcher vs MarketStore).
*   **Vorschlag:** Zentralisierung im `MarketWatcher`. Der Store sollte passiv bleiben.

### 2. Zod Schema Strictness
*   `StrictDecimal` (String/Number Union) ist riskant ohne garantierten `safeJsonParse` Upstream.

---

## Conclusion
Die Architektur zeigt starke "Institutional Grade" Ansätze (Decimal.js, LRU Caching, Worker Offloading), leidet jedoch unter Regressionsfehlern durch kürzliche Refactorings. Die Datenintegrität ist im Kern gesichert, aber die Verifikation (Tests) ist gebrochen.
