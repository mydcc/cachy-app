[no issue]

**💡 What**
Localized the hardcoded "Engine Debug Panel" title in `EngineDebugPanel.svelte`.

**🎯 Why**
Found via a `grep` sweep of hardcoded UI strings in `src/`. Replaced it with an i18n key to satisfy Trap 1 (bilingual parity) and allow German users to view translated UI strings in their native language rather than fallback English.

**♿ Accessibility**
No explicit WCAG improvement, but providing localized headers directly benefits users relying on translated text semantics.

**🌍 i18n**
Added `settings.system.debug.title` ("Engine Debug Panel") to both `de.json` and `en.json`. Regenerated types via `scripts/generate-i18n-types.js`.

**🎨 Theming**
No hardcoded color values modified. Maintains usage of CSS variable inheritance for semantic classes.

**📸 Before/After**
- Before: `<h4 class="panel-title">⚡ Engine Debug Panel</h4>`
- After: `<h4 class="panel-title">⚡ {$_("settings.system.debug.title")}</h4>`

**✅ Verification**
- `npm run check`: Passes successfully.
- `npm run lint`: Passes with 0 errors.
- `npm test`: Suite runs seamlessly.

---
*PR created automatically by Jules for task 21533845497115570 started by mydcc*
