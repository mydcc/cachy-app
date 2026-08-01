# Cachy - Dexter Integration & Web Search Plan

## 1. Vergleich: Cachy vs. Dexter

| Feature | Cachy | Dexter |
| :--- | :--- | :--- |
| **Primärer Fokus** | Präzises Trading-Management & Kalkulation | Autonome Finanzrecherche |
| **KI-Ansatz** | Reaktiv (Kontext wird vorab gesammelt) | Agentisch (KI plant und sucht selbstständig) |
| **Datenquellen** | Feste APIs (Binance, Bitunix, CryptoPanic) | Live Web-Suche & Scraping (Exa, Tavily, Playwright) |
| **Analyse-Tiefe** | Technische Indikatoren & Sentiment | Fundamentaldaten (Bilanzen, SEC-Filings) |
| **Plattform** | Web-App (SvelteKit) | CLI (Bun / React Ink) |

---

## 2. Mehrwert einer Websuche für Cachy

1.  **Echtzeit-Analyse von Volatilität:** "Warum pumpt/dumpt BTC gerade?" (Suche nach aktuellen News-Events).
2.  **Fundamentale Krypto-Events:** Tracking von Airdrops, Token-Unlocks und Mainnet-Launches.
3.  **Sentiment-Validierung:** Abgleich von Schlagzeilen über verschiedene Live-Quellen.
4.  **Technischer Support:** Aktuelle Hilfe zu Exchange-API-Änderungen oder Broker-Regeln.

---

## 3. Technischer Integrationsplan ("Agentic Loop")

### Schritt 1: Backend Search Proxy
Erstellung eines API-Endpunkts `src/routes/api/external/search/+server.ts`.
- Nutzung von **Tavily** oder **Exa.ai** (speziell für LLMs optimiert).
- Proxy-Funktion, um CORS-Probleme zu umgehen.

### Schritt 2: Frontend Service
Erstellung von `src/services/searchService.ts`.
- Einfache Funktion `search(query: string)` zur Kommunikation mit dem Proxy.

### Schritt 3: Erweiterung des AiManagers (`ai.svelte.ts`)
Umbau von `sendMessage` zu einem Loop:
1.  **System Prompt erweitern:** KI anweisen, bei Bedarf ein JSON-Block mit `{ "tool": "searchWeb", "query": "..." }` auszugeben.
2.  **Output Parsing:** Wenn ein Tool-Call erkannt wird -> Suche ausführen.
3.  **Recursive Call:** Suchergebnisse als `system`-Message an den Chatverlauf anhängen und KI erneut anfragen.

### Schritt 4: UI/UX Anpassungen
- **Status-Indikator:** Anzeige von Schritten wie "Suche nach...", "Analysiere Ergebnisse...".
- **Citations:** Quellenangaben am Ende der Nachricht oder als klickbare Links im Text.
- **News-Widgets:** Suchergebnisse als kleine Karten unter der Antwort einblenden.

---

## 4. Dexter-Logik übernehmen (Portierung statt Kopplung)

Da Dexter eine CLI-App auf Bun-Basis ist, wird eine direkte Kopplung nicht empfohlen. Stattdessen sollte die "Intelligenz" portiert werden:
- **Prompts:** Kopieren der spezialisierten Finanz-Prompts aus Dexter in den Cachy System-Prompt.
- **Tool-Chain:** Die Logik der Tool-Auswahl von Dexter (src/agent/agent.ts) als Vorbild für den Svelte-Store nutzen.
- **Services:** Ersetzen von Dexters `Playwright`-Scraping durch einfachere Server-Side-Proxies.

---
*Dokument erstellt am 9. Februar 2026*
