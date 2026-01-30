# Status- & Risiko-Bericht: Cachy-App Codebase Audit

**Datum:** 2024-05-23
**Status:** ⚠️ Eingeschränkt Stabil (Attention Required)
**Auditor:** Jules (System Architect)

## 1. Executive Summary

Die Analyse der Codebasis zeigt eine solide Architektur (Svelte 5, TypeScript Strict Mode, Decimal.js), jedoch wurden **kritische Regressionen** und **Datenintegritäts-Risiken** identifiziert, die vor einem Deployment in die Produktion behoben werden müssen. Insbesondere die Behandlung von "Optimistic Updates" bei Netzwerkfehlern und die JSON-Verarbeitung in API-Routen weisen Lücken auf.

## 2. Findings (Priorisiert)

### 🔴 CRITICAL (Gefahr von Datenverlust oder Inkonsistenz)

1.  **Race Condition in `TradeService` (Two Generals Problem)**
    *   **Problem:** Der Unit Test `should remove optimistic order on definitive API failure` schlägt fehl. Das System entfernt optimistische Orders nicht zuverlässig, wenn die API einen definitiven Fehler (z.B. 400 Bad Request) zurückgibt.
    *   **Folge:** "Geister-Orders" bleiben im UI sichtbar, obwohl sie vom Server abgelehnt wurden. Dies führt zu falschen Bestandsanzeigen und Fehlentscheidungen des Traders.
    *   **Ort:** `src/services/tradeService.ts` & `src/tests/tradeService_race.test.ts`

2.  **Unsafe JSON Parsing in API Routes**
    *   **Problem:** Mehrere API-Endpunkte nutzen das native `JSON.parse` statt des sicheren `safeJsonParse`.
    *   **Folge:** Bei großen Integer-IDs (typisch für Krypto-Exchanges) oder hochpräzisen Preisen kommt es zu Rundungsfehlern (Precision Loss), bevor die Daten überhaupt validiert werden können.
    *   **Orte:**
        - `src/routes/api/tickers/+server.ts`
        - `src/routes/api/orders/+server.ts`
        - `src/stores/favorites.svelte.ts`

3.  **Technicals Worker Crash bei unvollständigen Daten**
    *   **Problem:** Der `technicals.worker` liefert `NaN` statt `0` oder validen Werten, wenn unvollständige Kerzendaten verarbeitet werden.
    *   **Folge:** Charts und Indikatoren brechen unkontrolliert ab oder zeigen korrupte Werte an.
    *   **Ort:** `src/workers/technicals.worker.ts`

4.  **Precision Risk in UI Services**
    *   **Problem:** `uiManager.ts` und `smc/types.ts` definieren Preise teilweise als `number` statt `Decimal`.
    *   **Folge:** Potenzielle Berechnungsfehler im Frontend bei der Anzeige von PnL oder Zielpreisen.

### 🟡 WARNING (Performance, UX, Leaks)

1.  **HMR Memory Leak in `omsService`**
    *   **Problem:** Der `OrderManagementSystem` Singleton startet im Konstruktor ein `setInterval`, bietet aber keine Methode zum Stoppen.
    *   **Folge:** Bei jedem Hot-Reload (Dev) oder Re-Instanziierung vervielfachen sich die Intervalle, was die CPU-Last unnötig erhöht.
    *   **Ort:** `src/services/omsService.ts`

2.  **Fehlende Internationalisierung (i18n)**
    *   **Problem:** Über 100 Hardcoded Strings in den Einstellungs-Menüs (`ConnectionsTab`, `CalculationSettings`) gefunden.
    *   **Folge:** UI ist nicht vollständig lokalisierbar; schlechte UX für nicht-englische Nutzer.

3.  **Mögliche Event-Listener Leaks**
    *   **Problem:** Komponenten wie `MarketOverview.svelte` und interne Tools registrieren `addEventListener`, deren Bereinigung nicht in allen Pfaden garantiert ist.

### 🔵 REFACTOR (Wartbarkeit)

1.  **Redundante Validierungslogik:** `BitunixWebSocketService` implementiert einen eigenen "Fast Path" mit manueller Typ-Prüfung, während `TradeService` Zod nutzt. Dies ist performant, erhöht aber die Komplexität bei Änderungen der API-Struktur.

## 3. Empfehlung für Schritt 2 (Aktionsplan)

Es wird dringend empfohlen, zuerst die **CRITICAL** Findings zu beheben, insbesondere die JSON-Sicherheit und den Trade-Service-Fix, da diese direktes finanzielles Risiko bergen. Anschließend sollten die Unit-Tests repariert werden, bevor UX-Themen (i18n) angegangen werden.
