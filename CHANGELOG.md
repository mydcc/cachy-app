# Changelog

All notable user-facing changes to Cachy, curated per release from 1.0.0
onward. Each entry is verified against the release diff and the current code;
minor fixes without user impact are deliberately omitted. The complete commit
history remains available in git.

## [1.6.0](https://github.com/mydcc/cachy-app/compare/v1.5.0...v1.6.0) (unreleased)

### Added

- Super-Alert: alerts move to a side panel backed by a rule engine that
  re-evaluates on every candle close, replacing the old modal and engine.
- Alert conditions can be built on indicators and candlestick patterns, not
  only a single price target, and can be created straight from the chart.
- Rules compose richer operands — volume, Bollinger bandwidth and a window
  operand — so squeeze and divergence setups fit in one condition.
- Alerts gain per-rule frequency, validity periods and notes, plus a sound
  channel and user-configured external channels; firings are announced,
  counted and retired by a real sink.
- Named exchange accounts: keep several accounts per venue and always see
  which one is active.
- Manage open positions without leaving the trade panel: add to a position
  with an average-entry preview, close part of it, and change leverage or
  margin mode.
- Bracket TP/SL on pending orders and an entry placed with attached TP/SL,
  a break-even line, a warning when a position is left unprotected, and a
  chart line for resting (unfilled) limit orders.
- Draggable TP/SL lines on the chart and a TP/SL range slider with PnL, ROI
  and change modes.
- Maker/taker fees are derived from real broker fills and can be edited per
  venue.
- Order history can be filtered and paged by time range, and orders are
  validated against trading-pair metadata before they leave.
- Funding-rate history and 24-hour holding cost for Bitunix positions.
- Notifications on order fills, rejections and cancels.
- Paper-trading mode, configurable risk limits and a kill switch for the
  execution path.
- Journal overhaul: sticky columns, a fee breakdown and an analytics drawer.
- Chart and indicators: indicator panes with labels, an MFI sub-pane, a
  Pivots overlay, Ichimoku's lagging span, a chart-settings tab, and
  collapsible sub-panes.
- Automatic local backups via OPFS with a recovery dialog, plus periodic
  on-disk snapshots.
- Trading Academy in English, and an interactive onboarding walkthrough with
  a 3D duck companion.
- Custom base URL for every AI provider.

### Changed

- Every exchange sits behind one adapter interface with a capability model,
  so an unsupported order is refused before it leaves the client.
- Order placement is hardened end to end: a verification gate before
  submission, native cancel and close endpoints, and TP/SL, time-in-force
  and a client order ID sent with Bitunix orders.
- Layout tokens, shared component classes and core utilities now drive
  theming, so a theme change lands in one place.
- Startup and hot paths got faster: chart, Trade Flow and 3D backgrounds
  load lazily, and the WASM math and market store allocate less.

### Fixed

- Exchange API keys are encrypted at rest with the device key, and backup
  exports no longer contain plaintext credentials.
- Hardened SSRF protection across proxy routes: shared URL validation,
  encoded-host and DNS-rebinding defense, and reserved-IP rejection.
- Security headers and a tighter Content-Security-Policy are now applied
  globally, including to static assets.
- AI features require explicit consent before trade context is sent and fail
  closed in local mode; usage telemetry is opt-in.
- Order correctness: quantity is clamped to the symbol step, the order type
  reaches Bitunix, and stop protection is retried on the position's TP/SL.
- Live data is more resilient: exchange sockets no longer reconnect in loops
  or leak listeners, a mode switch is read back until the venue confirms it,
  and overlapping reads can no longer let a stale response win.
- Chart candle freezes and the Market Overview reload loop are fixed, and the
  app recovers from a stale deployment instead of failing on missing chunks.

## [1.5.0](https://github.com/mydcc/cachy-app/compare/v1.4.0...v1.5.0) (2026-08-12)

### Fixed

- API keys no longer leak into error logs when the news feed fails.
- Market Overview icons are sanitized before rendering (DOMPurify).
- Symbol search no longer snaps back when cleared while focused.
- Order-block evaluation uses the correct mitigation order again.

### Changed

- Market-data loading is batched per symbol, so charts and repairs issue
  fewer API calls and recover faster.
- Published a security policy (`SECURITY.md`).

## [1.4.0](https://github.com/mydcc/cachy-app/compare/v1.3.0...v1.4.0) (2026-08-12)

### Added

- Local price alert engine: alerts are evaluated on-device.

### Fixed

- Missing security headers are served again.
- Screen-reader labels are translated instead of hardcoded.

### Changed

- Faster rendering by removing allocations from render paths.

## [1.3.0](https://github.com/mydcc/cachy-app/compare/v1.2.0...v1.3.0) (2026-08-11)

### Added

- Open positions show margin rate and realized PnL.
- Read-only leverage, margin mode, symbol and tier data for Bitunix.
- Descriptive tooltips for the trade-flow settings.

### Fixed

- Unrealized PnL is recomputed from the live mark price.
- The Choppiness indicator reads the field the UI displays.
- Balance refreshes no longer erase wallet fields.

## [1.2.0](https://github.com/mydcc/cachy-app/compare/v1.1.1...v1.2.0) (2026-08-09)

### Added

- Trading Academy runs as its own window, with mobile and quiz fixes.
- Assistant window replaces the side panel; all floating surfaces share one
  layer order.
- AI assistant: new Trade Panel actions, institutional risk audit, and
  Ollama/OpenRouter providers.
- Order history shows reduceOnly flags and total position size.

### Changed

- Positions, orders and account share one live store, fixing order
  cancel/close errors.

### Fixed

- Position handling overhaul: live mark price, HEDGE-mode closes, and
  correct funding rates (including a 100x display error and REST sourcing).
- Public use without a shared secret via self-issued client tokens.
- Window drag, restore and maximize behavior on touch and desktop.

## [1.1.1](https://github.com/mydcc/cachy-app/compare/v1.1.0...v1.1.1) (2026-08-02)

No user-facing changes (release automation only).

## [1.1.0](https://github.com/mydcc/cachy-app/compare/v1.0.2...v1.1.0) (2026-08-02)

### Added

- AI assistant discovers models live and supports Ollama and OpenRouter.

### Fixed

- Bitget real-time data is normalized to what the account views expect.
- Self-hosted deploys: health checks and start-command handling.

## [1.0.2](https://github.com/mydcc/cachy-app/compare/v1.0.1...v1.0.2) (2026-08-02)

### Fixed

- Signed-in API requests survive unlock delays and forgotten server tokens.
- Recent orders are protected from being overwritten by stale data.
- Numeric prices are handled with full decimal precision.
- Presets accept older fee formats instead of failing validation.

## [1.0.1](https://github.com/mydcc/cachy-app/compare/v1.0.0...v1.0.1) (2026-08-01)

### Fixed

- Market tiles no longer stay empty until clicked (startup race).
- Market data reads use one canonical source regardless of provider.

## 1.0.0 (2026-08-01)

First stable release: position size calculator with technicals, trade journal
with analytics, Trading Academy, AI assistant, Bitunix/Bitget market data,
and installable PWA.
