# Status- & Risiko-Bericht (Step 1)

## 1. Executive Summary
Die Codebasis zeigt eine solide Architektur mit robusten Ansätzen (z.B. Zod-Validierung im Backend, Singleton-Pattern für WebSockets). Jedoch wurden **KRITISCHE** Sicherheitslücken (XSS) und logische Schwachstellen im Finanz-Handling (fehlende Validierung bei Teilschließungen) gefunden. Die Ressourcenverwaltung ist größtenteils gut ("Zombie-Killing" in WS), aber Synchrone I/O-Operationen im AI-Store gefährden die Performance.

---

## 2. Findings

### 🔴 CRITICAL (Sofortiger Handlungsbedarf)

1.  **XSS Schwachstelle in `CustomModal.svelte`**
    *   **Ort:** `src/components/shared/CustomModal.svelte`
    *   **Problem:** Verwendung von `{@html mState.message}` ohne Sanitize-Schritt (z.B. DOMPurify).
    *   **Risiko:** Ein Angreifer könnte über manipulierte Fehlermeldungen oder externe Daten (z.B. News-Titel) Schadcode einschleusen.
    *   **Empfehlung:** `sanitizeHtml` Utility verwenden oder `{@html}` entfernen.

2.  **Fehlende Input-Validierung in `tradeService.ts`**
    *   **Ort:** `src/services/tradeService.ts`, Methode `closePosition`
    *   **Problem:** Der Parameter `amount` ist optional. Falls vorhanden, wird nicht geprüft, ob `amount > position.amount` oder `amount <= 0` ist.
    *   **Risiko:** Senden ungültiger Orders an die API, potenziell unerwartetes Verhalten bei "ReduceOnly" Konflikten, wenn die API dies nicht sauber abfängt.
    *   **Empfehlung:** Pre-Check: `if (amount && (amount.lte(0) || amount.gt(position.amount))) throw ...`

3.  **Performance-Blocker in `ai.svelte.ts`**
    *   **Ort:** `src/stores/ai.svelte.ts`, Methode `save()` und `sendMessage()`
    *   **Problem:** `localStorage.setItem` wird synchron bei *jeder* Nachricht aufgerufen. Auch wenn `messages` auf 50 begrenzt ist, blockiert dies den Main-Thread, besonders auf mobilen Geräten.
    *   **Risiko:** UI-Freezes während des Tradings.
    *   **Empfehlung:** `debounce` für `save()` implementieren oder `IndexedDB` (async) nutzen.

### 🟡 WARNING (Priorität Hoch)

1.  **"Fast Path" Validierungsumgehung in `bitunixWs.ts`**
    *   **Ort:** `src/services/bitunixWs.ts`, Methode `handleMessage`
    *   **Problem:** Für High-Frequency Daten (Ticker, Price, Book) wird die Zod-Validierung übersprungen ("Fast Path"), um Performance zu sparen.
    *   **Risiko:** Wenn Bitunix das API-Schema ändert, könnte die App abstürzen oder korrupte Daten in den `marketState` schreiben, da `isPriceData` Type Guards sehr locker sind.
    *   **Empfehlung:** Zumindest eine "Lightweight"-Validierung der Datentypen durchführen oder `try-catch` spezifisch um den State-Update-Block legen.

2.  **Hardcoded Strings & i18n Lücken**
    *   **Ort:** `src/components/shared/OrderHistoryList.svelte`
    *   **Problem:** Mapping von `BUY`/`SELL`/`MAKER` auf Übersetzungsschlüssel ist statisch. Fallback-Texte ("No history found") sind hardcoded englisch.
    *   **Risiko:** Inkonsistente UX für nicht-englische Nutzer.
    *   **Empfehlung:** Alle Strings in `src/locales` auslagern.

3.  **Netzwerk-Timeout Logik in `ai.svelte.ts`**
    *   **Ort:** `src/stores/ai.svelte.ts`, Methode `gatherContext`
    *   **Problem:** `Promise.race` wartet bis zu 5000ms auf Kontext.
    *   **Risiko:** Verzögert die Antwort des AI-Assistenten massiv, wenn externe APIs (CMC, News) langsam sind.
    *   **Empfehlung:** Timeout auf 1000-2000ms reduzieren oder "Stale-While-Revalidate" Pattern nutzen.

4.  **API Fallback Logik**
    *   **Ort:** `src/routes/api/orders/+server.ts`, `fetchBitgetHistoryOrders`
    *   **Problem:** `startTime` ist hardcoded auf `Date.now() - 7 Tage`.
    *   **Risiko:** User kann keine älteren Orders sehen.
    *   **Empfehlung:** `startTime` als optionalen Parameter durchreichen.

### 🔵 REFACTOR (Technische Schuld)

1.  **Inkonsistente Typen (`Number` vs `Decimal`)**
    *   **Ort:** `src/services/bitunixWs.ts` (`mapToOMSOrder`), `src/components/shared/OrderHistoryList.svelte`
    *   **Problem:** Zeitstempel und einige PnL-Berechnungen nutzen `Number()`.
    *   **Empfehlung:** Konsequente Nutzung von `Decimal` für alle Geldwerte. Zeitstempel können `number` bleiben (safe integer range), aber API-Daten sollten idealerweise direkt validiert werden.

2.  **Magic Strings in `marketWatcher.ts`**
    *   **Ort:** `mapTimeframeToBitunix` und Channel-Namen.
    *   **Empfehlung:** Enums oder Konstanten-Objekte verwenden.

---

## 3. Nächste Schritte (Vorschlag)

1.  **Sofort-Fix:** `CustomModal` XSS beheben (Sanitization).
2.  **Hardening:** `tradeService` Validierung hinzufügen.
3.  **Performance:** `ai.svelte.ts` Storage-Logik optimieren.
4.  **I18n:** Audit der UI-Komponenten und Auslagerung der Strings.
