
## 2026-08-12 - Window Controls Accessibility
**Learning:** Hardcoded English `title` attributes on icon-only buttons (like Window Controls) are accessibility failures that bypass the translation layer and create a poor experience for screen reader users on non-English locales. To replace them, standard i18n keys must be used and regenerated using `node scripts/generate-i18n-types.js` to avoid `svelte-check` type errors. The `as string` type assertion should be avoided in favor of correctly adding the keys and regenerating the schema.
**Action:** Replaced hardcoded English title strings (e.g. `title="Export"`) in `src/components/shared/windows/WindowFrame.svelte` with `$_(...)` i18n calls (e.g., `title={$_("common.export")}`), added `aria-label`s for screen readers, and defined the translations in `en.json` and `de.json`.

## 2026-08-16 - Title tooltips in MarketDashboardModal
**Learning:** Hardcoded english tooltips (`title="..."`) are often present in nested Svelte elements like trend indicator bars. They must also be extracted to both `en.json` and `de.json`.
**Action:** Replaced hardcoded "15m Trend" strings with `$_("app.marketDashboard.trendMatrix.trend15m")`.

## 2026-08-16 - Global Modal Close Buttons
**Learning:** When positioning a close button absolutely within a full-screen modal overlay (like `fixed inset-0`), placing it at `top-4 right-4` or `top-6 right-6` will cause it to overlap directly with the `ToastContainer`, which is anchored at `top:24px/right:24px` and has a very high z-index (`var(--z-toast)`).
**Action:** Close buttons should be positioned relative to the modal's inner content container (e.g., the card or dialog box itself) rather than the global screen overlay, ensuring they remain clickable even when toast notifications are active.
## 2025-02-23 - Handle Svelte-i18n vs Cachy i18n store parity and WASM build artifact isolation

**Learning:**
1. When fixing `Trap 1` string localization issues, Svelte 5 will seamlessly handle the reactive store variable transition from legacy `svelte-i18n` (using `$t()`) to Cachy's own `locales/i18n` store (using `$_()`) without issues.
2. The provided setup script `bash ./scripts/build_wasm.sh` generates a local WASM binary build (`static/wasm/technicals_wasm.wasm`). Do not inadvertently stage, commit, or package this binary artifact in PRs unless explicitly required.
3. Be sure to regenerate the `schema.d.ts` via `node scripts/generate-i18n-types.js` to avoid `npm run check` typescript errors when manipulating JSON locale files.

**Action:** Extracted legacy hardcoded string fallbacks in `AlertDefinitionsModal.svelte` and migrated it to the standard `$_` store. Added new `common.toggleVideoTooltip` and `common.channels` strings in English and German for `FloatingIframeButton.svelte`. Avoided committing the `static/wasm/technicals_wasm.wasm` build artifact.
## 2025-02-23 - GitHub Actions setup corrections
**Learning:** `actions/checkout@v6` does not exist and fails GitHub Actions workflows. The opencode action model `opencode/deepseek-v4-flash-free` was unavailable in CI, leading to a build failure.
**Action:** Replaced `actions/checkout@v6` with `actions/checkout@v4` and changed the model in `.github/workflows/opencode.yml` to `gemini-3-flash` based on the error output's suggestion.
## 2025-02-23 - GitHub Actions setup corrections (Follow-up)
**Learning:** OpenCode requires the model name to be fully qualified with the provider. `gemini-3-flash` is invalid; it must be `google/gemini-3-flash`.
**Action:** Replaced `gemini-3-flash` with `google/gemini-3-flash` in `.github/workflows/opencode.yml`.
