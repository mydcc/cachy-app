# Masterplan: Cachy Web Search Integration ("Agentic Loop")

Dieses Dokument beschreibt die detaillierte Planung zur Integration einer autonomen Websuche in den Cachy AI Assistenten, inspiriert von der Funktionalität des Dexter-Agenten.

## 1. Zielsetzung
Erweiterung des reaktiven KI-Assistenten zu einem agentischen System, das bei Bedarf selbstständig Informationen aus dem Internet recherchiert, um aktuelle Marktereignisse zu erklären und verifizierte Daten mit Quellenangaben zu liefern.

## 2. Architektur & Datenfluss (Agentic Loop)

Der Prozess wird von einer linearen Kette zu einem iterativen Loop umgebaut:

1.  **Request:** User sendet Anfrage an `AiManager.sendMessage`.
2.  **Context Gathering:** Lokale Daten (Preise, Portfolio, News) werden wie bisher gesammelt.
3.  **LLM Decision (Turn 1):**
    *   Das LLM erhält Instruktionen zur Tool-Nutzung.
    *   Entscheidung: Direkte Antwort ODER Tool-Call via JSON: `{ "tool": "search", "query": "..." }`.
4.  **Tool Execution (Client-Side):**
    *   `AiManager` erkennt den Tool-Call.
    *   Aufruf `searchService.search(query)` -> API Proxy -> Tavily/Exa API.
5.  **Synthesis (Turn 2):**
    *   Suchergebnisse werden als `system`-Message in den Verlauf injiziert.
    *   Erneuter LLM-Call mit dem gesamten neuen Kontext.
6.  **Response:** Finale Antwort an den User mit Quellenangaben `[1]`.

## 3. Datei-Spezifische Änderungen

### A. Konfiguration (`src/stores/settings.svelte.ts`)
*   Erweiterung des `Settings` Interface:
    *   `enableWebSearch: boolean` (Default: `false`)
    *   `searchProvider: "tavily"` (Default: `"tavily"`)
    *   `tavilyApiKey: string` (Default: `""`)

### B. Einstellungen UI (`src/components/settings/tabs/AiTab.svelte`)
*   Hinzufügen einer neuen Sektion "Research & Tools" (Design-konform mit bestehenden Karten).
*   Eingabefelder für Feature-Toggle und API-Key (maskiert).

### C. KI-Logik (`src/stores/ai.svelte.ts`)
*   **Thinking State:** Einführung eines `$state` zur Verfolgung des Agenten-Fortschritts (`idle`, `searching`, `analyzing`).
*   **System Prompt:** Integration eines strikten Tool-Nutzungs-Abschnitts (nur aktiv, wenn Key vorhanden und Feature an).
*   **Loop-Implementierung:** Umbau von `sendMessage` auf eine `while`-Schleife (begrenzt auf max. 3 Iterationen zur Kostenkontrolle).
*   **Parsing:** Robuster Regex-Parser für JSON-Tool-Blöcke innerhalb des AI-Streams.

### D. Lokalisierung (`src/locales/locales/de.json` & `en.json`)
*   Übersetzungen für alle neuen Settings und Statusmeldungen (z.B. "Recherchiere aktuelle Marktdaten...").

## 4. Neue Komponenten

### A. Backend Proxy (`src/routes/api/external/search/+server.ts`)
*   Sicherer Proxy-Endpunkt zur Kommunikation mit der Such-API (Tavily/Exa).
*   Schutz vor CORS-Problemen.
*   Standardisierung der Suchergebnisse für das Frontend.

### B. Search Service (`src/services/searchService.ts`)
*   Kapselung der API-Logik.
*   Implementierung eines Session-Caches, um redundante Suchen bei Folgefragen zu vermeiden.

## 5. UI/UX & Design-Regeln (CI)

*   **Feedback:** Nutzung der bestehenden `Thinking`-Animation, ergänzt durch eine Textzeile, die den aktuellen Agenten-Schritt beschreibt.
*   **Quellen:** Anzeige von Quellen am Ende der Nachricht in einem dezenten `<small>`-Tag oder einem ausklappbaren `details`-Element.
*   **Farben:** Strikte Einhaltung der CSS-Variablen aus `themes.css` für Status-Badges.

## 6. Safety & Fallbacks

*   **API-Fehler:** Wenn die Suche fehlschlägt (Key ungültig, Quota voll), wird die KI via `system`-Nachricht informiert und antwortet basierend auf internem Wissen mit einem entsprechenden Hinweis an den User.
*   **Endlosschleifen:** Harte Begrenzung der Tool-Calls pro User-Anfrage.
*   **Privacy:** Es werden keine Portfolio-Daten oder API-Keys an die Suchmaschine gesendet, nur die von der KI generierte Suchanfrage.

## 7. Roadmap

1.  **Meilenstein 1:** Backend Proxy & Search Service (Infrastruktur).
2.  **Meilenstein 2:** Settings-Erweiterung & UI-Integration.
3.  **Meilenstein 3:** Umbau des `AiManager` Loop-Systems.
4.  **Meilenstein 4:** UI-Polishing (Status-Anzeige & Quellen-Links).

---
*Erstellt am 9. Februar 2026 für das Cachy Projekt.*
