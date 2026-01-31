# Aktionsplan: Cachy-App Hardening (Phase 2)

Basierend auf der Analyse (`ANALYSIS_REPORT_HARDENING_V3.md`) werden folgende Maßnahmen priorisiert umgesetzt.

## Zielsetzung
Erreichen des "Institutional Grade" Status durch Beseitigung von technischen Schulden (i18n) und Härtung der Datenverarbeitung.

## Priorisierte Tasks

### 1. I18n & UX Hardening (High Priority)
*   [ ] **Task 1.1: I18n Extraction TradingTab**
    *   **Ziel:** Entfernung aller hardcodierten Strings in `src/components/settings/tabs/TradingTab.svelte`.
    *   **Datei:** `src/locales/locales/{en,de}.json` erweitern.
    *   **Verifikation:** Visuelle Prüfung (kein englischer Text im deutschen Modus).
*   [ ] **Task 1.2: I18n Extraction System & Connections**
    *   **Ziel:** Bereinigung von `SystemTab.svelte` und `ConnectionsTab.svelte`.

### 2. Resilience & Data Safety (High Priority)
*   [ ] **Task 2.1: Safe LocalStorage Parsing**
    *   **Datei:** `src/components/shared/ChartPatternsView.svelte`, `src/components/shared/CandlestickPatternsView.svelte`.
    *   **Fix:** Ersetzen von `JSON.parse` durch `safeJsonParse` oder `try-catch` Block mit Fallback auf leeres Set.
    *   **Test:** Manuelles Setzen von ungültigem JSON im LocalStorage und Neuladen der Seite.

*   [ ] **Task 2.2: Bitget Kline Validation**
    *   **Datei:** `src/services/apiService.ts`.
    *   **Fix:** Definition von `BitgetKlineSchema` (Zod) in `src/types/apiSchemas.ts`.
    *   **Integration:** Nutzung von `safeParse` in `fetchBitgetKlines`.

### 3. Type Safety & Refactoring (Medium Priority)
*   [ ] **Task 3.1: Strict Typing in TradeService**
    *   **Datei:** `src/services/tradeService.ts`.
    *   **Fix:** Entfernen von `as any` Casts in `flashClosePosition`. Nutzung von `OMSOrderSide` Typen.

## Verifikations-Strategie
1.  **Pre-Commit:** `npm run check` (TypeScript strikt).
2.  **Runtime:** Starten der App (`npm run dev`) und Navigieren zu den betroffenen Settings-Tabs.
3.  **Simulation:** Testen des "Broken LocalStorage" Szenarios.

## Zeitplan
*   **Tag 1:** I18n (Tasks 1.1, 1.2) & LocalStorage Fix (Task 2.1).
*   **Tag 2:** API Schemas & Types (Tasks 2.2, 3.1).
