# Cachy - How-To: A Guide to Using the Trading Calculator

Welcome to Cachy! This guide explains all the application's features to help you optimally plan and manage your trades.

**Important Note on Data Storage:** All your inputs, presets, and journal entries are stored **exclusively locally in your browser**. No data is sent to a server. This means your data is private, but it also means it can be lost if you clear your browser data.

---

### 1. The Basics: Trade Calculation

Cachy's main function is to calculate your position size and other important metrics based on your risk.

**Step 1: General Inputs**

*   **Long/Short:** Choose the direction of your trade.
*   **Leverage:** Enter the leverage you want to use (e.g., 10 for 10x).
*   **Fees (%):** Enter your exchange's percentage fees (e.g., 0.04 for 0.04%).

**Step 2: Portfolio Inputs**

*   **Account Size:** Enter the total size of your trading account.
*   **Risk/Trade (%):** Define the maximum percentage of your account you want to risk on this single trade (e.g., 1 for 1%).
*   **Risk Amount:** This field displays the calculated monetary amount based on your percentage risk. You can also enter a value directly and lock it.

**Step 3: Trade Setup**

*   **Symbol:** Enter the trading pair (e.g., BTCUSDT). Click the arrow button to load the current price.
*   **Entry Price:** The price at which you open the position.
*   **Stop Loss (SL):** The price at which your position is automatically closed to limit losses.
*   **Use ATR Stop Loss:** Activate this switch to calculate the SL using ATR (Average True Range).
    *   **Manual:** Enter the ATR value and a multiplier manually.
    *   **Auto:** Select a timeframe (e.g., 1h, 4h). The current ATR value is automatically fetched.

Once all these fields are filled in, you will see the results in the right-hand section.

---

### 2. Understanding the Results

Cachy calculates the following values for you:

*   **Position Size:** The amount of the asset you should buy/sell.
*   **Max Net Loss:** The maximum amount of money you will lose if your stop loss is hit.
*   **Required Margin:** The amount of capital that will be locked for this trade.
*   **Entry Fee:** The estimated fees for opening the position.
*   **Est. Liquidation Price:** An estimate of the price at which your position would be liquidated.
*   **Break Even Price:** The price at which you can close the position without making a profit or loss.

---

### 3. Defining Take-Profit (TP) Targets

You can set up to 5 take-profit targets to sell parts of your position at specific prices.

*   **Add Target:** Click the **`+`** button to add a new TP row.
*   **Price & Percent:** For each target, enter the price and the percentage of the position to be sold.
*   **Automatic Adjustment:** When you change the percentage of one target, the other (unlocked) targets are automatically adjusted so that the total is always 100%.
*   **Lock Percentage:** Click the lock icon to lock the percentage of a target.

For each valid TP target, you will see a detailed breakdown with metrics such as the **Net Profit** and the **Risk/Reward Ratio (RRR)**.

---

### 4. Advanced Features

Cachy offers a range of tools to optimize your workflow.

**Presets**

*   **Save:** Click the Save button (diskette icon) to save your current inputs as a preset.
*   **Load:** Select a saved preset from the dropdown menu to automatically fill in all input fields.
*   **Delete:** Select a preset and click the Delete button (trash can) to remove it.

**Advanced Locking Features**

Only one lock can be active at a time.

*   **Lock Position Size:** Click the lock icon next to the **Position Size**. When active, the position size remains constant. If you change the stop-loss, your **Risk/Trade (%)** and **Risk Amount** will be adjusted instead.
*   **Lock Risk Amount:** Click the lock icon next to the **Risk Amount**. When active, your maximum monetary loss is fixed. If you change the stop-loss, the **Position Size** and **Risk/Trade (%)** will be adjusted automatically.

**Trade Journal**

*   **Add Trade:** Click **"Add Trade to Journal"** to save the calculated trade.
*   **View Journal:** Click the **"Journal"** button in the top right to view your trades and change their status.
*   **Import/Export:** In the journal window, you can **export your journal as a CSV file** or **import** an existing one.

**Other Functions**

*   **Switch Theme:** Use the sun/moon icon to switch the theme.
*   **Switch Language:** At the bottom left, you can change the UI language.
*   **Reset All:** The broom button resets all input fields.

---

### 5. Keyboard Shortcuts

*   `Alt + L`: Switches the trade type to **Long**.
*   `Alt + S`: Switches the trade type to **Short**.
*   `Alt + R`: Resets all inputs (**Reset**).
*   `Alt + J`: Opens or closes the **Journal**.

---

### 6. Market Overview

The Market Overview card provides a quick glance at the current market data for the selected symbol.

*   **Display:** Shows the current price, 24h price change (in %), 24h high, 24h low, and 24h volume.
*   **Symbol Recognition:** Automatically adds a 'P' suffix (e.g., BTCUSDTP) if it is a perpetual future.
*   **Refresh:**
    *   **Manual:** Click the refresh icon to load data manually.
    *   **Automatic:** In the **Settings**, you can define an interval (10s or 1m) for the data to update automatically in the background.

---

### 7. Settings

In the Settings (gear icon), you can customize Cachy to your needs.

*   **API Provider:** Choose between **Bitunix** and **Binance** as the data source for prices and ATR values.
*   **Market Data Update:** Set how often the market overview should be updated (**Manual**, **Every 10s**, **Every 1m**).
*   **Theme & Language:** Select your preferred design and display language.
*   **Backup & Restore:** Create a full backup of your data (including journal and presets) as a file or restore data from a file.
