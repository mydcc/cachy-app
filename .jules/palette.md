
## 2026-08-12 - Window Controls Accessibility
**Learning:** Hardcoded English `title` attributes on icon-only buttons (like Window Controls) are accessibility failures that bypass the translation layer and create a poor experience for screen reader users on non-English locales. To replace them, standard i18n keys must be used and regenerated using `node scripts/generate-i18n-types.js` to avoid `svelte-check` type errors. The `as string` type assertion should be avoided in favor of correctly adding the keys and regenerating the schema.
**Action:** Replaced hardcoded English title strings (e.g. `title="Export"`) in `src/components/shared/windows/WindowFrame.svelte` with `$_(...)` i18n calls (e.g., `title={$_("common.export")}`), added `aria-label`s for screen readers, and defined the translations in `en.json` and `de.json`.

## 2026-08-16 - Title tooltips in MarketDashboardModal
**Learning:** Hardcoded english tooltips (`title="..."`) are often present in nested Svelte elements like trend indicator bars. They must also be extracted to both `en.json` and `de.json`.
**Action:** Replaced hardcoded "15m Trend" strings with `$_("app.marketDashboard.trendMatrix.trend15m")`.

## 2026-08-16 - Global Modal Close Buttons
**Learning:** When positioning a close button absolutely within a full-screen modal overlay (like `fixed inset-0`), placing it at `top-4 right-4` or `top-6 right-6` will cause it to overlap directly with the `ToastContainer`, which is anchored at `top:24px/right:24px` and has a very high z-index (`var(--z-toast)`).
**Action:** Close buttons should be positioned relative to the modal's inner content container (e.g., the card or dialog box itself) rather than the global screen overlay, ensuring they remain clickable even when toast notifications are active.
