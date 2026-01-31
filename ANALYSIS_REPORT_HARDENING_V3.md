# Status- & Risiko-Bericht: Cachy-App Hardening

**Datum:** 2025-05-23
**Status:** Initial Analysis Complete
**Grade:** B+ (Strong Core, weak UI/i18n)

## 1. Executive Summary
Die Codebasis weist eine **überdurchschnittlich hohe Qualität** im Bereich Datenintegrität und Ressourcenmanagement auf. Kritische Finanz-Best-Practices (Decimal.js, Safe JSON Parsing, Rate Limiting) sind bereits tief im System verankert. Die größten Schwachstellen liegen im Bereich **Internationalisierung (i18n)** und kleineren **Resilienz-Lücken** in der UI-Logik.

Es wurden **keine kritischen Sicherheitslücken** (XSS/Injection) gefunden. Die Architektur ist defensiv ("Institutional Grade").

## 2. Findings

### 🔴 CRITICAL (0 Findings)
*Keine unmittelbaren Gefahren für Geldverlust oder Sicherheit gefunden.*

### 🟡 WARNING (Priorität: Hoch)

#### 1. Fehlende Internationalisierung (i18n)
*   **Ort:** `src/components/settings/tabs/TradingTab.svelte`, `SystemTab.svelte`, `ConnectionsTab.svelte`.
*   **Problem:** Dutzende hardcodierte Strings (z.B. "Heatmap Action", "History Length", "Broker").
*   **Risiko:** Unprofessioneller Eindruck, Unbenutzbarkeit für nicht-englische Nutzer (Verstoß gegen Anforderung "Pro-Trading-Plattform").
*   **Action:** Strings in `locales/{lang}.json` extrahieren und durch `$_()` ersetzen.

#### 2. Unsicheres LocalStorage Parsing
*   **Ort:** `ChartPatternsView.svelte`, `CandlestickPatternsView.svelte`.
*   **Code:** `favorites = new Set(JSON.parse(stored));`
*   **Problem:** Wenn `localStorage` korrupte Daten enthält (z.B. durch manuelles Editieren oder Browser-Fehler), stürzt die Komponente ab (`SyntaxError`).
*   **Action:** Nutzung von `safeJsonParse` oder `try-catch` Block.

#### 3. API-Schema Inkonsistenz (Bitget)
*   **Ort:** `src/services/apiService.ts` (`fetchBitgetKlines`).
*   **Problem:** Im Gegensatz zu Bitunix (das `zod` nutzt) wird Bitget-Response manuell gemappt. Fehlerhafte API-Daten könnten zu `NaN` oder Runtime-Errors führen, obwohl `try-catch` vorhanden ist.
*   **Action:** Einführung eines `BitgetKlineSchema` (Zod) zur strikten Validierung.

#### 4. Type Casting in TradeService
*   **Ort:** `src/services/tradeService.ts`.
*   **Code:** `side: side.toLowerCase() as any` (in `flashClosePosition`).
*   **Problem:** Umgeht TypeScript-Checks. Wenn `side` ungültig ist, wird eine invalide Order an den OMS geschickt.
*   **Action:** Nutzung korrekter Typen (`OMSOrderSide`).

### 🔵 REFACTOR (Priorität: Mittel)

#### 1. Fragile API-Erfolgs-Prüfung
*   **Ort:** `src/services/tradeService.ts`, `apiService.ts`.
*   **Code:** `if (data.code !== "0") ...`
*   **Problem:** Verlässt sich auf die magische Zahl "0" von Bitunix.
*   **Action:** Zentralisierung der "IsSuccess"-Logik in einer Helper-Funktion `isBitunixSuccess(response)`.

#### 2. Redundante Checks in WebSocket
*   **Ort:** `src/services/bitunixWs.ts`.
*   **Code:** Prüfung auf `typeof orderId === 'number'` nach `safeJsonParse`.
*   **Info:** `safeJsonParse` wandelt große Zahlen bereits in Strings. Der Check ist paranoid, aber harmlos.
*   **Action:** Beibehalten als "Defense in Depth", aber Kommentar hinzufügen.

## 3. Ressourcen & Performance (Positiv)
*   **Memory Leaks:** Keine gefunden. `destroy()` Methoden in Services und Stores sind vorbildlich implementiert.
*   **Limits:** Ring-Buffer für Orders (2000), Chart-History-Slicing und Rate-Limiting (Token Bucket) sind aktiv.
*   **UI-Performance:** Nutzung von `untrack` und Batch-Updates (`pendingUpdates`) im Market-Store verhindert unnötige Re-Renders.

## 4. Sicherheit (Positiv)
*   **XSS:** `renderSafeMarkdown` nutzt `DOMPurify` und blockiert SSR-Rendering (Return `""`), was extrem sicher ist.
*   **Input:** `Decimal` wird überall erzwungen.

## 5. Nächste Schritte
Der Fokus liegt auf der Behebung der i18n-Schulden und der Härtung der UI-Komponenten gegen Daten-Korruption.
