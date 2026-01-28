# Status- & Risiko-Bericht: Cachy Trading Platform

**Datum:** 05.03.2025
**Analyst:** Jules (Senior Lead Developer)
**Status:** Initial Audit Completed

Dieser Bericht fasst die Ergebnisse der Tiefenanalyse (Phase 1) zusammen. Ziel war es, die Codebasis auf Stabilität, Datensicherheit und "Institutional Grade" Standards zu prüfen.

---

## 🔴 CRITICAL (Kritische Risiken)
*Sofortiger Handlungsbedarf. Gefahr von finanziellen Verlusten, Dateninkonsistenz oder Sicherheitslücken.*

1.  **Finanz-Mathematik ohne Typ-Sicherheit (`calculatorService.ts`)**
    *   **Problem:** Die Methode `calculateTotalMetrics` und das Array `targets` verwenden `any`-Typen (`targets: any[]`, `return any`).
    *   **Risiko:** Es gibt keine Garantie, dass Berechnungen mit `Decimal` durchgeführt werden. Ein versehentliches Einschleusen von nativen `number`-Werten kann zu Rundungsfehlern führen (z.B. `0.1 + 0.2 = 0.30000000000000004`), was bei Finanz-Applikationen inakzeptabel ist.
    *   **Fundort:** `src/services/calculatorService.ts`

2.  **XSS-Sicherheitslücke in Markdown-Rendering**
    *   **Problem:** Die Komponenten `ChartPatternsView.svelte` und `CandlestickPatternsView.svelte` nutzen `{@html marked.parse(...)}` ohne Sanitization (z.B. via `DOMPurify`).
    *   **Risiko:** Cross-Site Scripting (XSS). Sollte jemals Schadcode in die Pattern-Datenbank oder Übersetzungsdateien gelangen, würde dieser ungefiltert im Browser des Users ausgeführt werden (Session Hijacking, Keylogging).
    *   **Fundort:** `src/components/shared/ChartPatternsView.svelte`

3.  **Schema-Drift Risiko in WebSocket-Handlern**
    *   **Problem:** Sowohl `bitunixWs.ts` als auch `bitgetWs.ts` nutzen massiv `any`-Casting (z.B. `(msg as any).event`) und "Fast Path"-Optimierungen, die die Validierung umgehen.
    *   **Risiko:** Wenn die Börsen ihre API unangekündigt ändern (Schema Drift), stürzt der Handler ab oder verarbeitet falsche Daten, ohne dass `Zod` dies abfängt. Dies kann zu "Frozen UI" oder falschen Preisdaten führen.
    *   **Fundort:** `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`

4.  **Fehlende Programmatische AI-Validierung**
    *   **Problem:** Das "Anti-Hallucination Protocol" in `ai.svelte.ts` basiert rein auf Prompt-Engineering (Text-Anweisungen an die KI). Es gibt keine code-seitige Überprüfung, ob die von der KI genannten Preise/Werte tatsächlich mit dem geladenen Kontext übereinstimmen.
    *   **Risiko:** Die KI kann trotz Prompt halluzinieren (z.B. falsche Preise nennen), und das System würde dies dem User ungeprüft anzeigen.

---

## 🟡 WARNING (Warnungen)
*Einfluss auf UX, Wartbarkeit oder Stabilität in Randfällen.*

1.  **Lückenhafte Internationalisierung (i18n)**
    *   **Problem:** Zahlreiche Hardcoded Strings in den Einstellungen und UI-Komponenten gefunden.
    *   **Beispiele:** "Analyze All Favorites" (`CalculationSettings.svelte`), "Tags" (`TagInputs.svelte`), "Alt/Ctrl" (`HotkeySettings.svelte`).
    *   **Risiko:** Unprofessioneller Eindruck bei nicht-englischen Nutzern; erschwerte Wartung.

2.  **Unsichere HTML-Injection in Übersetzungen**
    *   **Problem:** `{@html $_("legal.disclaimerBody")}` rendert HTML direkt aus den JSON-Sprachdateien.
    *   **Risiko:** Wenn Übersetzungstools oder -dateien kompromittiert werden, ist dies ein Einfallstor für XSS. HTML sollte in Sprachdateien vermieden oder strikt sanitisiert werden.

3.  **Grobes Error-Handling bei Bulk-Operationen**
    *   **Problem:** `tradeService.closeAllPositions` nutzt `Promise.allSettled`, wirft aber bei *einem* Fehler einen generischen Fehler ("apiErrors.generic").
    *   **Risiko:** Der User erfährt nicht, *welche* Position nicht geschlossen werden konnte. Dies ist in Panik-Situationen (Not-Aus) fatal.

---

## 🔵 REFACTOR (Technische Schuld)
*Verbesserungspotenzial für langfristige Qualität.*

1.  **Magic Numbers in `parseTimestamp`**
    *   Die Heuristik `< 10000000000` (Jahr 2286) zur Unterscheidung von Sekunden/Millisekunden ist fragil und sollte durch explizite Logik ersetzt werden.
2.  **Komplexität in `marketWatcher.ts`**
    *   Die Logik zur Verwaltung von Locks und Timeouts ist robust, aber sehr komplex. Eine Vereinfachung mittels `RxJS` oder einer State-Machine wäre langfristig sicherer.

---

## Nächste Schritte (Phase 2 Preview)

Basierend auf diesem Bericht wird der Aktionsplan für Phase 2 folgende Prioritäten haben:

1.  **Hardening Financial Core:** Typ-Sicherheit für `calculatorService` herstellen (Strict `Decimal`).
2.  **Security Fixes:** `DOMPurify` integrieren für alle Markdown-Renderings.
3.  **WebSocket Safety:** Zod-Validierung auch im "Fast Path" erzwingen oder `any`-Casts entfernen.
4.  **I18n Audit:** Hardcoded Strings extrahieren und in `en.json` / `de.json` überführen.
