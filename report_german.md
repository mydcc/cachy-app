Hier ist der detaillierte Status- und Risikobericht (Schritt 1) sowie der Aktionsplan (Schritt 2).

# Schritt 1: Status- & Risikobericht

## 🔴 CRITICAL
* **Exposure of Raw HTML in Error Messages:** In `src/services/tradeService.ts` (Zeile 298 & 533) wird `e.rawMessage` ungeprüft als Fehlermeldung ausgelesen. Bei einem 502 Bad Gateway Fehler des Proxys kann dies zu Raw-HTML Injection führen und Gateway-Details preisgeben, was kritische Sicherheitsprobleme und UX-Bugs verursacht.
* **JSON Parsing Precision Loss (Data Integrity):** Obwohl `safeJsonParse` an vielen Stellen in den API-Routen verwendet wird, existieren Restrisiken bei nativem `JSON.parse` (z.B. in `src/utils/WasmTechnicalsCalculator.ts` und `src/services/backupService.ts`). Große numerische IDs könnten ihre Präzision verlieren, was fatale Dateninkonsistenzen zur Folge hätte.

## 🟡 WARNING
* **Unbounded Memory / Leaks (MarketWatcher):** In `MarketWatcher` und anderen Services (wie `omsService.ts`, `apiService.ts`) werden `setInterval` und `setTimeout` aufgerufen. Während `MarketWatcher` zwar `clearTimeout` benutzt, müssen wir sicherstellen, dass bei der Zerstörung / Deaktivierung der Services (besonders in Hot Paths) keine Zombie-Timer oder unbegrenzten Caches / Arrays zurückbleiben, was unweigerlich zu Memory Leaks führt.
* **Hardcoded String Fallbacks / Missing i18n:** In UI-Komponenten existieren unsaubere Fallbacks wie `$_("dashboard.favorites") || "Favorites"` (in `src/routes/+page.svelte`) und `$_("chartPatterns.title") || "Chart Patterns"` (in `src/routes/[[lang]]/(seo)/academy/+page.svelte`), was zu unübersetzten Fragmenten führt.
* **Optimistic UI Order Rollback (Indeterminate State):** Im `TradeService` dürfen Orders bei Timeouts nicht gnadenlos entfernt werden (`removeOrder`), sondern müssen als unbestätigt (`_isUnconfirmed = true`) markiert werden, da sie auf dem Exchange eventuell ausgeführt wurden.

## 🔵 REFACTOR
* **Decimal Downcasting:** Es wird `Number()` oder `.toNumber()` auf Float- und Dezimalwerten (z.B. in Svelte Stores) angewandt, statt stringente `Decimal`-Typen für Berechnungen zu nutzen.
* **Unsanitized `{@html}`:** Manche Komponenten, die rohes HTML direkt parsen (wie Icons), könnten ein Risiko darstellen, wenn keine Absicherung durch `DOMPurify.sanitize()` stattfindet (auch wenn viele Icons sicher von der Codebase stammen).

---

# Schritt 2: Aktionsplan (Planning Phase)

Basierend auf den identifizierten Problemen präsentiere ich folgenden Implementierungsplan zur Code-Härtung:

### 1. Hardening Fehlerbehandlung (CRITICAL)
**Problem:** `e.rawMessage` aus `tradeService.ts` leckt bei API-Timeouts rohes HTML in die Benutzeroberfläche.
**Spezifischer Testfall vor dem Fix:**
Erstelle einen Unittest (z.B. in `tradeService_html_leak.test.ts`), der einen `BitunixApiError` wirft, dessen `rawMessage` ein HTML-Dokument simuliert (`"<html><body>502 Bad Gateway</body></html>"`).
*Assertion:* Stelle sicher, dass die extrahierte Fehlermeldung (`uiState.showError`) das HTML enthält.
**Fix:** Prüfen ob der String HTML enthält (`.toLowerCase().includes('<html')`) und diesen dann auf generische, sichere i18n-Schlüssel (z.B. `apiErrors.invalidResponse`) mappen.

### 2. Hardening Datenintegrität & JSON (CRITICAL)
**Problem:** `JSON.parse` verursacht Präzisionsverluste bei großen Integern (wie IDs) in `WasmTechnicalsCalculator.ts` und `backupService.ts`.
**Spezifischer Testfall vor dem Fix:**
Erstelle einen Unittest (z.B. `backupService_precision.test.ts`), der eine Backup-Datei mit einer großen Order-ID (`{"id": 1234567890123456789}`) parst.
*Assertion:* Zeige, dass die ID durch natives `JSON.parse` zu `1234567890123456800` verfälscht wird.
**Fix:** Ersetze alle Vorkommen von `JSON.parse` durch unsere sichere Utility-Funktion `safeJsonParse`, die große Zahlen als Strings beibehält.

### 3. Resource Management & State (WARNING)
**Problem:** Fehlende Cache/Timer-Freigaben und riskantes Optimistic-UI-Rollback.
**Aktion:**
*   **Timer Lifecycle:** In `marketWatcher.ts` und weiteren Services prüfen wir die `.destroy()` Methoden. Jeder gesetzte Timeout oder Interval muss in einem Array referenziert und beim Teardown restlos geleert (`clearTimeout` / `clearInterval`) werden.
*   **Optimistic Rollback:** Die Behandlung von Timeouts im `tradeService` wird angepasst. Tritt ein Fehler ohne klares Feedback der Börse auf (Indeterminate State), wird das `removeOrder` entfernt und stattdessen `_isUnconfirmed = true` gesetzt.

### 4. UI/UX & A11y (WARNING)
**Problem:** Fehlende Übersetzungen durch hardcodierte Strings in `.svelte`-Dateien.
**Aktion:** Sämtliche Fallback-Strings (`|| "Favorites"`, `|| "Chart Patterns"`) entfernen wir aus dem Markup. Stattdessen fügen wir diese Schlüssel sauber in die Übersetzungsdateien ein, damit die UI für alle Sprachen verlässlich bleibt.

### 5. Decimal Handling (REFACTOR)
**Problem:** Konvertierung von Decimal-Werten zu Floats birgt Ungenauigkeiten.
**Rechtfertigung nach Prinzip "Messbare Stabilität/Performance":** Dies ist kein rein kosmetisches Refactoring! Finanzielle Berechnungen in JavaScript durch Floats können Rundungsfehler (z.B. `0.1 + 0.2 = 0.30000000000000004`) erzeugen, was für eine "institutionelle" Plattform inakzeptabel ist. Das stringente Nutzen von `Decimal.js` vom API-Empfang bis zum Rendering in den Stores verhindert PnL-Fehler und erhöht die Plattform-Stabilität. Kosmetische Code-Smells werden ignoriert.
**Fix:** Beseitige `Number(...)` oder `.toNumber()` Aufrufe auf Preis-/Positionsdaten und reiche das reine Decimal-Objekt durch.
