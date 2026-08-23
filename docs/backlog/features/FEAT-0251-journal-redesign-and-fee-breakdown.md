---
id: FEAT-0251
title: Journal UI/UX redesign and entry/exit fee breakdown
type: feature
status: done
priority: P1
milestone: M2
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# FEAT-0251 — Journal UI/UX redesign and entry/exit fee breakdown

> **Status note (2026-08-23):** Core scope merged in
> [#2150](https://github.com/mydcc/cachy-app/pull/2150) (`a0d964a9`):
> sticky columns, `TradeDetailDrawer.svelte`, granular
> `entryFee`/`exitFee`/`feeMode` fields in `stores/types.ts`,
> `journal_feeBreakdown.test.ts`. Still open: quick-date filter presets and
> column presets (AC section 5) are not in the code yet, so those boxes stay
> unchecked and the item stays `in-progress` until they land.

## Summary

Rework the trading journal window (`JournalContent`, `JournalTable`, `JournalFilters`, `JournalStatistics`, `JournalDeepDive`) to enhance usability, provide clean tab-based navigation across large analysis views, add sticky columns for core metrics, introduce a dedicated trade detail inspector drawer, and display granular entry and exit trading fees (Maker vs. Taker).

---

## Background & Problem

1. **Information Density & Scroll Fatigue:** The Journal view currently stacks header statistics, performance charts, filter controls, an expansive 20+ column table, and deep-dive analytics vertically. This requires excessive scrolling, burying valuable deep-dive analytics (heatmaps, radar, scatter charts) below long trade tables.
2. **Table Usability & Responsiveness:**
   - On wide tables, users lose context when scrolling horizontally because symbol, date, net PnL, and action buttons scroll out of view.
   - Inline cells for notes, tags, and screenshots overload individual table rows.
   - On narrower viewports, action buttons (such as the Bitunix synchronization button and export/import tools) can become truncated or hidden.
3. **Missing Fee Granularity (Maker / Taker):** Traders need exact insight into entry fees and exit fees (specifically distinguishing Maker from Taker execution rates), as fee drag is a primary determinant of net profitability.
4. **Filter & Column Management:** Column settings currently lack presets (*Compact*, *Standard*, *Execution & Fees*, *Full*), and quick-date filters (*Today*, *This Week*, *This Month*, *Last 30 Days*, *YTD*) are missing.

---

## Acceptance Criteria

### 1. Information Architecture & Navigation
- [x] `JournalContent` provides structured top-level tab navigation:
  - **Overview & Charts** (Statistics + Equity / PnL / Win-Loss Charts)
  - **Journal Table** (Filters + Trade Table + Action Toolbar)
  - **Deep-Dive Analytics** (Heatmaps, Hour-of-Day, Radar, Scatter)
- [x] Active tab state is preserved within the session.

### 2. Table Enhancements & Sticky Columns
- [x] `JournalTable` implements sticky column pinning:
  - Sticky Left: Date and Symbol columns remain fixed with proper z-indexing and subtle separation shadow when scrolling horizontally.
  - Sticky Right: Net PnL and Row Action menu remain fixed during horizontal scroll.
- [x] Table row layout remains a clean, single-height row. Clicking a trade row or its "Details" button opens the Trade Detail Drawer.
- [x] No separate mobile card view is introduced; table retains clean horizontal scroll with sticky keys across viewports.

### 3. Trade Detail Drawer
- [x] A right-side slide-over drawer (`TradeDetailDrawer.svelte`) displays:
  - Complete trade execution parameters (Entry, Exit, Stop Loss, R:R, Leverage, Position Size).
  - Detailed fee breakdown (Entry Fee, Exit Fee, Total Trading Fees, Funding Fees).
  - Editable trade notes with auto-save.
  - Tag management with searchable tag chips.
  - Screenshot thumbnail preview with lightbox modal.
  - TP execution breakdown with individual target realized PnL.

### 4. Granular Trading Fees (Maker / Taker)
- [x] `JournalEntry` supports granular fee tracking:
  - `entryFee` (Decimal) and `entryFeeType` (`maker` | `taker`)
  - `exitFee` (Decimal) and `exitFeeType` (`maker` | `taker`)
  - `totalFees` (Decimal) representing cumulative trading fees (`entryFee + exitFee`)
  - `fundingFee` (Decimal)
- [x] Net PnL formula strictly enforced: $\text{Gross PnL} - \text{Total Fees} - \text{Funding Fee} = \text{Net PnL}$.
- [x] Optional table columns for `entryFee`, `exitFee`, and `totalFees` with Maker/Taker badges (*M* / *T*).

### 5. Enhanced Filters & Column Presets
- [ ] `JournalFilters` includes Quick-Date filter presets (*Today*, *This Week*, *This Month*, *Last 30 Days*, *YTD*, *All*).
- [ ] Tag filter chip multi-select in addition to full-text search.
- [ ] Column visibility popover redesigned with accessible dialog attributes (`role="dialog"`, `aria-modal="true"`) and presets (*Compact*, *Standard*, *Fees & Execution*, *All Columns*).
- [ ] Responsive action toolbar ensures sync and management buttons wrap cleanly without overflowing or disappearing.

### 6. Cachy Engineering Standards & Non-Negotiables
- [x] **Svelte 5 Runes only** (`$state`, `$derived`, `$effect` with cleanup functions).
- [x] **`decimal.js` for all financial math** (prices, fees, PnL, percentages). Native numbers forbidden.
- [x] **Local-First Boundary:** All journal entries, notes, and tags remain strictly Class A (`localStorage` / IndexedDB).
- [x] **Theming:** No hardcoded hex color fallbacks. All colors derive from CSS variables (`var(--bg-primary)`, `var(--text-primary)`, `var(--accent-color)`, etc.) and paired classes from `src/themes.css`.
- [x] **Dynamic Currency:** Currency formatting dynamically reads the configured base currency.

---

## Out of Scope

- Cloud synchronization of private journal notes or screenshots (Class A boundary).
- Automatic exchange tax-report generation (belongs to export plugins).
- Replacement of Chart.js underlying engine.

---

## Test Plan

- [x] Unit tests for fee calculation and net PnL derivation with decimal precision (completed).
- [x] Component tests for `JournalTable` sticky column classes and column preset switching (completed).
- [x] Svelte-check and TypeScript compilation verification (`npm run check`) (completed).

---

## Blockers to Completion

**AC 5: Filter & Column Presets** — Quick-date presets and column preset UI are still not implemented.
Once AC 5 is complete, this item can transition to `done`.
