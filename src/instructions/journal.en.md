
## The Trading Journal: Your Compass for Consistent Growth

Trading is not gambling – it is a business. And every successful business needs precise accounting and analysis. Your Trading Journal is more than just a list of transactions; it is the key to understanding your behavior, optimizing your strategy, and advancing from amateur to professional.

This guide explains **every single feature** and **every chart** in detail – from basic operation to advanced Deep Dive analyses.

---

### Table of Contents

1. [The Philosophy: Plan & Execute](#philosophy)
2. [Getting Started](#getting-started)
   - [Journal Overview & Navigation](#journal-overview)
   - [Data Management](#data-management)
   - [Filter & Search Functions](#filter-search)
   - [Tags & Notes System](#tags-notes)
   - [Pivot Mode (Pro)](#pivot-mode)
3. [Performance Dashboard](#performance-dashboard)
   - [Performance Tab](#perf-tab)
   - [Quality Tab](#quality-tab)
   - [Direction Tab](#direction-tab)
   - [Discipline Tab](#discipline-tab)
   - [Costs Tab](#costs-tab)
4. [Deep Dive Analytics (Pro)](#deep-dive)
   - [Forecast](#dd-forecast)
   - [Trends](#dd-trends)
   - [Leakage](#dd-leakage)
   - [Timing](#dd-timing)
   - [Assets](#dd-assets)
   - [Risk](#dd-risk)
   - [Market](#dd-market)
   - [Psychology](#dd-psychology)
   - [Strategies](#dd-strategies)
   - [Calendar](#dd-calendar)
5. [Formulas & Calculations](#formulas)
6. [Best Practices & Tips](#best-practices)

---

<a id="philosophy"></a>
### The Philosophy: Plan & Execute

Successful trading is based on a repeatable process. The **Calculator** and the **Journal** work hand in hand:

1. **Plan (Calculator):** You define your risk BEFORE the trade. Where is the entry? Where is the Stop-Loss? What % of your capital are you risking?
   - *The Calculator ensures you never enter a trade blindly.*

2. **Execute (Broker):** You place the trade based on the calculated values.

3. **Document (Journal):** Once the trade is closed (automatically via API or manually), it lands in the journal.
   - *This is where the real work begins: Analysis.*

4. **Optimize:** You use the analytics and charts to identify patterns. Do you often lose on Fridays? Are your Longs more profitable than Shorts? Which strategy works?

---

<a id="getting-started"></a>
## Getting Started

<a id="journal-overview"></a>
### Journal Overview & Navigation

The Journal consists of two main areas:

1. **Dashboard Area (top):** Here you choose between different analytical views:
   - **Performance Dashboard:** The 5 main tabs (Performance, Quality, Direction, Discipline, Costs)
   - **Deep Dive:** 10 specialized analysis tabs for Pro users

2. **Table Area (bottom):** Shows all your trades in a detailed overview with filter and sort functions.

<a id="data-management"></a>
### Data Management

**Data Sources:**

- **Sync (Bitunix):** Automatically fetches your trading history from the broker. PnL, fees, and funding are imported exactly. Use the "Sync" button to fetch new trades.

- **CSV Import:** Import trades from other sources or backup files. Pay attention to the correct format.

- **CSV Export:** Your data belongs to you! Use the export for external backups or Excel analyses.

- **Screenshots:** Upload chart screenshots for each trade. A picture is worth 1000 numbers – save your setup and execution visually.

<a id="filter-search"></a>
### Filter & Search Functions

The toolbar above the table offers several filters:

- **Search Field:** Search for symbols (e.g., "BTC") or tags (e.g., "Breakout")
- **Status Filter:** Show only Won, Lost, or Open trades
- **Date Filter:** From/To for time range selection
- **Column Settings:** Via the gear icon you can choose which columns to display

<a id="tags-notes"></a>
### Tags & Notes System

**Tags are your most powerful tool for qualitative analysis!**

**How to use:**
- Use tags for **Strategies:** `Breakout`, `SFP`, `Trendline`, `Support/Resistance`, `News`
- Use tags for **Mistakes:** `FOMO`, `Revenge`, `FatFinger`, `TooEarly`, `TooLate`
- Use tags for **Setup Types:** `LongSetup`, `ShortSetup`, `Scalp`, `Swing`

**Why important:**
Later in **Deep Dive → Strategies** you can see exactly which strategy prints money and which burns it. Without tags, no strategy analysis!

**Notes:**
Write brief notes for each trade: What was the plan? How did you feel? What went well/badly?

<a id="pivot-mode"></a>
### Pivot Mode (Pro)

**What is it?**
Groups all trades by symbols and shows aggregated statistics.

**What do I see?**
- Symbol
- Number of trades (of which won)
- Win Rate per symbol
- Total PnL per symbol

**What to use it for?**
Immediately recognize which assets you harmonize with and which coins destroy your account. Focus on profitable symbols!

---

<a id="performance-dashboard"></a>
## Performance Dashboard

The Performance Dashboard offers 5 specialized views. Choose between tabs in the dropdown at the top.

<a id="perf-tab"></a>
### 1. Performance Tab

This tab shows the **health of your account** at a glance.

#### 📈 Equity Curve (Capital Development)

**What does it show?**
The development of your capital over time. Each trade changes the curve upward (profit) or downward (loss).

**How to read:**
- **X-Axis:** Time progression (date)
- **Y-Axis:** Capital in $
- **Line:** Your current account balance after each trade

**Interpretation:**
- **Ideal curve:** Smooth from bottom left to top right → Consistent growth
- **Sharp zigzags:** Inconsistent risk management or too large position sizes
- **Sideways phases:** Breakeven periods, no progress
- **Strong downward movement:** Drawdown phase, analysis urgently required!

**Action recommendations:**
- With sharp zigzags: Reduce position size
- With sideways movement: Pause and analyze your strategy
- With drawdown: STOP! Go back to demo account or pause

#### 📉 Drawdown Chart

**What does it show?**
How far are you from your previous peak (All-Time High)? The drawdown is the "pain indicator".

**How to read:**
- **X-Axis:** Time progression
- **Y-Axis:** Drawdown in % (always negative or 0)
- **0%:** New All-Time High
- **-20%:** You are 20% below your previous peak

**Interpretation:**
- **0% - 5%:** Healthy, normal fluctuations
- **5% - 15%:** Moderate correction, monitor
- **15% - 25%:** Critical! Review strategy
- **> 25%:** ALARM! Pause immediately and error analysis

**Important to understand:**
A 50% drawdown requires 100% profit to recover! Keep drawdowns small.

**Formula:**
```
Drawdown % = ((Current Capital - All-Time High) / All-Time High) × 100
```

#### 📊 Monthly PnL (Monthly Profit/Loss)

**What does it show?**
Your consistency over months. Each bar = one month.

**How to read:**
- **X-Axis:** Months
- **Y-Axis:** PnL in $
- **Green bars:** Profit month
- **Red bars:** Loss month

**Interpretation:**
- **Many green bars:** Consistently profitable ✅
- **Mixed green/red:** Inconsistent, need for improvement
- **Red bars larger than green:** Not profitable long-term ❌

**Action recommendations:**
- Goal: At least 60% green months
- Analyze red months precisely: What was different?

---

<a id="quality-tab"></a>
### 2. Quality Tab

This tab shows the **quality of your trades** and important metrics.

#### 🎯 Win Rate Chart

**What does it show?**
A classic chart of your Win Rate over time.

**How to read:**
- Shows the percentage development of your winning trades

**Interpretation:**
- **> 50%:** Above breakeven (with 1:1 RR)
- **40-50%:** OK if your RR > 1:2
- **< 40%:** Critical, unless you have very high RR (> 1:3)

**Important:**
You DON'T need a 90% Win Rate! With good Risk/Reward, 30-40% is sufficient.

#### 📋 Trading Stats (Statistics Box)

**What does it show?**
Central metrics of your trading performance in a compact overview.

**Metrics:**

1. **Win Rate**
   - Percentage of winning trades
   - Green if ≥ 50%, Red if < 50%
   - Formula: `(Winning Trades / Total Trades) × 100`

2. **Profit Factor** (PF)
   - Ratio of gross profit to gross loss
   - Green if ≥ 1.5, Yellow if ≥ 1.0, Red if < 1.0
   - **> 1.0** = Profitable
   - **> 1.5** = Solid system
   - **> 2.0** = Excellent system
   - Formula: `Gross Profit / |Gross Loss|`

3. **Expectancy**
   - Average profit per trade in $
   - Positive = long-term profitable
   - Formula: `(Win Rate × Avg Win) - (Loss Rate × Avg Loss)`

4. **Avg W/L** (Average Win/Loss)
   - Shows average winning trade vs. losing trade
   - Green shows Avg Win, Red shows Avg Loss
   - Should be at least 1:1

5. **L/S Win Rate** (Long/Short Win Rate)
   - Win Rate split by Long and Short
   - Recognize your bias (are you better in Longs or Shorts?)

**Action recommendations:**
- PF < 1.0: System loses money → Analysis urgent!
- PF 1.0-1.5: System works but needs optimization
- PF > 2.0: Excellent, keep it up!

---

<a id="direction-tab"></a>
### 3. Direction Tab

This tab shows your performance in **Long vs. Short** trades.

#### 📊 Long vs Short Bar Chart

**What does it show?**
Comparison of PnL between Long and Short positions.

**How to read:**
- Two bars: Long (green) vs. Short (red/orange)
- Height shows total PnL

**Interpretation:**
- **Strongly different:** You have a bias (one-sided strength)
- **One strongly negative:** Avoid this direction or work on it

**Action recommendations:**
- Focus on your stronger side
- Or specifically train the weaker side in demo

#### 📈 Long vs Short Evolution

**What does it show?**
Cumulative PnL of Longs vs. Shorts over time.

**How to read:**
- Two lines: One for Long, one for Short
- Shows development over time

**Interpretation:**
- Which line rises more strongly? → Your profitable direction
- Divergence of lines = Different performance

#### 📋 Trading Stats (Direction)

Shows additional statistics specifically for Long vs. Short:
- Number of trades Long/Short
- Win Rate Long/Short
- Total PnL Long/Short

---

<a id="discipline-tab"></a>
### 4. Discipline Tab

This tab checks your **discipline and consistency**.

#### ⏰ Hourly PnL (Hourly Performance)

**What does it show?**
Your performance broken down by time of day (0-23 hours).

**How to read:**
- **X-Axis:** Hours (0 = midnight, 12 = noon, etc.)
- **Y-Axis:** PnL in $
- **Bars:** Green (profit) or Red (loss) per hour

**Interpretation:**
- **Profitable hours:** The best time to trade
- **Loss hours:** DON'T trade at this time!

**Example:**
If you consistently lose money between 12:00-14:00 (lunch break, low volatility), then DON'T trade during this time!

**Action recommendations:**
- Identify your profitable hours
- Avoid systematic loss times
- Adjust your trading plan to your best times

#### 📊 Risk Consistency

**What does it show?**
How consistent is your position size / your risk per trade?

**How to read:**
- Shows distribution of your risk levels
- Ideally, all trades should have similar risk

**Interpretation:**
- **Even bars:** Consistent ✅
- **Strong outliers:** Inconsistent, emotional trading ❌

**Action recommendations:**
- Use the Calculator for EVERY trade
- Keep your risk constant (e.g., always 1% or 2%)

#### 🔥 Streak Statistics

**What does it show?**
Two boxes:
1. **Longest Win Streak:** Longest winning streak
2. **Longest Loss Streak:** Longest losing streak

**Interpretation:**
- **Long Win Streak:** Danger of Overconfidence
- **Long Loss Streak:** Danger of Revenge Trading

**Psychological significance:**
After a long winning streak, traders tend to be overconfident → larger positions, worse setups.
After a losing streak, traders tend to tilt → revenge trades, impulsive behavior.

**Action recommendations:**
- Know your statistics!
- After 5+ wins in a row: Be extra cautious
- After 3+ losses in a row: Take a break, don't force it

---

<a id="costs-tab"></a>
### 5. Costs Tab

This tab shows all **costs and fees** of your trading.

#### 💰 Gross vs Net PnL

**What does it show?**
Comparison between:
- **Gross PnL:** Profit BEFORE fees
- **Net PnL:** Profit AFTER fees

**How to read:**
- Two bars side by side
- Difference = fees

**Interpretation:**
- **Large difference:** High fee burden
- **Small difference:** Efficient trading

**Action recommendations:**
- If fees > 10% of Gross PnL: Reduce trading frequency
- Check broker fees and VIP discounts

#### 📈 Cumulative Fees

**What does it show?**
How much fees you have paid in total over time.

**How to read:**
- **X-Axis:** Time
- **Y-Axis:** Cumulative fees in $
- **Line:** Rises continuously (fees accumulate)

**Interpretation:**
- Shows the "hidden costs" of your trading
- Steeper curve = More trades / Higher fees

**Example:**
If after 100 trades you've paid $500 in fees but only made $400 profit → Fees are eating your profit!

#### 🍰 Fee Breakdown

**What does it show?**
Donut chart with breakdown of fee types:
- Trading Fees (opening/closing fees)
- Funding Fees (for overnight positions)

**How to read:**
- Percentage distribution of cost types

**Interpretation:**
- **High Funding Fees:** You hold positions too long overnight
- **High Trading Fees:** Too much overtrading (too many trades)

**Action recommendations:**
- With high Funding Fees: Close more positions before funding time
- With high Trading Fees: Reduce number of trades, focus on Quality over Quantity

---

<a id="deep-dive"></a>
## Deep Dive Analytics (Pro)

The Deep Dive analytics are for advanced traders and require Pro access. This is where you dive deep into your performance.

<a id="dd-forecast"></a>
### 1. Forecast - Future Projection

#### 🔮 Monte Carlo Simulation

**What does it show?**
A statistical forecast of how your account could develop in the future, based on your past performance.

**How to read:**
- **X-Axis:** Number of future trades
- **Y-Axis:** Expected capital change in %
- **Multiple lines:** Different scenarios (Best Case, Average, Worst Case)

**Interpretation:**
- **Fan-shaped lines:** The further in the future, the more uncertain
- **Middle line (Average):** Most likely development
- **Upper boundary:** Optimistic scenario
- **Lower boundary:** Pessimistic scenario

**Action recommendations:**
- Use this for realistic expectations
- Plan your risk based on worst-case scenarios
- At least 5 trades required for calculation

---

<a id="dd-trends"></a>
### 2. Trends - Metric Evolution

This tab shows how your most important metrics develop over time (rolling/moving).

#### 📊 Rolling Win Rate

**What does it show?**
Your Win Rate over a moving period (e.g., last 20 trades).

**How to read:**
- **X-Axis:** Time / Trade number
- **Y-Axis:** Win Rate in %
- **Line:** Moving average of your Win Rate

**Interpretation:**
- **Rising:** You're getting better! ✅
- **Falling:** Deterioration, analysis needed ❌
- **Stable:** Consistent

**Action recommendations:**
- With falling trend: Back to basics, possibly demo trading
- With rising trend: System works, keep it up

#### 📊 Rolling Profit Factor

**What does it show?**
Your Profit Factor over a moving period.

**How to read:**
- **Y-Axis:** Profit Factor (values > 1.0 are profitable)
- **Line:** Moving PF

**Interpretation:**
- **Line above 1.5:** Excellent
- **Line between 1.0 - 1.5:** Solid
- **Line below 1.0:** System loses money

#### 📊 Rolling SQN (System Quality Number)

**What does it show?**
A statistical measure of the quality of your trading system.

**How to read:**
- **Y-Axis:** SQN value
- **Value interpretation:**
  - **SQN < 1.6:** Below average
  - **SQN 1.6 - 2.0:** Average
  - **SQN 2.0 - 2.5:** Good
  - **SQN 2.5 - 3.0:** Very good
  - **SQN 3.0 - 5.0:** Excellent
  - **SQN > 5.0:** Outstanding (rare)

**Formula:**
```
SQN = (√Number of Trades × Average R-Multiple) / Standard Deviation of R-Multiple
```

**Action recommendations:**
- SQN < 1.6: Rework system
- SQN > 2.5: System is strong, scale up

**At least 20 trades required for meaningful trends.**

---

<a id="dd-leakage"></a>
### 3. Leakage - Identify Profit Leaks

This tab shows you where you're losing money ("Leakage" = leaks in your profit).

#### 💧 Profit Retention Waterfall

**What does it show?**
A waterfall chart showing how your Gross PnL is reduced by various factors:
1. Gross PnL (Gross profit)
2. - Trading Fees
3. - Funding Fees
4. = Net PnL (Net profit)

**How to read:**
- Bars show individual "steps" from Gross to Net
- Red bars = deductions
- Green end bar = What remains

**Interpretation:**
- Large "steps" downward = Large profit leaks
- Ideally, fees should be small compared to Gross PnL

#### 🏷️ Strategy Leakage

**What does it show?**
Which strategies (tags) cause the largest losses.

**How to read:**
- **X-Axis:** Loss in $
- **Y-Axis:** Tag names
- **Horizontal bars:** The longer, the larger the loss

**Interpretation:**
- Tags with large red bars = Problem strategies
- These strategies cost you money!

**Action recommendations:**
- Identify loss strategies
- Either completely avoid or fundamentally rework
- Focus on profitable tags

#### ⏰ Time Leakage (Worst Hours)

**What does it show?**
The hours when you lose the most money.

**How to read:**
- Similar to Hourly PnL, but only the loss hours

**Action recommendations:**
- DON'T trade during these times!
- Recognize patterns (e.g., fatigue, poor market conditions)

---

<a id="dd-timing"></a>
### 4. Timing - Time Analysis

When are you at your best? This tab analyzes time-related patterns.

#### ⏰ Hourly PnL Analysis

**What does it show?**
Detailed hourly breakdown with **Gross Wins** (green) and **Gross Losses** (red) per hour.

**How to read:**
- **X-Axis:** Hours (0-23)
- **Y-Axis:** PnL in $
- **Green bars:** Sum of all wins in this hour
- **Red bars:** Sum of all losses in this hour

**Interpretation:**
- **Only green, no red:** Perfect hour! ✅
- **Much red, little green:** Avoid this hour ❌
- **Both balanced:** Neutral

**Example:**
Hour 14 (2:00 PM): +$200 win, -$150 loss → Net +$50, but volatile.
Hour 9 (9:00 AM): +$300 win, -$20 loss → Net +$280, excellent!

#### 📅 Day of Week PnL

**What does it show?**
Your performance per weekday (Monday to Sunday).

**How to read:**
- **X-Axis:** Weekdays
- **Y-Axis:** PnL
- **Bars:** Green/Red for profit/loss

**Interpretation:**
- Many traders have "weak days" (e.g., Monday = market uncertain, Friday = fatigue)

**Action recommendations:**
- Trade only on your strong days
- Avoid weak days or increase caution

#### ⏱️ Duration vs PnL (Bubble Chart)

**What does it show?**
A scatter plot showing the holding duration of your trades against profit/loss.

**How to read:**
- **X-Axis:** Duration in minutes
- **Y-Axis:** PnL in $
- **Points:** Each point = one trade
- **Color:** Green (profit) or Red (loss)
- **Size:** Can represent position size

**Interpretation:**
- **Green points top right:** Long-held winners → Good! You let winners run.
- **Red points bottom left:** Quickly closed losers → Good! You cut losses early.
- **Red points right:** Long-held losers → PROBLEM! You hold losers too long.
- **Green points left:** Quickly closed winners → You cut winners too early.

**Ideal pattern:**
Green points further right and higher than red points. (Let Winners Run, Cut Losers Fast)

#### 📊 Duration Analysis (Bucketed)

**What does it show?**
Trades grouped into time windows (e.g., 0-15 Min, 15-30 Min, 30-60 Min, etc.).

**How to read:**
- **X-Axis:** Time windows
- **Y-Axis:** PnL
- **Bars:** Average PnL per time window

**Interpretation:**
- Which holding duration is most profitable?

**Example:**
- 0-15 Min: -$50 (Scalps don't work)
- 1-4 hours: +$200 (Sweet spot!)
- > 24 hours: -$100 (Overnight positions are lossy)

**Action recommendations:**
- Focus on your most profitable time windows
- Avoid time windows with losses

---

<a id="dd-assets"></a>
### 5. Assets - Symbol Performance

#### 🔵 Asset Bubble Matrix

**What does it show?**
A bubble chart matrix positioning all symbols by **Win Rate** and **PnL**.

**How to read:**
- **X-Axis:** Win Rate (%)
- **Y-Axis:** PnL ($)
- **Bubbles:** Each bubble = one symbol
- **Bubble size:** Number of trades
- **Color:** Green (profitable) or Red (lossy)

**Interpretation:**

**Quadrants:**
1. **Top right (High Win Rate + High PnL):** 🌟 YOUR BEST COINS! Increase position size here.
2. **Top left (Low Win Rate + High PnL):** Profitable despite low Win Rate → High RR works.
3. **Bottom right (High Win Rate + Low PnL):** Many small wins, but no big winners.
4. **Bottom left (Low Win Rate + Low PnL):** ❌ ACCOUNT KILLERS! Remove these coins from your watchlist.

**Action recommendations:**
- Trade more from Quadrant 1 and 2
- Avoid Quadrant 4 completely
- Analyze Quadrant 3: Why are the wins small?

---

<a id="dd-risk"></a>
### 6. Risk - Risk Management

#### 📊 R-Multiple Distribution

**What does it show?**
How often do you hit 1R, 2R, 3R, etc.?

**How to read:**
- **X-Axis:** R-Multiple (1R = you won 1× your risk)
- **Y-Axis:** Number of trades
- **Bars:** Frequency

**What is R-Multiple?**
```
R-Multiple = Realized PnL / Initial Risk
```

**Example:**
- Risk: $100, Profit: $200 → 2R
- Risk: $100, Loss: $100 → -1R

**Interpretation:**
- **Many bars at 2R, 3R:** You let winners run ✅
- **Most bars at -1R:** You cut losers at SL ✅
- **Bars at -2R, -3R:** You let losses escalate ❌

**Pro tip:**
You don't need a 90% Win Rate! If you often win 3R, a Win Rate of 30% is enough to be very profitable.

**Example calculation:**
- 30% Win Rate, 3R average win, 1R average loss:
  - 10 Trades: 3 winners (3 × 3R = 9R), 7 losers (7 × -1R = -7R)
  - **Total: +2R** → Profitable! ✅

#### 💰 Risk vs. Realized PnL

**What does it show?**
Scatter plot: Does your risk correlate with the result?

**How to read:**
- **X-Axis:** Initial Risk Amount ($)
- **Y-Axis:** Realized PnL ($)
- **Points:** Green (profit), Red (loss)

**Interpretation:**
- **Ideal picture:** Higher risk also means higher profits (points top right)
- **Problem:** High risk often means losses → Reduce position size!

**Action recommendations:**
- If many red points at high risk: Go back to small risk (0.5% - 1%)
- Increase risk only when you're consistently profitable

---

<a id="dd-market"></a>
### 7. Market - Market Conditions

This tab analyzes how you perform in different market phases (Trending, Ranging, Volatile, etc.).

**What does it show?**
Performance broken down by recognized market conditions.

**Interpretation:**
- Find out in which market phase you perform best
- E.g., many traders are good in Trending Markets but bad in Ranging Markets

---

<a id="dd-psychology"></a>
### 8. Psychology - Discipline & Mental Game

#### 🔥 Streak Analysis (Detailed)

**What does it show?**
Extended analysis of your winning and losing streaks, including visualization of all streaks.

**How to read:**
- Shows each streak as bars or lines
- Length = number of trades in streak
- Color = win (green) or loss (red)

**Psychological significance:**

**After long winning streak:**
- Danger: Overconfidence
- Symptoms: Larger positions, accepting worse setups
- Countermeasure: After 5+ wins in a row → Be extra critical with setups

**After long losing streak:**
- Danger: Tilt / Revenge Trading
- Symptoms: Impulsive trades, revenge mentality, breaking rules
- Countermeasure: After 3+ losses → 24h break, demo trading

**Action recommendations:**
- Define a "Max Loss Streak" (e.g., 3) → After 3 losses: Pause!
- Define a "Win Streak Caution" (e.g., 5) → After 5 wins: Extra cautious!

---

<a id="dd-strategies"></a>
### 9. Strategies - Strategy Performance

#### 🏷️ Tag-based PnL

**What does it show?**
The performance of each strategy you have marked via tags.

**How to read:**
- **X-Axis:** Tags (your strategies)
- **Y-Axis:** PnL in $
- **Bars:** Green (profitable) or Red (lossy)

**Interpretation:**
- **Long green bars:** This strategy prints money! Trade more of it.
- **Red bars:** This strategy burns money! Either eliminate or fundamentally rework.

**Example:**
- Tag "Breakout": +$500 → Works! ✅
- Tag "Reversal": -$300 → Doesn't work! ❌
- **Action:** Focus on Breakouts, avoid Reversals.

**Why is this extremely valuable?**
Without tags you can't distinguish between strategies. With tags you see in black and white what works!

#### 📊 Strategy Comparison

**What does it show?**
Detailed comparison of multiple strategies with additional metrics:
- Win Rate per strategy
- Profit Factor per strategy
- Number of trades per strategy
- Average win/loss

**Action recommendations:**
- Eliminate strategies with PF < 1.0
- Scale strategies with PF > 2.0
- Track at least 10 trades per strategy for statistical relevance

---

<a id="dd-calendar"></a>
### 10. Calendar - Calendar View

#### 📅 Calendar Heat Map

**What does it show?**
A calendar where each day is color-coded based on the PnL of that day.

**How to read:**
- **Green days:** Profit days
- **Red days:** Loss days
- **Color intensity:** The darker, the larger the profit/loss
- **Gray/White days:** No trades

**Interpretation:**
- At a glance you see profitable vs. loss-making days
- Recognize weekly or monthly patterns

**Example patterns:**
- Every Friday red? → Avoid Friday trading
- Always green at beginning of month? → Good time to trade

---

<a id="formulas"></a>
## Formulas & Calculations

The Journal uses precise mathematical formulas for all KPIs.

### 1. Profit Factor (PF)
The ratio of gross profit to gross loss.

$$
\text{Profit Factor} = \frac{\sum \text{Gross Profit}}{\sum |\text{Gross Loss}|}
$$

**Interpretation:**
- **> 1.0:** Profitable
- **> 1.5:** Solid system
- **> 2.0:** Excellent system

---

### 2. Expectancy
Average profit per trade in dollars.

$$
E = (\text{Win Rate} \times \text{Avg Win}) - (\text{Loss Rate} \times \text{Avg Loss})
$$

**Example:**
- Win Rate: 50%, Avg Win: $100
- Loss Rate: 50%, Avg Loss: $50
- Expectancy: (0.5 × 100) - (0.5 × 50) = 50 - 25 = **$25 per trade**

---

### 3. R-Multiple
The result of a trade relative to the initial risk.

$$
R = \frac{\text{Realized PnL}}{\text{Initial Risk Amount}}
$$

**Example:**
- Risk: $100 (distance Entry to SL)
- Profit: $300
- R-Multiple: 300 / 100 = **3R**

This makes trades with different account sizes comparable!

---

### 4. Average RR (Risk/Reward)
The average realized risk/reward ratio.

$$
\text{Avg RR} = \frac{\text{Avg Win}}{\text{Avg Loss}}
$$

**Example:**
- Avg Win: $150
- Avg Loss: $50
- Avg RR: 150 / 50 = **3:1**

---

### 5. Win Rate
Percentage of winning trades.

$$
\text{Win Rate} = \frac{\text{Number of Winning Trades}}{\text{Total Trades}} \times 100
$$

---

### 6. System Quality Number (SQN)
A statistical measure of trading system quality.

$$
\text{SQN} = \frac{\sqrt{N} \times \overline{R}}{\sigma_R}
$$

Where:
- N = Number of trades
- $\overline{R}$ = Average R-Multiple
- $\sigma_R$ = Standard deviation of R-Multiples

**Interpretation:**
- **< 1.6:** Below average
- **1.6 - 2.0:** Average
- **2.0 - 2.5:** Good
- **2.5 - 3.0:** Very good
- **3.0 - 5.0:** Excellent
- **> 5.0:** Outstanding

---

### 7. MAE (Maximum Adverse Excursion)
The largest negative movement during a trade.

$$
\text{MAE} = \text{Entry Price} - \text{Lowest Price (Long)} \text{ or } \text{Highest Price (Short)} - \text{Entry Price}
$$

**Use:** Shows how far the trade went against you before it (hopefully) recovered.

---

### 8. MFE (Maximum Favorable Excursion)
The largest positive movement during a trade.

$$
\text{MFE} = \text{Highest Price (Long)} - \text{Entry Price} \text{ or } \text{Entry Price} - \text{Lowest Price (Short)}
$$

**Use:** Shows how much profit you "left on the table".

---

### 9. Efficiency
How much of the maximum possible profit (MFE) did you realize?

$$
\text{Efficiency} = \frac{\text{Realized PnL}}{\text{MFE}} \times 100
$$

**Example:**
- MFE: $500 (max. possible profit)
- Realized: $300 (actual profit)
- Efficiency: 300 / 500 = **60%**

**Interpretation:**
- **> 80%:** Excellent exit timing
- **50-80%:** Solid
- **< 50%:** You exit trades too early

---

<a id="best-practices"></a>
## Best Practices & Tips

### Workflow Recommendation

**Daily Routine:**
1. Open the Journal after each trading day
2. Check **Performance → Equity Curve**: Am I on track?
3. Check **Discipline → Hourly PnL**: Did I trade at good times?
4. Add tags and notes to all trades (IMMEDIATELY, not later!)

**Weekly Analysis:**
1. Deep Dive → **Timing**: Are there bad hours/days?
2. Deep Dive → **Strategies**: Which tags work?
3. Deep Dive → **Psychology**: How are my streaks?
4. Export CSV as backup

**Monthly Review:**
1. Performance → **Monthly PnL**: Was the month profitable?
2. **Quality Tab**: How has my PF developed?
3. Deep Dive → **Trends**: Analyze rolling metrics
4. Deep Dive → **Leakage**: Where am I losing money?
5. **Adjust strategies** based on the data

---

### Avoid Common Mistakes

❌ **Not using tags**
→ Without tags no strategy analysis possible!

❌ **Writing notes too late**
→ Write notes IMMEDIATELY after the trade, not days later. You'll forget important details otherwise.

❌ **Too many trades**
→ Quality over Quantity! Many bad trades = high fees + bad Win Rate.

❌ **Ignoring Drawdown**
→ At > 15% Drawdown PAUSE, don't continue!

❌ **Emotional decisions after streaks**
→ After 3 losses or 5 wins: Be extra cautious!

❌ **Not exporting data**
→ Weekly CSV export = backup of your work!

---

### How to Use the Journal Optimally?

✅ **Be honest with yourself**
→ Also note mistakes: "FOMO", "Revenge", "Bad Entry". Only this way you learn!

✅ **Use screenshots**
→ A picture is worth 1000 words. Save your setup visually.

✅ **Combine Calculator + Journal**
→ The Calculator plans, the Journal analyzes. Hand in hand!

✅ **Follow the data, not your gut feeling**
→ If the data says "You lose money on Fridays", then don't trade on Fridays. Even if it "feels good".

✅ **Scale only when data justifies it**
→ Increase risk/position size only with:
  - PF > 1.5
  - At least 50 trades
  - Drawdown < 10%
  - Consistency over 3+ months

---

**Success in trading is not a sprint, it's a marathon. Your journal is your training plan.**

Use it daily, learn from every trade, and let the data guide your decisions – not your emotions.

🚀 **Good luck with your trading!**
