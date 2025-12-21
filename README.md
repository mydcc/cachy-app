# Cachy - Position Size &  Risk Management

[![SvelteKit](https://img.shields.io/badge/SvelteKit-f1413d?style=for-the-badge&logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

Cachy is a comprehensive web application for crypto traders designed to precisely calculate position sizes, manage risk, and maintain a trading journal. It is entirely local (client-side), privacy-focused, and supports real-time market data from Bitunix and Binance.

![Cachy Dashboard](docs/images/dashboard-preview.png)
*(Note: Replace this path with a real screenshot if available)*

---

## 🚀 Features

### 🔢 Smart Trading Calculator
*   **Risk Management:** Automatically calculates the optimal position size based on account size, risk (%), and stop loss.
*   **Dual Locking System:** Lock either the *Position Size* (to adjust risk) or the *Risk Amount* (to adjust position size).
*   **ATR Integration:** Automatic fetching of Average True Range (ATR) from Binance or Bitunix for dynamic stop-loss calculations.
*   **Live Prices:** Real-time price fetching for cryptocurrencies.

### 🎯 Multi-Target Take Profit
*   **Partial Exits:** Define up to 5 take-profit targets.
*   **Auto-Balancing:** Percentage distribution automatically adjusts to always total 100%.
*   **Detailed Metrics:** Calculates profit, R/R (Risk/Reward), and net return per target and in total.

### 📓 Integrated Journal & Presets
*   **Trade Journal:** Save your trades locally, track status (Open, Won, Lost), and notes.
*   **CSV Import/Export:** Full control over your data – export your journal for Excel or import backups.
*   **Presets:** Save frequently used setups (e.g., "Scalping Strategy") for quick access.

### ⚙️ Customization & Tech
*   **Multi-API Support:** Choose between **Bitunix** and **Binance** as your data source.
*   **Privacy:** All data (journal, settings) is stored only in your browser's `localStorage`.
*   **Themes:** Over 20 color themes (Dark, Light, Dracula, Nord, etc.).
*   **Multilingual:** German and English support.

---

## 🛠️ Installation & Development

### Prerequisites
*   Node.js (v18+)
*   npm

### Setup
1.  **Clone Repository:**
    ```bash
    git clone https://github.com/mydcc/cachy-app.git
    cd cachy-app
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Start Development Server:**
    ```bash
    npm run dev
    ```
    The app is now running at `http://localhost:5173`.

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

The app is a SvelteKit application and can be deployed as a Node.js server or a static site (with the appropriate adapter).

**Production Build:**
```bash
npm run build
```

**Start (Node.js):**
```bash
npm start
# or with PM2
pm2 start build/index.js --name "cachy-app"
```
See `DEPLOYMENT.md` for detailed instructions.

---

## 📚 Documentation

*   **User Guide:** A detailed guide on how to use the app can be found directly within the application (via the "Guide" button) or in `src/instructions/guide.en.md`.
*   **Developer Guidelines:** Refer to `AGENT.md` for coding conventions and processes.
*   **Changelog:** Changes are automatically documented in `src/instructions/changelog.en.md`.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1.  Use [Conventional Commits](https://www.conventionalcommits.org/) for your commit messages (important for automated versioning).
2.  Create a separate branch for each feature (`feat/my-feature`).
3.  Ensure that `npm test` and `npm run lint` pass successfully.

---

## 📄 License

This project is published under the MIT License.
