# Status- & Risiko-Bericht (Code Audit)

## Zusammenfassung
Die Codebasis weist eine solide Grundstruktur mit modernen Patterns (Svelte 5 Runes, Services, Singleton-Stores) auf. Es wurden jedoch kritische Mängel im Ressourcen-Management (Memory Leaks) und Inkonsistenzen bei der Internationalisierung (i18n) identifiziert. Die Datenintegrität ist durch weitgehende Nutzung von `Decimal.js` und `safeJsonParse` gut geschützt, weist aber Lücken bei WebSocket-Edge-Cases auf.

## Priorisierte Findings

### 🔴 CRITICAL (Sofortiger Handlungsbedarf)

1.  **Memory Leak in `omsService.ts`**
    *   **Beschreibung:** Der `OrderManagementSystem` Singleton startet im Constructor ein `setInterval` für den Watchdog (`removeOrphanedOptimistic`), bietet aber keine `destroy()` Methode oder Cleanup-Logik an.
    *   **Risiko:** Bei Hot-Module-Replacement (HMR) oder Re-Instanziierung sammeln sich verwaiste Intervalle an, die CPU-Last erzeugen und Race Conditions verursachen können.
    *   **Fix:** Implementierung einer `destroy()` Methode und HMR-Cleanup (analog zu `MarketManager`).

2.  **Präzisionsverlust bei WS-Daten (Potenziell)**
    *   **Beschreibung:** `bitunixWs.ts` erkennt und loggt, wenn Preise als `number` statt `string` empfangen werden. Obwohl `safeJsonParse` genutzt wird, besteht das Risiko, dass Fließkommazahlen mit hoher Präzision (die nicht als Integer erkannt werden) als native JavaScript Numbers geparst und dadurch ungenau werden, bevor der Cast zu String erfolgt.
    *   **Fix:** Verschärfung der `safeJsonParse` Logik oder striktere Zod-Validierung, die `number` strikt ablehnt, falls Präzision kritisch ist.

### 🟡 WARNING (Stabilität & UX)

3.  **Fehlende Internationalisierung (Hardcoded Strings)**
    *   **Beschreibung:** In `src/components/shared/JournalContent.svelte` wurden hardcodierte deutsche und englische Strings gefunden (z.B. `"ATR-Neuberechnung gestartet..."`, `"Bitunix Sync"`, `"Export"`).
    *   **Risiko:** Schlechte UX für Nutzer mit anderer Spracheinstellung; Wartbarkeits-Albtraum.
    *   **Fix:** Extraktion aller Strings in `src/locales/locales/*.json` und Nutzung von `$_()`.

4.  **Inkonsistente JSON-Analyse in `newsService.ts`**
    *   **Beschreibung:** Während Core-Services `safeJsonParse` nutzen, verwendet `newsService.ts` natives `res.json()`.
    *   **Risiko:** Gering (da News-Daten selten High-Precision Maths erfordern), aber inkonsistent zur Sicherheitsrichtlinie.
    *   **Fix:** Umstellung auf `res.text()` + `safeJsonParse()`.

5.  **Potenzielles XSS Risiko bei `{@html}`**
    *   **Beschreibung:** Weit verbreitete Nutzung von `{@html ...}` für Icons und Markdown.
    *   **Check:** Es muss sichergestellt sein, dass `renderMarkdown` strikt `DOMPurify` verwendet.
    *   **Fix:** Audit der `renderMarkdown` Funktion (falls nicht geschehen) und explizite Sanitize-Wrapper für alle dynamischen Inhalte.

### 🔵 REFACTOR (Technische Schuld)

6.  **Vermischung von Logik und UI (`JournalContent.svelte`)**
    *   **Beschreibung:** Die "Cheat Code" Logik (`handleKeydown`) befindet sich direkt in der Komponente.
    *   **Fix:** Auslagerung in einen `CheatCodeService` oder Utility.

## Empfohlener Aktionsplan (Vorschau für Schritt 2)

1.  **Härtung `omsService`:** Implementierung von Lifecycle-Management (`destroy`).
2.  **I18n-Cleanup:** Bereinigung von `JournalContent.svelte` und `MarketOverview.svelte`.
3.  **Konsolidierung:** `newsService` auf `safeJsonParse` umstellen.
4.  **Test:** Unit-Test schreiben, der das Memory-Leak in `omsService` reproduziert (oder zumindest die Existenz der Cleanup-Methode prüft).
