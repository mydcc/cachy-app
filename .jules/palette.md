## 2024-05-24 - [Title tooltips in MarketDashboardModal]
**Learning:** Hardcoded english tooltips (`title="..."`) are often present in nested Svelte elements like trend indicator bars. They must also be extracted to both `en.json` and `de.json`.
**Action:** Replaced hardcoded "15m Trend" strings with `$_("app.marketDashboard.trendMatrix.trend15m")`.
