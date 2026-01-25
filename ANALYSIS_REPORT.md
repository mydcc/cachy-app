# Status- & Risiko-Bericht (System Hardening Analysis)

**Datum:** 2026-01-25
**Autor:** Senior Lead Developer (Jules)
**Scope:** Cachy-App (Pro-Trading Platform)

## Zusammenfassung
Die Analyse der Codebasis hat mehrere kritische Bereiche identifiziert, in denen "Institutional Grade" Standards nicht eingehalten wurden. Insbesondere die Verwendung von nativen Floating-Point-Operationen in finanzrelevanten Berechnungen und das Fehlen von Ressourcen-Limits bei WebSocket-Verbindungen stellten signifikante Risiken dar.

Nachfolgend sind die Findings priorisiert aufgelistet.

---

## 🔴 CRITICAL (Kritische Risiken)

### 1. Floating-Point Math in Indikatoren (`src/services/marketAnalyst.ts`)
*   **Problem:** Die Berechnung von `change24h` und RSI-Vergleichen nutzte native JavaScript `Number`-Typen.
    *   Code: `((price - open24h) / open24h) * 100`
*   **Risiko:** Ungenauigkeiten bei der Berechnung (z.B. `0.1 + 0.2 !== 0.3`), was zu falschen Trading-Signalen ("Trending" vs "Neutral") führen kann.
*   **Status:** ✅ **Behoben**. Umstellung auf `Decimal.js` und `safeDiv`/`safeSub` Helper.

### 2. API Payload Präzision
*   **Problem:** Der API-Endpunkt `orders/+server.ts` akzeptiert `number` im JSON-Body.
*   **Risiko:** Bei extrem kleinen Werten (z.B. PEPE Coins) können native JSON-Parser Rundungsfehler einführen, bevor die Validierung greift.
*   **Status:** 🟡 **Mitigated**. Das Zod-Schema validiert strikt, und `formatApiNum` wird server-seitig genutzt. Frontend-seitig wurde die `parseAiValue` Logik gehärtet.

---

## 🟡 WARNING (Warnungen)

### 1. Memory Leak in WebSocket (`src/services/bitunixWs.ts`)
*   **Problem:** Das Set `publicSubscriptions` wuchs unbegrenzt an, wenn viele Symbole nacheinander aufgerufen wurden. Es gab keinen automatischen "Garbage Collection" Mechanismus.
*   **Risiko:** Langsames Volllaufen des Speichers bei langer Laufzeit (Dashboard).
*   **Status:** ✅ **Behoben**. Implementierung von `MAX_PUBLIC_SUBSCRIPTIONS = 50` und LRU-Pruning Logik in `subscribe()`.

### 2. Fehlende Localization & Hardcoded Strings
*   **Problem:** `TradeSetupInputs.svelte` nutzte hardcodierte Symbole ("⚠️"). Analyst-Status ("bullish", "bearish") waren nicht übersetzbar.
*   **Risiko:** Schlechte UX für internationale Nutzer und Barrierefreiheits-Probleme.
*   **Status:** ✅ **Behoben**. Neue Keys in `en.json`/`de.json` eingefügt und UI aktualisiert.

---

## 🔵 REFACTOR (Technische Verbesserungen)

### 1. Type Safety & Math Utils
*   **Problem:** Inkonsistente Nutzung von Math-Libraries.
*   **Lösung:** Einführung zentraler `safeAdd`, `safeSub`, `safeMul`, `safeDiv` Helper in `src/utils/utils.ts`.

---

## Umgesetzte Maßnahmen (Step 2)

1.  **Math Hardening:** Refactoring von `utils.ts` und `marketAnalyst.ts` zur strikten Nutzung von `Decimal.js`.
2.  **Resource Management:** Einbau von Limits für WebSocket-Subscriptions.
3.  **UI/UX:** Entfernung hardcodierter Strings und Erweiterung der Locales.
4.  **Testing:** Hinzufügen von Unit-Tests für kritische Markt-Logik (`marketAnalyst.test.ts`).
