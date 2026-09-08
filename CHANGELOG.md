# Changelog

All notable user-facing changes to Cachy, curated per release from 1.0.0
onward. Each entry is verified against the release diff and the current code;
minor fixes without user impact are deliberately omitted. The complete commit
history remains available in git.

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
