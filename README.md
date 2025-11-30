# Cachy - Trading Calculator & Journal

[![SvelteKit](https://img.shields.io/badge/SvelteKit-f1413d?style=for-the-badge&logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

Cachy ist eine umfassende Webanwendung für Krypto-Trader zur präzisen Berechnung von Positionsgrößen, Risikomanagement und zur Verwaltung eines Trading-Journals. Sie ist vollständig lokal (client-seitig), datenschutzfreundlich und unterstützt Echtzeit-Marktdaten von Bitunix und Binance.

![Cachy Dashboard](docs/images/dashboard-preview.png)
*(Hinweis: Ersetze diesen Pfad durch einen echten Screenshot, falls verfügbar)*

---

## 🚀 Features

### 🔢 Smarter Trading Rechner
*   **Risikomanagement:** Berechnet automatisch die optimale Positionsgröße basierend auf Kontogröße, Risiko (%) und Stop-Loss.
*   **Dual Locking System:** Sperre entweder die *Positionsgröße* (um Risiko anzupassen) oder den *Risikobetrag* (um Position anzupassen).
*   **ATR Integration:** Automatischer Abruf der Average True Range (ATR) von Binance oder Bitunix zur dynamischen Stop-Loss-Berechnung.
*   **Live-Preise:** Echtzeit-Preisabruf für Kryptowährungen.

### 🎯 Multi-Target Take Profit
*   **Partielle Exits:** Definiere bis zu 5 Take-Profit-Ziele.
*   **Auto-Balancing:** Prozentuale Verteilung passt sich automatisch an, um immer 100% zu ergeben.
*   **Detaillierte Metriken:** Berechnet Gewinn, R/R (Risk/Reward) und Netto-Ertrag pro Ziel und gesamt.

### 📓 Integriertes Journal & Presets
*   **Trade Journal:** Speichere deine Trades lokal, verfolge Status (Offen, Gewonnen, Verloren) und Notizen.
*   **CSV Import/Export:** Volle Kontrolle über deine Daten – exportiere dein Journal für Excel oder importiere Backups.
*   **Presets:** Speichere häufig genutzte Setups (z.B. "Scalping Strategy") für schnellen Zugriff.

### ⚙️ Anpassung & Technik
*   **Multi-API Support:** Wähle zwischen **Bitunix** und **Binance** als Datenquelle.
*   **Datenschutz:** Alle Daten (Journal, Einstellungen) liegen nur im `localStorage` deines Browsers.
*   **Themes:** Über 20 Farbthemen (Dark, Light, Dracula, Nord, etc.).
*   **Mehrsprachig:** Deutsch und Englisch.

---

## 🛠️ Installation & Entwicklung

### Voraussetzungen
*   Node.js (v18+)
*   npm

### Setup
1.  **Repository klonen:**
    ```bash
    git clone https://github.com/pheinze/cachy-app.git
    cd cachy-app
    ```

2.  **Abhängigkeiten installieren:**
    ```bash
    npm install
    ```

3.  **Development Server starten:**
    ```bash
    npm run dev
    ```
    Die App läuft nun unter `http://localhost:5173`.

### Tests
*   **Unit Tests (Vitest):**
    ```bash
    npm test
    ```
*   **Linting:**
    ```bash
    npm run lint
    ```

---

## 📦 Deployment

Die App ist eine SvelteKit-Anwendung und kann als Node.js-Server oder statische Seite (mit entsprechendem Adapter) deployt werden.

**Production Build:**
```bash
npm run build
```

**Starten (Node.js):**
```bash
npm start
# oder mit PM2
pm2 start build/index.js --name "cachy-app"
```
Siehe `DEPLOYMENT.md` für detaillierte Anweisungen.

---

## 📚 Dokumentation

*   **Benutzeranleitung:** Eine detaillierte Anleitung zur Nutzung der App findest du direkt in der Anwendung (über den "Anleitung"-Button) oder in `src/instructions/guide.de.md`.
*   **Entwickler-Guidelines:** Beachte `AGENT.md` für Code-Konventionen und Prozesse.
*   **Changelog:** Änderungen werden automatisch in `src/instructions/changelog.de.md` dokumentiert.

---

## 🤝 Contributing

Beiträge sind willkommen! Bitte folge diesen Schritten:

1.  Nutze [Conventional Commits](https://www.conventionalcommits.org/) für deine Commit-Messages (wichtig für automatische Versionierung).
2.  Erstelle für jedes Feature einen eigenen Branch (`feat/my-feature`).
3.  Stelle sicher, dass `npm test` und `npm run lint` erfolgreich durchlaufen.

---

## 📄 Lizenz

Dieses Projekt ist unter der MIT Lizenz veröffentlicht.
