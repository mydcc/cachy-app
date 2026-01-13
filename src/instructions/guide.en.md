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

### Favorites

You can save up to **4 favorite symbols** for quick access.

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

### Performance Tracking (Pro)

Users with Pro status have access to advanced analytics in the Journal:

#### Dashboard Charts

- **Equity Curve:** Visualizes the growth of your account balance over time.
- **Drawdown:** Shows the percentage decline from your account's peak.
- **Monthly PnL:** Bar chart of profit/loss aggregated by month.

#### Deep Dive Analytics

The "Deep Dive" section offers granular insights into your trading behavior:

- **Timing:** Analyze which time of day or day of the week is most profitable for you.
- **Assets:** A bubble chart showing which coins perform best (Win Rate vs PnL).
- **Risk:** Scatter plot correlating Risk Amount vs. Realized PnL. Are you risking too much on losing trades?
- **Strategies:** Tag your trades (e.g., "Breakout", "Reversal") and see which strategies yield the best results.
- **Psychology:** Tracks winning and losing streaks to help you identify tilt or flow states.

---

## 4. Settings & Configuration

Access settings via the Gear icon.

### API Provider

- **Bitunix (Recommended):** Supports full Websocket integration (real-time data), position syncing, and order management.
- **Binance:** Supports market data and basic account balance fetching.

### Data Backup

Since Cachy is local-only, your data is your responsibility.

- **Backup:** Go to Settings -> System -> **Create Backup**. This downloads a JSON file with all your settings, journal entries, and presets.
- **Restore:** Use **Restore from Backup** to load a previously saved JSON file.

### Customization

- **Themes:** Choose from over 20 distinct themes (e.g., 'Midnight', 'Dracula', 'Nord').
- **Hotkeys:** Customize keyboard shortcuts for speed (e.g., `S` for Short, `L` for Long).

---

_Happy Trading!_
