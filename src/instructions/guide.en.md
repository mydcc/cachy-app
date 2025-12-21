# Cachy - How-To: A Guide to Using the Trading Calculator

Welcome to Cachy! This guide explains all the features of the application so you can plan and manage your trades optimally.

**Important Note on Data Storage:** All your inputs, presets, and journal entries are stored **exclusively locally in your browser**. No data is sent to a server. This means your data is private, but it also means it can be lost if you clear your browser data.

---

### 1. The Basics: Trade Calculation

The main function of Cachy is to calculate your position size and other important metrics based on your risk.

**Step 1: General Inputs**

*   **Long/Short:** Choose the direction of your trade.
*   **Leverage:** Enter the leverage you want to use (e.g., 10 for 10x).
*   **Fees %:** Enter the percentage fees of your exchange (e.g., 0.04 for 0.04%).

**Step 2: Portfolio Inputs**

*   **Account Size:** Enter the total size of your trading account. You can also have your balance fetched automatically if you have configured your API keys (see Settings).
*   **Risk/Trade (%):** Determine the maximum percentage of your account you want to risk on this single trade (e.g., 1 for 1%).
*   **Risk Amount:** This field shows the monetary amount calculated from your percentage risk. You can also enter this amount directly and lock it.

**Step 3: Trade Setup**

*   **Symbol:** Enter the trading pair (e.g., BTCUSDT). Click the arrow button to load the current price.
*   **Entry Price:** The price at which you open the position.
*   **Stop Loss (SL):** The price at which your position is automatically closed to limit losses.
*   **Use ATR Stop Loss:** Enable this toggle to calculate the SL using ATR (Average True Range).
    *   **Manual:** Enter the ATR value and a multiplier manually.
    *   **Auto:** Select a timeframe (e.g., 1h, 4h). The current ATR value is automatically fetched.

Once all these fields are filled, you will see the results in the right panel.

---

### 2. Understanding the Results

Cachy calculates the following values for you:

*   **Position Size:** The amount of the asset you should buy/sell.
*   **Max Net Loss:** The maximum amount of money you lose if your Stop Loss is hit.
*   **Required Margin:** The capital blocked from your account for this trade.
*   **Entry Fee:** The estimated fees for opening the position.
*   **Est. Liquidation Price:** An estimate of the price at which your position would be liquidated.
*   **Break Even Price:** The price at which you exit with zero profit or loss.

---

### 3. Defining Take-Profit (TP) Targets

You can define up to 5 Take-Profit targets to sell parts of your position at specific prices.

*   **Add Target:** Click the **`+`** button to add a new TP row.
*   **Price & Percent:** Enter the price and the percentage of the position to be sold for each target.
*   **Auto-Adjustment:** If you change the percentage of a target, the others (not locked) are automatically adjusted so the total equals 100%.
*   **Lock Percentage:** Click the lock icon to lock a target's percentage value.

For each valid TP target, you see a detailed breakdown with metrics like **Net Profit** and **Risk-Reward Ratio (RRR)**.

---

### 4. Advanced Features

Cachy offers a range of tools to optimize your workflow.

**Presets**

*   **Save:** Click the Save button (floppy disk icon) to save your current inputs as a preset.
*   **Load:** Select a saved preset from the dropdown menu to automatically fill all input fields.
*   **Delete:** Select a preset and click the Delete button (trash can) to remove it.

**Advanced Locking Functions**

Only one lock can be active at a time.

*   **Lock Position Size:** Click the lock icon next to **Position Size**. When active, the position size remains constant. If you change the Stop Loss, your **Risk/Trade (%)** and **Risk Amount** are adjusted instead.
*   **Lock Risk Amount:** Click the lock icon next to **Risk Amount**. When active, your maximum loss in currency remains constant. If you change the Stop Loss, the **Position Size** and **Risk/Trade (%)** are adjusted.

**Trade Journal**

*   **Add Trade:** Click **"Add Trade to Journal"** to save the calculated trade.
*   **View Journal:** Click the **"Journal"** button at the top right to view your trades and change their status.
*   **Import/Export:** In the Journal window, you can **export your journal as a CSV file** or **import** an existing CSV file.

**Other Functions**

*   **Switch Theme:** Use the sun/moon icon to switch the design.
*   **Switch Language:** Change the interface language at the bottom left.
*   **Reset All:** The broom button resets all input fields.

---

### 5. Keyboard Shortcuts

*   `Alt + L`: Sets trade type to **Long**.
*   `Alt + S`: Sets trade type to **Short**.
*   `Alt + R`: Resets all inputs (**Reset**).
*   `Alt + J`: Opens or closes the **Journal**.

---

### 6. Market Overview & Favorites

The Market Overview offers a quick look at current market data for the selected symbol.

*   **Display:** Shows current price, 24h price change (in %), 24h High, 24h Low, and 24h Volume.
*   **Symbol Detection:** Automatically adds a 'P' suffix (e.g., BTCUSDTP) if it's a perpetual future.
*   **Favorites:** Click the **Star icon** to add the current symbol to your favorites list (maximum 4). Saved favorites appear in the sidebar (desktop) or below the main card (mobile) and can be loaded directly into the calculator by clicking on them.
*   **Updates:**
    *   **Manual:** Click the Refresh icon to load data manually.
    *   **Automatic:** In **Settings**, you can set an interval so data updates automatically in the background.

---

### 7. Settings

In Settings (gear icon), you can customize Cachy to your needs.

*   **Language:** Choose between German and English.
*   **API Provider:** Choose between **Bitunix** (Default) and **Binance** as the data source for prices and ATR values.
*   **API Integration:**
    *   Enter your API Keys for Bitunix or Binance (Key & Secret).
    *   **Auto-fetch Balance:** If enabled, your account balance is fetched automatically when the app starts (requires API Keys).
    *   **Auto-update Price Input:** If enabled, the price in the "Entry Price" input is updated regularly as long as you are not editing the field.
*   **Market Data Update:** Set how often the market overview and prices should update (**1s**, **1m**, **10m**).
*   **Theme:** Select your preferred design.
*   **Backup & Restore:** Create a backup of all your data (including journal and presets) as a JSON file or restore data from a file.
