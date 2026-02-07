# Datenfluss Diagramm der Cachy-App

Hier ist ein Diagramm, das den Datenfluss der Cachy-App visualisiert, erstellt mit Mermaid.

```mermaid
graph TD
    subgraph "Browser des Benutzers"
        A[Benutzeroberfläche (UI Components)]
        B(LocalStorage)
    end

    subgraph "Frontend (SvelteKit SPA)"
        C[App Service (app.ts)]
        D[Svelte Stores (State)]
        E[Calculator Bridge (calculator.ts)]
        F[WebAssembly Modul (technicals.wasm)]
    end

    subgraph "Backend (API Proxy)"
        G[API Endpunkte (src/routes/api)]
    end

    subgraph "Externe Dienste"
        H[Externe Krypto-APIs (Bitunix, Bitget)]
        I[WebSocket Server (Echtzeit-Daten)]
    end

    %% --- Interaktionen ---
    A -- Benutzerinteraktion --> C
    C -- Aktualisiert / Liest --> D
    D -- Aktualisiert reaktiv --> A

    %% --- Datenabruf (Request/Response) ---
    C -- Fordet historische Daten an --> G
    G -- Ruft Daten ab von --> H
    H -- Sendet Rohdaten --> G
    G -- Sendet normalisierte Daten --> C

    %% --- Echtzeit-Daten (WebSocket) ---
    C -- Baut Verbindung auf zu --> I
    I -- Pusht Echtzeit-Preisdaten --> C

    %% --- Berechnungen (WASM) ---
    C -- Ruft Berechnungen auf --> E
    E -- Führt Funktionen aus in --> F
    F -- Gibt Ergebnisse zurück --> E
    E -- Gibt Ergebnisse zurück --> C

    %% --- Lokale Speicherung ---
    C -- Liest/Schreibt Journale & Voreinstellungen --> B

```

### Erläuterung des Diagramms:

*   **Browser des Benutzers**: Hier interagiert der Nutzer mit der **Benutzeroberfläche (A)** und hier werden seine persönlichen Daten im **LocalStorage (B)** gespeichert.
*   **Frontend (SvelteKit SPA)**: Das ist der Kern der Logik. Der **App Service (C)** steuert alles, verwaltet den Zustand in den **Svelte Stores (D)** und nutzt die **Calculator Bridge (E)**, um rechenintensive Operationen an das **WebAssembly Modul (F)** auszulagern.
*   **Backend (API Proxy)**: Die **API Endpunkte (G)** dienen nur dazu, Anfragen vom Frontend an die externen Dienste weiterzuleiten.
*   **Externe Dienste**: Dies sind die eigentlichen Datenquellen, entweder über traditionelle **Krypto-APIs (H)** für Vergangenheitsdaten oder einen **WebSocket Server (I)** für Live-Daten.
