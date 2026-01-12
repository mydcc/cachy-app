# Cachy Dashboard: Your Trading Cockpit

Welcome to Cachy! The Dashboard is your central control center for professional crypto trading. Here you plan your trades with precise calculations, maintain your journal, and keep track of your performance.

This guide shows you how to make optimal use of the Dashboard to take your trading to the next level.

---

### Table of Contents

1. [Dashboard Overview](#dashboard-overview)
   - [Main Areas](#main-areas)
   - [Navigation](#navigation)
2. [The Position Calculator](#position-calculator)
   - [Standard Workflow: Calculating Position Size](#standard-workflow)
   - [Lock Functions](#lock-functions)
   - [ATR Stop-Loss](#atr-stop-loss)
   - [Multiple Take-Profits](#multiple-take-profits)
   - [Risk/Reward Ratio](#risk-reward-ratio)
3. [From Calculator to Journal](#calculator-to-journal)
4. [The Trading Workflow](#trading-workflow)
5. [Best Practices & Tips](#best-practices)

---

<a id="dashboard-overview"></a>
## 1. Dashboard Overview

The Cachy Dashboard is your all-in-one solution for disciplined trading. It combines precise calculations with comprehensive performance analysis.

<a id="main-areas"></a>
### Main Areas

The Dashboard consists of three main areas:

**📊 Home / Dashboard**
- Overview and quick access
- Account balance display
- Access to all tool areas

**🧮 Position Calculator**
- Precise position size calculation
- Risk management tools
- ATR-based stop-loss calculation
- Multiple take-profit planning

**📖 Trading Journal**
- Detailed trade history
- Performance analyses and charts
- Tag-based strategy evaluation
- Deep Dive Analytics (Pro)

<a id="navigation"></a>
### Navigation

**Sidebar Menu (left):**
- **Home:** Back to homepage
- **Calculator:** Opens the Position Size Calculator
- **Journal:** Opens your Trading Journal
- **Settings:** Theme, language, account settings

**Top Bar:**
- **Account Balance:** Shows your current capital
- **Theme Toggle:** Switch between Light/Dark/VIP themes
- **Language Switcher:** DE/EN
- **Help:** Access to this guide

---

<a id="position-calculator"></a>
## 2. The Position Calculator

The Calculator is the heart of your risk management. It calculates for you how large your position must be to maintain exactly your desired risk.

**Why is this important?**
Successful trading is not gambling – it's a business with disciplined risk management. The Calculator ensures that you **never risk too much** and always know exactly what you're doing.

<a id="standard-workflow"></a>
### Standard Workflow: Calculating Position Size

This is the most common use case. You specify what percentage of your capital you want to risk, and the Calculator computes the **exact position size**.

#### Example Scenario:

**Your Inputs:**
- **Account Balance:** €10,000
- **Risk per Trade:** 1% (= €100)
- **Symbol:** BTC/USDT
- **Trade Type:** Long
- **Entry Price:** €50,000
- **Stop-Loss:** €49,500

#### The Calculation in 3 Steps:

**Step 1: Risk Amount in €**
```
Risk Amount = Account Balance × (Risk % / 100)
Example: €10,000 × 0.01 = €100
```

**Step 2: Risk per Unit**
```
Risk per Unit = |Entry Price - Stop-Loss Price|
Example: |50,000 - 49,500| = €500
```

**Step 3: Position Size**
```
Position Size = Risk Amount / Risk per Unit
Example: €100 / €500 = 0.2 BTC
```

**✅ Result:** You buy **0.2 BTC** at €50,000, with a stop-loss at €49,500. Your maximum risk is exactly €100 (1% of your capital).

**The Advantage:** No guessing, no "approximately". You know **down to the cent** that you're adhering to your risk limit.

---

<a id="lock-functions"></a>
### Lock Functions: Alternative Workflows

Sometimes you want to perform the calculation the other way around. That's what the **Lock Buttons** (🔒) are for.

#### Scenario A: Locking Risk Amount

**When to use?**
When you think in **fixed monetary amounts**: "I'm risking €50 today" (instead of percentages).

**How it works:**
1. Click the 🔒 next to "Risk Amount"
2. Enter your desired amount (e.g., €50)
3. The "Risk per Trade %" field is automatically adjusted

**Advantage:** Flexibility for traders who prefer to plan their risk in absolute amounts.

#### Scenario B: Locking Position Size

**When to use?**
When you want to trade a **fixed position size** (e.g., always 1 whole coin, always 0.5 ETH).

**How it works:**
1. Click the 🔒 next to "Position Size"
2. Enter your desired size
3. Adjust Entry and Stop-Loss
4. The Calculator now shows you **backwards** what your risk is with this size

**Advantage:** Perfect for strategies with fixed trade sizes. You immediately see the risk consequences.

---

<a id="atr-stop-loss"></a>
### ATR Stop-Loss: Volatility-Based Stop Placement

The **ATR (Average True Range)** Stop-Loss helps you intelligently adjust your stop to current market volatility.

#### What is the ATR?

The ATR measures the **average price fluctuation** over a period:
- **High ATR** = High volatility (market moves strongly)
- **Low ATR** = Low volatility (market moves calmly)

#### Calculation:

For the last 14 periods, the "True Range" is calculated:
```
True Range = Maximum of:
1. Current High - Current Low
2. |Current High - Previous Close|
3. |Current Low - Previous Close|

ATR = Average of the 14 True Ranges
```

#### How to use it:

1. **Activate** "ATR Stop-Loss"
2. **Choose the mode:**
   - **Auto:** Calculator automatically fetches the current ATR value from the exchange
   - **Manual:** You enter your own ATR value
3. **Set the Multiplier** (typical: 1.5 - 2.5)
4. **Stop-Loss is calculated:**
   ```
   Long:  Stop-Loss = Entry - (ATR × Multiplier)
   Short: Stop-Loss = Entry + (ATR × Multiplier)
   ```

#### Example:

- Entry: €50,000
- ATR: €800
- Multiplier: 2
- **Stop-Loss (Long):** 50,000 - (800 × 2) = **€48,400**

**Advantage:** Your stop adapts intelligently:
- High volatility → More room to breathe
- Low volatility → Tighter stop, less risk

---

<a id="multiple-take-profits"></a>
### Multiple Take-Profits: Gradual Exit

Professional traders don't sell their position all at once, but **gradually at multiple targets**.

#### How it works:

**Define up to 3 Take-Profit targets:**

**Take-Profit 1:**
- Price: €52,000
- Exit %: 50% (You sell half)
- R/R: 4:1

**Take-Profit 2:**
- Price: €54,000
- Exit %: 30%
- R/R: 8:1

**Take-Profit 3:**
- Price: €56,000
- Exit %: 20%
- R/R: 12:1

#### The Calculator shows you:

1. **Individual R/R** for each target
2. **Weighted R/R** (average, weighted by Exit %)
3. **Total Expected Profit** at all targets

**Advantage:**
- You secure profits early (TP1)
- Let winners run (TP2, TP3)
- Optimal risk-to-reward ratio

---

<a id="risk-reward-ratio"></a>
### Risk/Reward Ratio (R/R): The Most Important Metric

The R/R ratio shows you how much you can win in relation to your risk.

#### What does it mean?

- **1:1** → You risk €100 to win €100
- **2:1** → You risk €100 to win €200
- **3:1** → You risk €100 to win €300

#### Why is it important?

**Mathematical Example:**

With **50% Win Rate** and **2:1 R/R**:
- 10 Trades: 5 winners × €200 = €1,000
- 10 Trades: 5 losers × €100 = -€500
- **Net: +€500 profit**

With **50% Win Rate** but **1:1 R/R**:
- 10 Trades: 5 winners × €100 = €500
- 10 Trades: 5 losers × €100 = -€500
- **Net: ±€0 (Breakeven)**

**The Rule:** 
- R/R < 1:1 → Long-term you lose money
- R/R ≥ 2:1 → Good trading opportunities
- R/R ≥ 3:1 → Excellent setups

**The Calculator shows you:**
- Individual R/R for each TP
- Weighted Average R/R for the entire trade

**Cachy forces you** to think about your R/R – that's the key to long-term success!

---

<a id="calculator-to-journal"></a>
## 3. From Calculator to Journal

The Calculator plans your trade – the **Journal documents and analyzes** it.

### The Perfect Workflow:

1. **Calculator:** Plan trade
   - Calculate position size
   - Set stop-loss and TPs
   - Check R/R

2. **Broker:** Execute trade
   - Place order based on Calculator values

3. **Journal:** Document trade
   - Automatic import (Bitunix API)
   - Or manual addition
   - Add tags (strategy, setup, etc.)
   - Upload screenshot

4. **Journal:** Analyze trade
   - View performance charts
   - Compare strategies
   - Identify mistakes
   - Derive optimizations

### Quick Access:

- Click **"Journal"** in the sidebar
- Or use the **"Save to Journal"** button (if available)

---

<a id="trading-workflow"></a>
## 4. The Trading Workflow: Plan → Execute → Analyze

Successful trading is a **repeatable process**:

### Phase 1: PLAN (Calculator)

**Before each trade:**
1. Define your risk (e.g., 1%)
2. Identify entry point
3. Set stop-loss (manual or ATR)
4. Define take-profit(s)
5. Check the R/R ratio
   - R/R < 2:1? → Skip trade!
   - R/R ≥ 2:1? → Trade is valid

**✅ Rule:** Never enter a trade without prior calculation!

### Phase 2: EXECUTE (Broker)

**At the broker:**
1. Place order with exact values from Calculator
2. Set stop-loss and TPs
3. Make notes (setup, feeling, etc.)

**✅ Rule:** Stick strictly to your plan!

### Phase 3: DOCUMENT (Journal)

**After trade completion:**
1. Enter trade in journal
   - Automatically via API sync
   - Or add manually
2. Add tags:
   - Strategy: `Breakout`, `Support/Resistance`, etc.
   - Mistakes: `FOMO`, `Revenge`, etc.
3. Upload screenshot
4. Add notes

**✅ Rule:** Document EVERY trade, including losers!

### Phase 4: ANALYZE (Journal Deep Dive)

**Weekly/Monthly:**
1. View performance charts
2. Check Win Rate and Profit Factor
3. Compare strategies (which tags work?)
4. Time analysis (which times of day are profitable?)
5. Identify and eliminate mistakes

**✅ Rule:** Let the data guide your decisions, not your gut feeling!

---

<a id="best-practices"></a>
## 5. Best Practices & Tips

### ✅ DO's (Do This!)

**In the Calculator:**
- ✅ **Use it ALWAYS** before each trade
- ✅ **Keep your risk constant** (e.g., always 1%)
- ✅ **Check the R/R** – only enter trades ≥ 2:1
- ✅ **Use ATR** for intelligent stop placement
- ✅ **Multiple TPs** for better risk management

**In the Journal:**
- ✅ **Document every trade** immediately after completion
- ✅ **Use tags** consistently for strategies and mistakes
- ✅ **Upload screenshots** for visual analysis
- ✅ **Conduct weekly reviews**
- ✅ **Learn from losses** – they are your best teachers

### ❌ DON'Ts (Avoid This!)

**In the Calculator:**
- ❌ **No trades** without prior calculation
- ❌ **Don't deviate** from the calculated plan
- ❌ **No "gut feeling"** for position sizes
- ❌ **No trades with R/R < 1:1**

**In the Journal:**
- ❌ **Don't forget** to document
- ❌ **No emotional notes** ("Shit!", "Fuck!")
  - Better: objective analysis ("Entry too early", "SL too tight")
- ❌ **Don't only document winners**
  - Losers are more important for your learning!

### 🎯 Pro Tips

**1. Consistency is King**
- Always trade with the same risk (e.g., 1%)
- Always use the same Calculator workflow
- Always document according to the same scheme

**2. The 2% Maximum**
- Never risk more than 2% per trade
- Better: 0.5% - 1% for beginners
- Only experienced traders: up to 2%

**3. The 6% Rule**
- Maximum 6% total risk simultaneously
- Example: 3 open trades × 2% = 6%
- More open trades? Reduce risk per trade!

**4. Stop-Loss is Sacred**
- **NEVER** move the stop to avoid losses
- If the stop doesn't fit, replan the trade
- Better no trade than one without a reasonable stop

**5. Turn Off Emotions**
- After 2 losses in a row: PAUSE
- After big win: PAUSE (Overconfidence!)
- Tired, stressed, emotional? NO TRADING

---

## Conclusion

The Cachy Dashboard is your **complete trading ecosystem**:

- **Calculator:** Precise risk management
- **Journal:** Data-driven analysis
- **Workflow:** From planning to optimization

**The Key to Success:**
1. Plan **every** trade in the Calculator
2. Stick **strictly** to your plan
3. Document **everything** in the Journal
4. Analyze **regularly** your performance
5. Learn from **every** trade

**Trading is not a sprint, it's a marathon.**  
Cachy gives you the tools for long-term, sustainable success.

🚀 **Good luck with your trading!**
