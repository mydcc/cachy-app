# Guide: Master Your Trading with Cachy

Cachy is a comprehensive web application for crypto traders designed to precisely calculate position sizes, manage risk, and maintain a trading journal.
This guide helps you to understand the calculator tool and takes your trading to the next level.

The core of successful trading is **disciplined risk management**. Cachy is designed to help you with exactly that by automating the complex but crucial calculations for you.

---

### Table of Contents
1.  [The Standard Workflow: Calculating Position Size](#standard-workflow)
2.  [Alternative Workflows: The Lock Functions](#lock-functions)
3.  [Stop-Loss for Pros: The ATR Mode](#atr-mode)
4.  [Understanding the Risk/Reward Ratio (R/R)](#understanding-rr)
5.  [Conclusion](#conclusion)

---

### <a name="standard-workflow"></a>1. The Standard Workflow: Calculating Position Size

This is the most common use case. You define what percentage of your capital you want to risk, and Cachy calculates the **exact position size** you need to trade.

**Example Scenario:**

*   **Your Capital:** €10,000
*   **Your Risk per Trade:** 1% (which is €100)
*   **Asset:** BTC/USDT
*   **Planned Entry:** €50,000
*   **Planned Stop-Loss:** €49,500

**How the Calculation Works:**

**Step 1: Risk Amount in €**
First, your percentage risk is converted into a specific monetary amount.
```
Capital * (Risk % / 100)
// Example: €10,000 * (1 / 100) = €100
```

**Step 2: Risk per Unit**
Next, the app calculates how much you would lose per unit purchased (e.g., per "piece" of BTC) if your stop-loss is triggered.
```
|Entry Price - Stop-Loss Price|
// Example: |€50,000 - €49,500| = €500
```

**Step 3: The Position Size**
Now, your total risk amount is divided by the risk per unit. The result is the exact quantity of units (here: BTC) you need to buy.
```
Risk Amount / Risk per Unit
// Example: €100 / €500 = 0.2
```

**Result:** You need to buy exactly **0.2 BTC** to risk exactly €100.

**The Benefit for You:** No more guesswork. No "approximately." You know, down to the cent, that you are adhering to your risk limit, no matter how volatile the market is.

---

### <a name="lock-functions"></a>2. Alternative Workflows: The Lock Functions

Sometimes you want to perform the calculation the other way around. That's what the **lock buttons** (🔒) next to the Risk Amount and Position Size fields are for.

#### Scenario A: Locking the Risk Amount

*   **When to use it?** When you think in **fixed monetary amounts** ("I'll risk €50 on this trade") instead of percentages.

*   **How it works:**
    1.  Enter your desired risk amount (e.g., €50) into the "Risk Amount" field and click the lock icon.
    2.  The app will now automatically adjust the "Risk per Trade (%)" field for you.
    3.  All other calculations proceed as usual.

*   **Your Advantage:** Flexibility for traders who prefer to plan their risk in their currency rather than as a percentage.

#### Scenario B: Locking the Position Size

*   **When to use it?** When you want to trade a **fixed position size** (e.g., always 1 whole share, always 0.5 ETH).

*   **How it works:**
    1.  Lock the "Position Size" field and enter your desired size.
    2.  Now, adjust your entry and stop-loss.
    3.  The app now calculates **backwards** what your risk (in % and €) is with this position size and stop-loss.

*   **Your Advantage:** Perfect for strategies based on fixed trade sizes. You immediately see the risk consequences of your plan.

---

### <a name="atr-mode"></a>3. Stop-Loss for Pros: The ATR Mode

Setting a stop-loss is an art. The **ATR (Average True Range)** mode helps you by considering the current market volatility.

**What is the ATR?**
The ATR measures the **average price fluctuation** over a specific period (e.g., the last 14 days). A high ATR means high volatility; a low ATR means low volatility.

**How Cachy Calculates the ATR:**
Cachy fetches the candle data (High, Low, Close) for the last 15 periods for the chosen timeframe (e.g., 1D for 15 days). For each of the last 14 periods, the **"True Range"** is calculated, which is the largest of the following three values:
1.  `Current High - Current Low`
2.  `|Current High - Previous Close|`
3.  `|Current Low - Previous Close|`

The ATR is then the **average** of these 14 "True Range" values.

**How to Use the ATR Stop-Loss:**
1.  Activate the **"ATR Stop-Loss"** switch.
2.  Choose the mode:
    *   **Auto:** Cachy automatically fetches the current ATR value for the selected symbol and timeframe from the exchange.
    *   **Manual:** You enter your own ATR value.
3.  Enter a **Multiplier**. A common value is 2.
4.  The stop-loss is now calculated automatically:
    ```
    // Long Trade:
    Stop-Loss = Entry Price - (ATR Value * Multiplier)

    // Short Trade:
    Stop-Loss = Entry Price + (ATR Value * Multiplier)
    ```

**Your Advantage:** Your stop-loss is not arbitrary but intelligently adapts to the current market conditions. In high volatility, it gives the trade more room to breathe; in low volatility, it sits tighter to the price.

---

### <a name="understanding-rr"></a>4. Understanding the Risk/Reward Ratio (R/R)

The R/R is one of the most important metrics in trading. It tells you how much profit you expect in relation to your risk.

An **R/R of 1:1** means: you risk €100 to win €100.
An **R/R of 3:1** means: you risk €100 to win €300.

**How Cachy Displays R/R:**

*   **Individual R/R:** For each Take-Profit (TP) target, you see its own R/R. This allows you to assess the attractiveness of each individual target.
*   **Weighted R/R:** This is the average R/R for your entire trade, taking into account the percentage of your position you sell at each target.

**Your Advantage:** Cachy essentially forces you to think about your R/R. Trades with an R/R below 1:1 are often not profitable in the long run. With this tool, you can ensure that your potential profits systematically exceed your losses.

---

### <a name="conclusion"></a>5. Conclusion

Cachy is your partner for disciplined, data-driven trading. It takes the error-prone calculations off your hands, allowing you to focus on what matters: **your strategy and finding good trading setups.**
