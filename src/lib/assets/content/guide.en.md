# Cachy - User Manual

Welcome to Cachy! This guide is your comprehensive manual for using the application effectively for your trading. It covers everything from basic position calculation to advanced performance analysis.

**Privacy Note:** Cachy operates entirely client-side. All your data (settings, journal, API keys) is stored locally in your browser (`localStorage`). No data is sent to any external server (except for direct API requests to exchanges you configure).

---

## 1. Trading Calculator

The core of Cachy is the precision calculator, designed to help you manage risk and size your positions correctly.

### Inputs

The calculator is divided into three main sections:

#### A. General Inputs

- **Long/Short:** Select your trade direction.
- **Leverage:** Input your leverage (e.g., `10` for 10x). This affects the **Required Margin**.
- **Fees %:** Enter your exchange's fee rate (e.g., `0.06`). This is used to calculate Break-Even prices and estimated costs.

#### B. Portfolio Inputs

- **Account Size:** Your total trading capital.
  - _Tip:_ If you connect your API keys, this can be fetched automatically.
- **Risk per Trade (%):** The percentage of your account you are willing to lose if the Stop Loss is hit.
- **Risk Amount ($):** The absolute dollar amount you are willing to lose.

**The Locking Mechanism:**
Cachy allows you to lock specific variables to fit your workflow:

- **Lock Risk Amount ($):** Useful if you want to risk a fixed dollar amount (e.g., $50) regardless of the stop loss distance. The calculator will adjust your position size accordingly.
- **Lock Position Size:** Useful if you want to trade a fixed quantity (e.g., 1 BTC). The calculator will show you how much risk (%) that entails based on your stop loss.

#### C. Trade Setup

- **Symbol:** The trading pair (e.g., `BTCUSDT`).
- **Entry Price:** Your planned entry price.
- **Stop Loss (SL):** The price where your trade becomes invalid.
  - **ATR Mode:** Toggle `Use ATR` to automatically calculate a Stop Loss based on market volatility (Average True Range). You can choose the timeframe (e.g., `15m`, `1h`) and a multiplier (e.g., `1.5` x ATR).

### Formulas

Here is how Cachy calculates the key metrics for you:

**1. Risk Amount**
$$ \text{Risk Amount} = \text{Account Size} \times \frac{\text{Risk \%}}{100} $$

**2. Risk Per Unit**
$$ \text{Risk Per Unit} = |\text{Entry Price} - \text{Stop Loss}| $$

**3. Position Size**
$$ \text{Position Size} = \frac{\text{Risk Amount}}{\text{Risk Per Unit}} $$

**4. Order Volume (Notional Value)**
$$ \text{Order Volume} = \text{Position Size} \times \text{Entry Price} $$

**5. Required Margin**
$$ \text{Required Margin} = \frac{\text{Order Volume}}{\text{Leverage}} $$

**6. Break-Even Price (Long)**
$$ \text{Break Even} = \text{Entry Price} \times \frac{1 + \text{Fee Rate}}{1 - \text{Fee Rate}} $$

---

## 2. Market Overview & Sidebar

Cachy provides real-time market awareness tools.

### Market Overview

Located at the top (or accessible via sidebar on mobile), this panel shows real-time data for the selected symbol:

- **Live Price:** Updates in real-time via Websockets (if Bitunix is selected).
- **24h Stats:** Change %, High, Low, and Volume.
- **Funding Rate:** Current funding rate (green = positive, red = negative).
- **Countdown:** Time remaining until the next funding payment.

### Technicals Panel

This panel provides deeper technical analysis (Oscillators & Pivots).

**What data is shown there?**
In the "Technicals" Panel you will see two types of indicators:

- **Oscillators (RSI, Stochastic, CCI...):** These measure the "momentum" of the price. They indicate whether a market is "overbought" (too expensive, could fall -> Sell) or "oversold" (too cheap, could rise -> Buy). These values may change live, but not erratically.
- **Pivots (P, R1, S1...):** These are static price levels that serve as Support (S) or Resistance (R).

**How and why are Pivot Points calculated?**
Pivot Points serve as a guide. Traders use them to find targets for profits (Take Profit at R1/R2) or entries. They are calculated purely mathematically from the previous candle (which is why they must be fixed as long as the current candle is running).

**The Basic Formula (Classic):**

- **P (Pivot Point):** The average price of the last period.

  $$ P = \frac{\text{High} + \text{Low} + \text{Close}}{3} $$

- **R1 (First Resistance):**
  $$ R1 = (2 \times P) - \text{Low} $$
- **S1 (First Support):**
  $$ S1 = (2 \times P) - \text{High} $$

### Visual Risk/Reward Bar (VisualBar)

Below the input fields, an interactive **VisualBar** visualizes your trade setup:

**What you see:**

- **Red area (left):** Your risk, from the stop loss up to your entry point.
- **Green area (right):** Your profit potential, from entry to your take profits.
- **White markers:** The exact SL, Entry and TP price levels.
- **TP labels:** The Risk/Reward ratio above each take profit (e.g. "2.5R").

**Why it helps:** At a glance you can tell whether a trade has a healthy
Risk/Reward profile — a worthwhile setup shows clearly more green (profit) than
red (risk).

### Favorites

You can save up to **12 favorite symbols** for quick access. On the calculator
page, the first 4 appear as quick-select tiles.

- **Add:** Click the Star icon in the Market Overview.
- **Access:** Click on a favorite in the Sidebar (Desktop) or the Favorites Bar (Mobile) to instantly load it into the calculator.

### Sidebar (Positions)

The sidebar provides a comprehensive view of your active trading environment:

- **Open Positions:** Shows active positions synced from your exchange.
- **Open Orders:** Shows pending limit or stop orders.
- **History:** Shows recent trade history.
- **TP/SL:** Dedicated tab for managing Take-Profit and Stop-Loss orders (Bitunix).

---

## 3. Trade Journal

The Journal is where you track your performance. It supports both manual entry and automatic synchronization.

### Manual vs. Synced

- **Manual:** You click "Add to Journal" after calculating a trade. You manually update the status (Won/Lost) and exit price.
- **Synced (Bitunix):** If you use Bitunix and have API keys configured, Cachy can automatically import your trade history, including realized PnL and fees.

### Performance Tracking

The Journal analytics are available to all users:

#### Dashboard Charts

- **Equity Curve:** Visualizes the growth of your account balance over time.
- **Drawdown:** Shows the percentage decline from your account's peak.
- **Monthly PnL:** Bar chart of profit/loss aggregated by month.

#### Deep Dive Analytics

The "Deep Dive" section offers ten specialized analytics tabs:

- **Performance:** Trends of your results over time.
- **Execution:** The quality of your entries and exits.
- **Risk:** How your risk amount correlates with realized PnL.
- **Market:** How the market environment shaped your outcomes.
- **Leakage:** Where fees, slippage and avoidable mistakes eat your profit.
- **Time:** Which time of day or day of week is most profitable for you.
- **Strategies:** Tag your trades (e.g., "Breakout", "Reversal") and see which strategies yield the best results.
- **Behavior:** Winning and losing streaks that help you spot tilt or flow states — including your asset distribution.
- **Forecast:** A Monte Carlo simulation based on your history.
- **System Quality:** How clean and complete your journal record keeping is.

---

## 4. Settings & Configuration

Access settings via the Gear icon.

### Access Token (App Access Token)

Cachy protects your own server's API routes with **self-issued access tokens**:
On the first call to a protected API route, the app automatically obtains an
anonymous token from your own server (`POST /api/auth/token`) and stores it in
your browser. There is nothing to configure and no secret to paste.

This is **not** an exchange key and not an account password. The token
identifies your browser to your server so that other visitors cannot ride along
on your API routes. The server stores only a hash of the token — never the
token itself.

- **View/Reset:** Settings → Connections → **Access Token**. The **"Create access token"** button replaces the stored token with a freshly issued one — normally never needed, since the app manages this itself.
- **Server restarts:** Tokens live in the server process's memory. After a restart, the app automatically mints a new one and retries.
- **If something looks broken:** Balance not loading and `401 (Unauthorized)` in the console usually resolves with a page reload; see the troubleshooting section of the installation guide (`docs/INSTALL.md`).

### API Provider

- **Bitunix (Recommended):** Supports full Websocket integration (real-time data), position syncing, and order management.
- **Bitget:** Supports market data and basic account balance fetching.

### Data Backup

Since Cachy is local-only, your data is your responsibility.

- **Backup:** Go to Settings -> System -> **Create Backup**. This downloads a JSON file with all your settings, journal entries, and presets.
  - **Optional:** Enable **"Encrypt backup"** and choose a strong password.
  - With encryption enabled, all API keys and sensitive data are protected with AES-256 encryption.
- **Restore:** Use **Restore from Backup** to load a previously saved JSON file.
  - For encrypted backups you have to enter the correct password.
  - **Note:** A wrong password results in a "Decryption failed" error.

**Keep your backup password safe!** An encrypted backup cannot be restored without it.

### Customization

- **Themes:** Choose from 28 distinct themes (e.g., 'Midnight', 'Dracula', 'Nord').
- **Hotkeys:** Customize keyboard shortcuts for speed. By default (Safety mode) they are `Alt+S` for Short and `Alt+L` for Long; the Direct modes bind the plain `S` and `L` keys.
- **Debug Mode:** Enable detailed system logs in the browser console for troubleshooting.

### Side Panel

The dockable side panel has three modes: **AI Assistant**, **Quick Notes** and
(opt-in) **Global Chat**. Click the panel's title to cycle between modes; show
or hide it under **Settings -> Visuals**.

- **Quick Notes:** Store notes locally in your browser only.
- **AI Assistant:** Interact with the context-aware AI for market analysis.
- **Global Chat:** Opt-in community chat, disabled by default.

---

_Happy Trading!_
