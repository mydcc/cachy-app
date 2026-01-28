# Action Plan Phase 2: Implementation & Hardening

**Basis:** `ANALYSIS_REPORT_HARDENING_V2.md`
**Ziel:** Stabilisierung der "Critical" und "Warning" Findings.

## 1. 🔴 Gruppe A: Critical Core Hardening (Data & Resources)
*Fokus: Verhinderung von Abstürzen und Rechenfehlern.*

### A.1 OMS Memory Protection (Priority: High)
*   **Target:** `src/services/omsService.ts`
*   **Task:** Entfernen des "Bypass"-Kommentars/Logik. Implementierung einer strikten FIFO-Logik auch für Finalized Orders. Wenn Limit erreicht:
    1.  Versuche `pruneOrders()` (lösche alte Finalized).
    2.  Wenn immer noch voll: Lösche älteste Order (Notfall-Prune) BEVOR neue eingefügt wird.
*   **Verification (Unit Test):**
    *   `src/services/omsService.test.ts` (neu erstellen oder erweitern):
    *   *Test Case:* `shouldEnforceMaxOrdersLimitUnderFlood`: Fülle OMS mit 1000 Orders. Füge 100 weitere "filled" Orders hinzu. Assert `size <= 1000`.

### A.2 Safe Calculation Service (Priority: High)
*   **Target:** `src/services/calculatorService.ts`
*   **Task:**
    *   Ersetzen von `any` durch Interfaces (`TradeTarget`, `TradeValues`).
    *   Einfügen von Runtime-Checks: `if (!Decimal.isDecimal(tp.price)) ...`
*   **Verification:**
    *   *Test Case:* Übergebe invaliden Input (null, undefined, string statt Decimal). Assert: Service wirft kontrollierten Fehler oder nutzt Fallback, stürzt nicht ab.

## 2. 🟡 Gruppe B: Stability & Reliability
*Fokus: Korrekte Fehlerbehandlung und Resource Cleanup.*

### B.1 MarketWatcher Timer Cleanup
*   **Target:** `src/services/marketWatcher.ts`
*   **Task:** Identifiziere den `setTimeout` im `finally`-Block von `pollSymbolChannel`.
    *   Refactoring: Nutze einen Wrapper, der den Timer in `staggerTimeouts` registriert, damit `stopPolling()` ihn zuverlässig killen kann.

### B.2 Transparent API Errors
*   **Target:** `src/routes/api/orders/+server.ts`
*   **Task:** Entfernen des `return []` bei Fehlern in `fetchBitgetHistoryOrders`.
    *   Stattdessen: `throw` (gefangen vom globalen Handler) oder Return eines Error-Objects, das vom Frontend erkannt wird.

## 3. 🟡 Gruppe C: UX & i18n Standardization
*Fokus: Professionalisierung der UI.*

### C.1 Hardcoded Strings Extraction
*   **Target:**
    *   `src/components/settings/CalculationSettings.svelte`
    *   `src/components/shared/PerformanceMonitor.svelte`
    *   `src/components/settings/ApiQuotaStatus.svelte`
    *   `src/components/inputs/GeneralInputs.svelte`
*   **Task:**
    1.  Erstellen neuer Keys in `src/locales/locales/en.json` (Namespace: `settings.performance`, `quota`, etc.).
    2.  Ersetzen der Strings durch `{$_('key')}`.
    3.  Löschen der deutschen Hardcoded-Strings in `ApiQuotaStatus.svelte` (ersetzen durch i18n).

## Ausführungs-Reihenfolge
1.  **Gruppe A** (Critical) - Zuerst, um Systemstabilität zu sichern.
2.  **Gruppe B** (Stability) - Um Race Conditions zu beheben.
3.  **Gruppe C** (UX) - Kann parallel oder anschließend erfolgen.

## Verification Strategy
Nach jedem Fix:
1.  Build Check (`npm run check` / `svelte-check`).
2.  Linter Check (auf Syntax-Fehler).
3.  Manueller Test der betroffenen Komponente (via `read_file` Verification oder Frontend Script).
