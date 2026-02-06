# Systematischer Analysebericht & Risikobewertung

**Datum:** 26.05.2026
**Autor:** Senior Lead Developer (Jules)
**Status:** Phase 1 (Analyse) abgeschlossen

Dieser Bericht fasst den aktuellen Zustand der Codebasis zusammen, identifiziert kritische Schwachstellen und definiert den Handlungsbedarf für die "Institutional Grade" Härtung.

## 1. Zusammenfassung der Risikobewertung

| Kategorie | Status | Dringlichkeit |
| :--- | :---: | :---: |
| **Data Integrity & Mapping** | 🔴 KRITISCH | Hoch |
| **Resource Management** | 🟢 GUT | Niedrig |
| **UI/UX & I18n** | 🟡 WARNUNG | Mittel |
| **Security & Validation** | 🟢 GUT | Niedrig |

---

## 2. Detaillierte Ergebnisse (Findings)

### 🔴 CRITICAL (Risiko für Datenverlust oder Finanzfehler)

#### 1. Unsichere API-Handhabung in `TpSlEditModal.svelte`
- **Fundstelle:** `src/components/shared/TpSlEditModal.svelte`
- **Problem:** Die Komponente führt eigenständig `fetch("/api/tpsl")` aus und verwendet `res.json()`.
- **Risiko:**
  1. **Präzisionsverlust:** JavaScript `number` (via `JSON.parse` in `res.json()`) verliert Präzision bei großen Zahlen (z.B. 19-stellige Order-IDs oder sehr kleine Krypto-Preise). Dies kann dazu führen, dass Orders nicht mehr stornierbar sind oder falsche Preise angezeigt werden.
  2. **Logik-Duplizierung:** Die Authentifizierungslogik (API Keys aus Store holen) wird hier dupliziert, anstatt den gehärteten `TradeService` zu nutzen.
- **Empfehlung:** Sofortige Refaktorisierung zur Nutzung von `tradeService.modifyTpSlOrder()` (muss ggf. implementiert/exponiert werden) oder `tradeService.signedRequest` mit `safeJsonParse`.

### 🟡 WARNING (UX, Wartbarkeit, Performance)

#### 1. Fehlende Lokalisierung (I18n)
- **Fundstelle:** `src/components/shared/TpSlEditModal.svelte` (und potenziell andere Modals).
- **Problem:** Hardcodierte Strings wie "Trigger price is required", "Edit Take Profit", "Cancel", "Save".
- **Risiko:** Schlechte UX für nicht-englische Nutzer; inkonsistente Fehlermeldungen.
- **Empfehlung:** Alle Strings in `$_('...')` wrappen und in `src/locales/` eintragen.

#### 2. Komplexität im WebSocket "Fast Path"
- **Fundstelle:** `src/services/bitunixWs.ts`
- **Problem:** Die Methode `handleMessage` enthält einen komplexen "Fast Path", der manuelle Typ-Prüfungen (`typeof val === 'number'`) durchführt, um `Decimal` Overheads zu vermeiden.
- **Risiko:** Obwohl `safeJsonParse` vorgeschaltet ist, ist die Logik fragil. Wenn ein Upstream-Parser (z.B. Browser-native WebSocket Event Handling) Zahlen bereits als `number` interpretiert, bevor unser Code greift, ist die Präzision weg. Der aktuelle Code loggt dies ("CRITICAL PRECISION LOSS"), aber eine robustere, zentrale Lösung wäre wünschenswert.
- **Empfehlung:** Beibehalten, da Performance kritisch ist, aber Monitorings-Logs genau beobachten.

### 🟢 POSITIVE FINDINGS (Bestätigte Härtung)

- **NewsService:** Vorbildliche Implementierung. Nutzt `safeJsonParse`, `zod`-Validierung, Deduplizierung (`pendingFetches`) und Cache-Limiting.
- **TradeService:** Serialisiert Payloads rekursiv (`Decimal.toString()`) und nutzt `safeJsonParse` für alle Responses.
- **MarketWatcher:** Robuster Schutz gegen "Zombie-Requests" durch Timeouts und Tracking von Startzeiten. Parallele Requests werden korrekt limitiert.
- **ApiSchemas:** `StrictDecimal` Schema fängt `NaN`/`Infinity` ab und loggt Fehler, statt die UI crashen zu lassen.

---

## 3. Priorisierter Maßnahmenplan (Vorschlag für Phase 2)

### Schritt 1: Fix Data Integrity (CRITICAL)
1.  **Refactor `TpSlEditModal`:**
    - Entfernen des direkten `fetch`.
    - Implementierung einer Methode `modifyTpSlOrder` im `TradeService`, die `serializePayload` und `safeJsonParse` nutzt.
    - Anbindung des Modals an diesen Service.

### Schritt 2: UI/UX & I18n (WARNING)
1.  **Lokalisierung:**
    - Extraktion aller Strings aus `TpSlEditModal` in `src/locales/locales/en.json` (und `de.json` placeholder).
    - Einbau von `$_` in der Komponente.

### Schritt 3: Systemweite Verifizierung
1.  **Grep-Search:** Suche nach weiteren Vorkommen von `res.json()` in Komponenten, um ähnliche Schwachstellen wie im Modal zu finden.
