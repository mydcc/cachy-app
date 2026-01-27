# Status & Risiko-Bericht: Cachy Trading Plattform Hardening

**Datum:** 2026-05-21
**Rolle:** Senior Lead Developer & Systems Architect
**Status:** Initial Analysis Complete

## 1. Executive Summary

Die Codebasis befindet sich auf einem modernen technologischen Stand (Svelte 5, TypeScript Strict Mode). Kritische finanzielle Berechnungen werden überwiegend korrekt mit `Decimal.js` durchgeführt. Die Architektur für Error Handling und i18n ist solide.

Es wurden jedoch **2 KRITISCHE Risiken** identifiziert, die unter Hochlast oder bei API-Problemen zu Dateninkonsistenzen (UI vs. Exchange) führen können. Zudem gibt es Engpässe im Ressourcenmanagement, die die Skalierbarkeit des Dashboards begrenzen.

---

## 2. Priorisierte Findings

### 🔴 CRITICAL (Sofortiger Handlungsbedarf)

1.  **OMS Order Limit & UI Desync Risk (`src/services/omsService.ts`)**
    *   **Problem:** Das System erzwingt ein Limit von 500 Orders. Wenn dieses Limit erreicht ist (z.B. durch viele Pending Orders oder nicht bereinigte alte Orders), blockiert die Logik (`if (size >= MAX) return;`) *jegliche* Updates für *neue* Orders, selbst wenn diese nur den Status existierender Orders aktualisieren wollen.
    *   **Risiko:** Ein "Fill"-Event der Börse wird verworfen. Die Order bleibt in der UI auf "Pending", obwohl sie gefüllt ist. Der User handelt auf Basis falscher Daten (Phantom-Positionen).
    *   **Fix:** `updateOrder` muss Updates für *existierende* IDs immer zulassen. Das Limit darf nur für *neue* IDs gelten. Zudem muss eine intelligentere Eviction-Strategie her (Drop Finalized first).

2.  **Fragile API Fallback Logic (`src/services/tradeService.ts`)**
    *   **Problem:** Die Methode `fetchOpenPositionsFromApi` nutzt ein manuelles, unsicheres Mapping: `p.qty || p.size || p.amount`. Es gibt keine Schema-Validierung für die API-Antwort des Fallbacks.
    *   **Risiko:** Wenn die Börse das API-Format ändert, schlägt der Fallback fehl oder, schlimmer, liest `0` als Menge. Dies führt dazu, dass `flashClosePosition` fehlschlägt.
    *   **Fix:** Zentraler Response-Mapper mit Zod-Validierung für alle API-Antworten.

### 🟡 WARNING (Stabilität & Performance)

3.  **MarketWatcher Polling Bottleneck (`src/services/marketWatcher.ts`)**
    *   **Problem:** `maxConcurrentPolls` ist auf 12 limitiert. Bei einem Dashboard mit >12 Widgets (z.B. Watchlist + Charts + Orderbuch) werden Updates massiv verzögert.
    *   **Problem:** Locks werden im `finally`-Block mit einem `setTimeout` von 10 Sekunden (!) verzögert freigegeben. Das macht schnelle Symbolwechsel extrem träge.
    *   **Fix:** Erhöhung des Limits (adaptiv) und Entfernung des künstlichen Delays im Lock-Release.

4.  **Memory Leak Risiko in `marketState.subscribe` (`src/stores/market.svelte.ts`)**
    *   **Problem:** Die Methode erstellt einen `$effect.root`, gibt den Cleanup-Handle zurück, erzwingt dessen Nutzung aber nicht. Entwickler könnten vergessen, `unsubscribe` zu rufen.
    *   **Fix:** Markierung als `@deprecated` oder Wrapper-Funktion, die Lifecycle-Management erzwingt (z.B. Svelte Action oder Context).

5.  **Unreliable Maintenance Tools (`scripts/detect_leaks.cjs`)**
    *   **Problem:** Das Skript findet nur einen Bruchteil der Timer. Es vermittelt ein falsches Sicherheitsgefühl.
    *   **Fix:** Skript verbessern (AST-Parsing statt Regex) oder entfernen.

6.  **Hardcoded Strings in UI Components**
    *   **Problem:** Vereinzelte Tooltips (z.B. "Refresh Stats" in `MarketOverview`) sind nicht übersetzt.
    *   **Fix:** Audit und Ersetzung durch `$_` Keys.

### 🔵 REFACTOR (Technische Schuld)

7.  **Inkonsistente Math Libraries**
    *   **Problem:** `JSIndicators` nutzt native `number` (Performance), `TradeService` nutzt `Decimal.js` (Präzision).
    *   **Empfehlung:** Akzeptabel, solange Indikatoren rein visuell sind. Kritische Signale (z.B. für Auto-Trading) sollten auf `Decimal` umgestellt werden.

8.  **`any` Types in API Payloads**
    *   **Problem:** `tradeService.signedRequest` akzeptiert `payload: any`.
    *   **Empfehlung:** Strikte Interfaces für alle Requests einführen.

---

## 3. Empfohlener Aktionsplan (Phase 2)

Ich schlage vor, die Phase 2 in folgende Schritte zu unterteilen:

1.  **Critical Hardening (Priorität 1):**
    *   Fix `omsService` Order Limit Logic (Test-Driven).
    *   Fix `tradeService` Fallback Mapping & Validation.
2.  **Resource Optimization (Priorität 2):**
    *   Refactor `marketWatcher` (Poll Limits & Lock Release).
3.  **UI/UX Polish (Priorität 3):**
    *   i18n Lücken schließen.
    *   Tooling fixen (`detect_leaks`).

Warten auf Freigabe zur Umsetzung.
