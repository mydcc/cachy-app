# Systematische Code-Analyse & Hardening Report (Status Quo)

**Datum:** 2026-05-21
**Rolle:** Senior Lead Developer & Systems Architect
**Scope:** `src/services`, `src/components`, `src/routes/api`

## 1. Executive Summary
Die Codebasis zeigt solide Ansätze in Architektur (Service-Pattern) und Sicherheit (Zod-Validierung, Secret-Redaction). Jedoch bestehen **kritische Risiken** im Ressourcen-Management des Order Management Systems (OMS) und in der Typsicherheit finanzieller Berechnungen. Zudem ist die User Experience durch fehlende Übersetzungen und "Silent Failures" bei API-Fehlern beeinträchtigt.

## 2. 🔴 CRITICAL (Sofortiger Handlungsbedarf)

### 2.1 OMS Memory Leak Risk (Resource Management)
*   **Ort:** `src/services/omsService.ts`
*   **Problem:** Die Logik enthält einen expliziten Bypass des `MAX_ORDERS` Limits (1000) für "finalized orders" (`isFinalized`).
    ```typescript
    // CRITICAL FIX: Allow finalized orders to bypass limit temporarily...
    ```
*   **Risiko:** Bei einem Hochfrequenz-Szenario oder einem API-Reconnect-Flood können tausende "filled/cancelled" Orders den Speicher fluten, bevor der `pruneOrders()` Zyklus greift. Dies kann zum Browser-Crash führen.
*   **Empfehlung:** Strict Limit Enforcement. Finalized Orders sollten *sofort* ältere Einträge verdrängen oder gar nicht erst gespeichert werden, wenn das Limit erreicht ist, anstatt das Limit temporär zu verletzen.

### 2.2 Typsicherheit in Finanz-Kalkulationen (Data Integrity)
*   **Ort:** `src/services/calculatorService.ts`
*   **Problem:** Verwendung von `any` Typen in kritischen Berechnungsschleifen.
    ```typescript
    values.targets.forEach((tp: any, index: number) => { ... })
    ```
*   **Risiko:** Laufzeitfehler, wenn `tp.price` oder `tp.percent` nicht existieren oder keine `Decimal` Instanzen sind. Dies führt zu NaN-Werten oder Abstürzen während der Trade-Planung.
*   **Empfehlung:** Strikte Typisierung mit Interfaces (`TradeTarget`) und Runtime-Checks (`instanceof Decimal`).

## 3. 🟡 WARNING (Priorität vor nächstem Release)

### 3.1 Hardcoded Strings & Mixed Languages (UI/UX)
*   **Ort:** `CalculationSettings.svelte`, `PerformanceMonitor.svelte`, `ApiQuotaStatus.svelte`.
*   **Problem:** Viele UI-Elemente enthalten harten Text (teils Englisch, teils Deutsch gemischt), der nicht durch das i18n-System (`$_`) läuft.
    *   Beispiele: "Performance Profiles", "Calls insgesamt".
*   **Risiko:** Inkonsistente UX, fehlende Professionalität, Barrieren für internationale Nutzer.
*   **Empfehlung:** Extraktion aller Strings in `en.json` und Nutzung von `$_()`.

### 3.2 Silent API Failures (Data Integrity/UX)
*   **Ort:** `src/routes/api/orders/+server.ts` -> `fetchBitgetHistoryOrders`
*   **Problem:** Bei API-Fehlern (außer Auth) wird ein leeres Array zurückgegeben.
    ```typescript
    if (!response.ok) return []; // Fail gracefully
    ```
*   **Risiko:** Der Nutzer sieht "Keine Orders gefunden", obwohl die API down ist. Dies ist irreführend und verhindert Fehlersuche.
*   **Empfehlung:** Fehler explizit werfen und im Frontend als Warnung anzeigen ("Konnte Historie nicht laden").

### 3.3 Untracked Timers (Resource Management)
*   **Ort:** `src/services/marketWatcher.ts`
*   **Problem:** Ein `setTimeout` im `finally`-Block von `pollSymbolChannel` wird nicht in `staggerTimeouts` getrackt.
*   **Risiko:** Wenn das Polling gestoppt wird, feuert dieser Timer trotzdem und versucht, `fetchLocks` zu manipulieren. Dies ist eine Race Condition.

## 4. 🔵 REFACTOR (Technische Schuld)

### 4.1 Loose Service Typing
*   **Ort:** `bitunixWs.ts`, `bitgetWs.ts`, `newsService.ts`
*   **Problem:** Extensive Nutzung von `: any`.
*   **Empfehlung:** Definition von Zod-Schemas für alle externen Datenquellen.

### 4.2 Inconsistent API Error Codes
*   **Ort:** `tradeService.ts`
*   **Problem:** Fehlercodes sind mal `number`, mal `string`.
*   **Empfehlung:** Standardisierung auf `string` Konstanten (`ERR_CODE_...`).

## 5. Security Note (Positiv)
*   **API Logs:** Vorbildliche Redaction von Secrets (`apiKey`, `passphrase`) in `src/routes/api/orders/+server.ts`.
*   **XSS:** Keine unsichere `{@html}` Nutzung mit User-Input gefunden.
