# Status- & Risiko-Bericht (Institutional Grade Audit)

**Datum:** 2024-05-24
**Auditor:** Jules (AI Senior Systems Architect)
**Status:** DRAFT

## 1. Executive Summary

Die Codebasis zeigt ein solides Fundament mit fortgeschrittenen Architektur-Mustern (Reactive Stores, Services, Decimal-Präzision). Besonders positiv hervorzuheben ist die konsequente Nutzung von `Decimal.js` für finanzielle Berechnungen und die robuste Zod-Validierung in neueren Modulen (`newsService`).

Dennoch wurden **kritische Risiken** im Bereich Resource Management identifiziert, die unter Hochlast zu Memory Leaks führen können. Insbesondere das Queueing-System für API-Requests ist unbegrenzt, was bei Netzwerkproblemen zum Absturz führen kann. Zudem existieren Inkonsistenzen im Error-Handling, die das Debugging im Fehlerfall erschweren ("Silent Failures").

---

## 2. Detailed Findings

### 🔴 CRITICAL (Gefahr von Absturz oder Datenverlust)

1.  **Unbegrenzte API Request Queues (`src/services/apiService.ts`)**
    -   **Problem:** Der `RequestManager` verwendet `highPriorityQueue` und `normalQueue` als einfache Arrays ohne Längenbegrenzung.
    -   **Risiko:** Wenn die API langsam antwortet oder offline ist, aber die UI (oder Polling-Intervalle) weiter Requests feuert, wachsen diese Arrays unendlich an, bis der Browser-Tab abstürzt (OOM).
    -   **Fundstelle:** `src/services/apiService.ts:223` (`this.highPriorityQueue.push(run)`)

2.  **Silent Error Suppression bei Bitget History (`src/routes/api/orders/+server.ts`)**
    -   **Problem:** In `fetchBitgetHistoryOrders` wird bei einem HTTP-Fehler (`!response.ok`) oder API-Fehlercode einfach ein leeres Array `[]` zurückgegeben.
    -   **Risiko:** Der User sieht "Keine Orders gefunden" statt "Verbindungsfehler". Dies führt zu massivem Vertrauensverlust und Fehlinterpretationen ("Habe ich meine Positionen verloren?").
    -   **Fundstelle:** `src/routes/api/orders/+server.ts:360` (`if (!response.ok) return [];`)

### 🟡 WARNING (UX, Performance, Soft Limits)

1.  **Soft Limit in OMS (`src/services/omsService.ts`)**
    -   **Problem:** `MAX_ORDERS` (500) wird nur durch Pruning von *finalisierten* Orders durchgesetzt. Wenn ein Algorithmus oder User >500 *aktive* Orders erstellt, wächst die Map unbegrenzt weiter (nur mit Warn-Log).
    -   **Risiko:** Theoretisches Memory Leak bei extremem algorithmischen Handel.

2.  **Hardcoded Strings in UI (`src/components/shared/OrderHistoryList.svelte`)**
    -   **Problem:** Texte wie "Fee:", "Limit", "Market", "Buy/Sell" sind fest im Code verdrahtet.
    -   **Risiko:** Fehlende Lokalisierung verhindert internationale Skalierung.

3.  **Lokale Array-Kopien in Technicals (`src/services/activeTechnicalsManager.svelte.ts`)**
    -   **Problem:** `history.push(newCandle)` manipuliert eine lokale Kopie des Arrays.
    -   **Risiko:** Das ist technisch kein Leak, aber verwirrend. Es suggeriert eine Zustandsänderung, die aber nur für den aktuellen Berechnungszyklus gilt. Das kann bei Refactorings leicht zu echten Bugs führen.

### 🔵 REFACTOR (Wartbarkeit & Code Quality)

1.  **Typ-Unsicherheit in TradeService (`src/services/tradeService.ts`)**
    -   **Problem:** `signedRequest` gibt `Promise<any>` zurück.
    -   **Empfehlung:** Generics einführen (`signedRequest<T>(...)`) und Zod-Validierung der Response direkt im Service integrieren.

2.  **Veraltetes Date Formatting**
    -   **Problem:** `formatDate` nutzt manuelles String-Building (`DD.MM HH:mm`).
    -   **Empfehlung:** Nutzung von `Intl.DateTimeFormat` oder einer i18n-Library für konsistente Lokalisierung.

---

## 3. Aktionsplan (Empfehlung)

### Phase A: Hardening (Priorität: Sofort)
1.  **Fix API Queue Leak:** Implementierung eines `MAX_QUEUE_SIZE` (z.B. 100) im `RequestManager`. Bei Überlauf müssen älteste Requests verworfen werden (Reject mit "Queue Full").
2.  **Fix Silent Errors:** `fetchBitgetHistoryOrders` muss Fehler werfen (`throw Error`), damit das Frontend diese anzeigen kann.

### Phase B: Stability (Priorität: Hoch)
1.  **OMS Hard Limit:** Einführung eines strikten Limits auch für aktive Orders (oder zumindest Strategie zum Umgang damit, z.B. Stop-New-Orders).
2.  **i18n Cleanup:** Extraktion der Hardcoded Strings in `OrderHistoryList` in die Locale-Dateien.

### Phase C: Refactoring (Priorität: Mittel)
1.  **Typed Responses:** Überarbeitung von `TradeService` für strikte Typisierung.

---
**Freigabe erbeten für Start Phase A.**
