# Status & Risk Report: cachy-app Hardening

## 1. Executive Summary
Die Codebasis zeigt eine solide Grundstruktur mit bewussten Entscheidungen für Performance (WASM, WebGPU Ansätze) und Sicherheit (Zod, Decimal.js). Dennoch wurden kritische Schwachstellen in der Datenintegrität (`tradeService`), Ressourcenverwaltung (`bitunixWs`) und API-Sicherheit gefunden, die sofortiges Handeln erfordern. UI/UX ist funktional, aber lückenhaft in der Internationalisierung.

## 2. Findings (Prioritized)

### 🔴 CRITICAL (Immediate Action Required)

1.  **Trade Execution Risk (`src/services/tradeService.ts`)**
    *   **Problem:** Die Methode `flashClosePosition` liest `position.amount` aus dem lokalen Cache (`omsService`), validiert die Frische nur über einen Zeitstempel, und sendet dann eine Order.
    *   **Risk:** Wenn der Cache durch einen WebSocket-Disconnect oder Race Condition asynchron wird (Desync), wird eine Order mit falscher Menge gesendet. Dies kann zu "Flipping" führen (Long schließen -> Short öffnen statt flat).
    *   **Recommendation:** Vor `flashClosePosition` *zwingend* einen `await fetchPosition(symbol)` Call absetzen oder eine "Safe Close" Strategie implementieren, die `reduceOnly: true` mit `retry` Mechanismen kombiniert.

2.  **Memory Leak in WebSocket Client (`src/services/bitunixWs.ts`)**
    *   **Problem:** Die `syntheticSubs` Map wird in `subscribe()` befüllt (via `@ts-ignore`), aber in `unsubscribe()` *niemals* bereinigt.
    *   **Risk:** Bei jedem Chart-Wechsel oder Timeframe-Wechsel wächst der Speicherbedarf linear an. Langzeit-Sessions (Pro-Trader) führen zum Browser-Crash (OOM).
    *   **Recommendation:** `syntheticSubs` Typisierung fixen und Cleanup-Logik in `unsubscribe()` implementieren.

3.  **Precision Loss Risk (`src/services/mappers.ts` & `api/account`)**
    *   **Problem:** `orderId`s werden in `mappers.ts` geprüft, *nachdem* sie bereits durch `JSON.parse` gelaufen sind. Bei 19-stelligen IDs (Bitunix/Bitget Standard) droht Rundungsfehler im JavaScript `number` Typ.
    *   **Risk:** Order-IDs werden korrupt, Cancel-Requests schlagen fehl ("Order not found").
    *   **Recommendation:** Globalen Custom JSON Parser (oder `json-bigint`) in `apiService` und allen API-Routen integrieren, der große Zahlen als Strings liest.

### 🟡 WARNING (High Priority Fixes)

4.  **Inconsistent Validation (`src/routes/api/account/+server.ts`)**
    *   **Problem:** Der Account-Endpunkt nutzt manuelle `if (!body || ...)` Checks statt Zod Schemas.
    *   **Risk:** Fragil gegenüber API-Änderungen, schwer zu warten, inkonsistente Fehlermeldungen.
    *   **Recommendation:** `AccountRequestSchema` (Zod) einführen und anwenden.

5.  **Broken Subscription State (`src/services/bitgetWs.ts`)**
    *   **Problem:** Nutzt ein einfaches `Set` für Subscriptions. Wenn zwei Komponenten (z.B. Chart & Ticker-Widget) denselben Channel abonnieren und eine Komponente unmountet, wird der Channel für *beide* geschlossen.
    *   **Risk:** Datenverlust in der UI ohne Fehlermeldung.
    *   **Recommendation:** Reference Counting (wie in `bitunixWs` gefixt) implementieren.

6.  **Missing i18n (`src/components/settings/`)**
    *   **Problem:** Zahlreiche Hardcoded Strings in `IndicatorSettings.svelte`, `VisualsTab.svelte`, `ConnectionsTab.svelte`.
    *   **Risk:** Unprofessioneller Eindruck bei nicht-englischen Nutzern.
    *   **Recommendation:** Alle Strings in `en.json` extrahieren und `$t()` nutzen.

7.  **Unsafe Type Casts (`src/services/marketWatcher.ts`)**
    *   **Problem:** `fillGaps` verlässt sich darauf, dass `klines` bereits `Decimal` sind. Runtime-Check existiert, aber Fallback ist unklar definiert.
    *   **Recommendation:** Explizite Typ-Guards oder Zod-Transformation im `apiService` erzwingen, bevor Daten an `marketWatcher` gehen.

### 🔵 REFACTOR (Technical Debt)

8.  **Inconsistent JSON Parsing (`src/routes/api/tpsl/+server.ts`)**
    *   **Problem:** Nutzt `request.json()` direkt statt `safeJsonParse`.
    *   **Recommendation:** Auf `safeJsonParse` umstellen für einheitliches Error-Handling.

9.  **DOM Manipulation Audit**
    *   **Status:** `innerHTML` wird genutzt, aber via `DOMPurify` (in `tooltip.ts`) und `renderSafeMarkdown` abgesichert.
    *   **Recommendation:** Beibehalten und in CI/CD als Check verankern.

## 3. Next Steps (Action Plan Phase 2)

Der Aktionsplan für Schritt 2 wird diese Findings in drei Arbeitspakete clustern:
1.  **Core Stability & Safety** (Fixes 1, 2, 3)
2.  **API Hardening** (Fixes 4, 5, 8)
3.  **UI Polish** (Fixes 6)
