# Status- & Risk-Bericht: Hardening & Maintenance (Phase 1)

**Datum:** 26.02.2026
**Autor:** Jules (System Architect)
**Version:** V4
**Status:** COMPLETE

## Executive Summary
Die Codebasis von `cachy-app` befindet sich in einem **überdurchschnittlich robusten Zustand**. Kritische Bereiche wie Finanzmathematik (Decimal-Präzision) und Ressourcenmanagement (WebSocket-Lifecycle, Memory-Capping) sind durch "Defense in Depth"-Muster bereits stark abgesichert.

Es wurden **keine kritischen Sicherheitslücken oder Datenintegritätsrisiken** gefunden, die einen sofortigen Hotfix erfordern. Der primäre Handlungsbedarf liegt in der technischen Schuld (I18n) und der weiteren Härtung von Edge-Cases.

---

## Findings

### 🔴 CRITICAL (Sofortiger Handlungsbedarf)
*Keine kritischen Fehler gefunden.*

> **Anmerkung:** Die Architektur verhindert systematisch die häufigsten Fehlerquellen (Float-Precision, Memory Leaks, Race Conditions).

### 🟡 WARNING (Potenzielle Risiken & UX-Mängel)

1.  **Fehlende Internationalisierung (I18n)**
    *   **Ort:** Diverse UI-Komponenten (z.B. `VisualsTab.svelte`, `TechnicalsPanel.svelte`).
    *   **Befund:** Hardcoded Strings wie `<span>Opacity</span>`, `>Bullish</span>`, `<label>Effect</label>` gefunden.
    *   **Risiko:** Schlechte UX für nicht-englische Nutzer; inkonsistente Terminologie.

2.  **"Best Effort" Fallback bei Positions-Daten**
    *   **Ort:** `src/services/tradeService.ts` (`fetchOpenPositionsFromApi`).
    *   **Befund:** Wenn die Zod-Validierung für die Liste fehlschlägt, wird über jedes Item iteriert. Ungültige Items werden geloggt und verworfen (`logger.warn`).
    *   **Risiko:** Ein Nutzer könnte eine offene Position im UI "verlieren" (nicht sehen), wenn die API unerwartete Felder sendet, obwohl die Position an der Börse existiert.

3.  **Test-Umgebung Inkonsistenzen**
    *   **Ort:** `npm test` Output.
    *   **Befund:** `ECONNREFUSED` (Port 3000) und `workerErrors.notAvailable` in den Logs.
    *   **Risiko:** Rauschen in den Test-Logs kann echte Fehler verschleiern. CI/CD könnte fälschlicherweise fehlschlagen.

4.  **WebSocket Error-Loop Limitierung**
    *   **Ort:** `src/services/bitunixWs.ts` (`handleInternalError`).
    *   **Befund:** Nach 10 Fehlern wird die Verbindung dauerhaft getrennt (`marketState.connectionStatus = "disconnected"`).
    *   **Risiko:** Bei längeren Netzwerkausfällen (z.B. ISP-Störung > 5 Min) muss der Nutzer die Seite neu laden, um die Verbindung wiederherzustellen. Ein automatischer Retry mit exponentieller Backoff-Strategie (unendlich lang, aber sehr langsam) wäre robuster.

### 🔵 REFACTOR (Technische Schuld & Optimierung)

1.  **Array-Kopien im Hot Path**
    *   **Ort:** `src/stores/market.svelte.ts` (`updateSymbolKlines`).
    *   **Befund:** Bei jedem WebSocket-Update (auch bei Live-Candle Updates) wird `history = history.slice(...)` und `[...history]` ausgeführt.
    *   **Impact:** Bei sehr vielen Symbolen (>50) und hoher Frequenz könnte dies den Main-Thread belasten.
    *   **Empfehlung:** Ring-Buffer Struktur oder Mutation der bestehenden Arrays für das *letzte* Element (Live Candle) anstatt Copy-on-Write, sofern Svelte 5 Proxies dies atomar erlauben.

2.  **Duplizierte API-Schema Dateien**
    *   **Ort:** `src/types/apiSchemas.ts` vs. potenzielle Reste in `src/services/`.
    *   **Befund:** Struktur ist sauber, aber `BitunixKlineResponseSchema` ist nur ein Array-Typ, während Ticker ein Objekt mit `data` ist.
    *   **Empfehlung:** Vereinheitlichung der Response-Wrapper-Typen.

---

## Detaillierte Analyse-Ergebnisse

### 1. Datenintegrität & Typ-Sicherheit
*   **Status:** ✅ EXZELLENT
*   **Details:**
    *   Konsequente Nutzung von `Decimal.js` für Preise/Mengen.
    *   `StrictDecimal` Zod-Schema validiert API-Inputs strikt.
    *   `mappers.ts` warnt proaktiv vor `MAX_SAFE_INTEGER` Überläufen bei Order-IDs.
    *   Payload-Serialisierung in `tradeService.ts` verhindert Precision-Loss beim Senden an API.

### 2. Resource Management
*   **Status:** ✅ SEHR GUT
*   **Details:**
    *   **WebSocket:** Singleton-Pattern verhindert Zombie-Connections. Sauberes Cleanup (`destroy`).
    *   **Memory:** LRU-Cache im `marketStore` und `chartHistoryLimit` verhindern unbegrenztes Speicher-Wachstum.
    *   **CPU:** `technicalsCalculator.ts` nutzt optimierte `number[]` Arrays statt Objekte im Loop. `marketStore` nutzt Throttling (250ms) für UI-Updates.

### 3. UI/UX & Sicherheit
*   **Status:** ⚠️ GUT (mit I18n Mängeln)
*   **Details:**
    *   **Security:** RateLimiter (Token Bucket) schützt vor API-Bans. Logs werden sanitisiert (keine API-Keys im Klartext).
    *   **UX:** `TradeSetupInputs` warnt proaktiv bei Preisabweichung (>5%). Eingabe-Parsing ist tolerant (Komma/Punkt).
    *   **I18n:** Viele Texte sind noch hardcoded (Englisch).

---

## Empfohlener Aktionsplan (Phase 2)

1.  **I18n-Sweep:** Extrahieren aller Hardcoded-Strings in `src/locales/en.json` und `de.json`.
2.  **Test-Fixes:** Mocking des Servers für Integration-Tests, um `ECONNREFUSED` zu eliminieren.
3.  **WS-Hardening:** Implementierung eines "Infinite Exponential Backoff" für den WebSocket Reconnect, statt hartem Abbruch nach 10 Versuchen.
