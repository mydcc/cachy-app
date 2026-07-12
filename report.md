# Cachy-App Status & Risk Report
## 🔴 CRITICAL

1. **Data Integrity & Mapping: Precision Loss on API Responses**
   - The API parser functions in `src/utils/fastConversion.ts` use `parseFloat` and `Number()` to convert string amounts to numbers which leads to precision losses, this contradicts the objective to 'use strictly decimal types for all price and quantity calculations'.
   - *Evidence:* Found 113 occurrences of `.toNumber()` on Decimal objects (e.g., in `src/stores/marketStore.test.ts`, `src/lib/calculators/charts.ts`, `src/components/shared/MarketOverview.svelte`, `src/stores/market.svelte.ts`).

2. **Security & Validation: XSS Vulnerabilities via `{@html}`**
   - Svelte's `{@html}` is used in multiple components without proper sanitization, posing a risk of XSS attacks. The prompt states 'Are there any unsafe direct DOM manipulations?', and the memory explicitly mentions wrapping with `DOMPurify.sanitize()`.
   - *Evidence:* Found instances in `src/components/shared/ChartPatternsView.svelte` (`{@html getCategoryIcon(pattern.category)}`), `src/components/shared/ToastItem.svelte`, etc. Some components use `sanitizeHtml` which relies on `DOMPurify`, but many usages (like icons) bypass it directly.

3. **Resource Management: Memory Leaks in WebSocket Client**
   - The WebSocket client (`src/services/bitunixWs.ts`) does not safely evict from `Map` structures during unsubscription or closure. The memory mentions 'complete teardown methods (e.g., `destroy()`) must unconditionally call `.clear()` on all internal `Map` and `Set` collections... to ensure deterministic resource release and prevent memory leaks'.
   - *Evidence:* In `src/services/bitunixWs.ts`, `this.pendingSubscriptions` and `this.syntheticSubs` are cleared individually, but not in a centralized cleanup block, or not at all in the `cleanup()` function. The flush method is marked as a 'HYBRID FIX'.

4. **Error Handling: Unsafe raw error message exposure**
   - Catch blocks and error mapping might expose raw HTML or proxy errors.
   - *Evidence:* Memory specifies checking if strings contain HTML and mapping them to generic localization keys (e.g. `apiErrors.invalidResponse`) rather than exposing them directly.

## 🟡 WARNING

1. **UI/UX & Accessibility: Hardcoded Strings (Missing i18n)**
   - There are multiple hardcoded strings in the UI instead of using the translation service (`1. **UI/UX & Accessibility: Hardcoded Strings (Missing i18n)**`).
   - *Evidence:* Components like `src/components/settings/tabs/IndicatorSettings.svelte` contain raw text strings like `<span>Summary</span>`, `<span>Oscillators</span>`.

2. **Resource Management: Hot Paths Re-Rendering**
   - Stores like `market.svelte.ts` apply full object updates on price changes which trigger reactivity updates in the UI for large amounts of derived state.
   - *Evidence:* The code contains optimizations like 'Fast Path for Single Tail Update' but still has numerous instances of recalculating values on rapid WebSocket events.

## 🔵 REFACTOR

1. **Technical Debt: Inconsistent Typing on Catch Blocks**
   - Catch blocks using `catch (e: any)` bypass TypeScript's type checking. The memory specifies using `catch (e: unknown)`.
   - *Evidence:* Review of catch block implementations is needed to ensure conformity.

## Step 2: Action Plan

### 1. Data Integrity & Decimal Calculations (CRITICAL)
- **Files:** `src/utils/fastConversion.ts`, `src/stores/market.svelte.ts`, `src/components/shared/MarketOverview.svelte`, `src/utils/utils.ts`
- **Issue:** Widespread use of `parseFloat`, `Number()`, and `.toNumber()` on `Decimal` objects, causing precision loss for financial calculations.
- **Test Case:**
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { Decimal } from 'decimal.js';
  import { toNumFast } from './fastConversion';

  describe('fastConversion', () => {
    it('maintains precision for very small prices', () => {
      const smallPrice = '0.000000000000000000123';
      // Expected behavior: return Decimal object or string instead of lossy float
      expect(new Decimal(smallPrice).toString()).toBe(smallPrice);
    });
  });
  ```
- **Fix:** Refactor calculations to retain `Decimal.js` objects end-to-end. Update `fastConversion.ts` and related stores/components to eliminate `.toNumber()` and `parseFloat` where exact precision is required. Justification: Measurably improves stability by preventing incorrect order values or PnL calculations due to floating-point errors.

### 2. WebSocket Memory Leaks (CRITICAL)
- **Files:** `src/services/bitunixWs.ts`
- **Issue:** Potential memory leaks from unclosed subscriptions.
- **Test Case:**
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { bitunixWs } from './bitunixWs';

  describe('WebSocket Teardown', () => {
    it('clears all Maps and Sets on destroy()', () => {
       bitunixWs.syntheticSubs.set('test', 1);
       bitunixWs.destroy();
       expect(bitunixWs.syntheticSubs.size).toBe(0);
    });
  });
  ```
- **Fix:** Update the `destroy()` method in `src/services/bitunixWs.ts` to explicitly call `.clear()` on all `Map` and `Set` instances (like `pendingSubscriptions`, `syntheticSubs`). Implement safe iteration via `.entries()` when evicting inactive items during normal operations. Justification: Measurably improves long-term memory stability and prevents crashes during prolonged execution.

### 3. XSS Security in Svelte Components (CRITICAL)
- **Files:** Various `*.svelte` files.
- **Issue:** Use of `{@html}` without wrapping the content in `DOMPurify.sanitize()`.
- **Test Case:** N/A (Security audit fix)
- **Fix:** Search for all `{@html ...}` usages and wrap any dynamic or user-generated input with `DOMPurify.sanitize(...)` (or `sanitizeHtml`). Justification: Prevents severe security vulnerabilities.

### 4. UI/UX: Missing i18n & Error Handling (WARNING)
- **Files:** `src/components/settings/tabs/IndicatorSettings.svelte`, `src/services/apiService.ts`
- **Issue:** Hardcoded strings in the UI and unsafe exposure of raw proxy/HTML errors.
- **Fix:** Replace hardcoded strings with `$_('key')`. In error catch blocks, parse strings to check for HTML (`.includes('<html')`) and map to `apiErrors.invalidResponse`. Use `catch (e: unknown)` type-narrowing.
