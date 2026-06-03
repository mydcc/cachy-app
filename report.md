# In-depth Status & Risk Report: cachy-app

## 🔴 CRITICAL
* **Data integrity & mapping**:
  - In `src/services/tradeService.ts`, the `fetchTpSlOrders` method blindly casts API responses to `any` and then forces them to `TpSlOrder[]` without validating Decimal formats or schema types. This exposes the application to silent data loss, precision bugs during calculations, and completely hidden orders if the API payload changes or drops fields.
  - In `src/services/newsService.ts`, API payload inputs (`params`) are weakly typed as `any`, leading to potential malformed requests and silent failures during the fetch cycle.

## 🟡 WARNING
* **UI/UX & Accessibility (i18n)**:
  - `src/services/newsService.ts` contains hardcoded English literal strings within the `try/catch` block for fetching errors (e.g., throwing "NO_API_KEY", and hardcoded text like `"Failed to fetch CryptoPanic"`). These should map to `apiErrors.generic` for unified handling, while still preserving observability for developers.
* **Resource Management & Performance**:
  - `src/services/marketWatcher.ts` maintains extensive arrays, requiring bounded eviction strategies to prevent runaway memory leaks.

## 🔵 REFACTOR
* **Code Smells (TypeScript Any)**:
  - Widespread reliance on `any` instead of `unknown` across API fetching boundaries in `tradeService.ts`, `newsService.ts`, and `marketWatcher.ts`.

# Action Plan

## 1. Type Safety & Validation in `tradeService.ts`
- Implement robust Zod validation for TP/SL orders by adding `TpSlOrderSchema` to `apiSchemas.ts`.
- Important: To avoid wiping out an entire list of TP/SL orders due to a single invalid element, validate items *individually* inside `fetchTpSlOrders` and log validation errors for skipped items without crashing the overall position state.

## 2. Refactor Typings in `tradeService.ts` & `newsService.ts`
- Replace `[key: string]: any` and explicit payload casting with `unknown` or `Record<string, unknown>`.
- In `tradeService.ts`'s `serializePayload`, strictly cast `payload` to ensure recursive checks are safe without dropping to `any`.
- In `newsService.ts`, refactor payload items from `any` to `Record<string, unknown>`.

## 3. Standardize Errors
- In `newsService.ts`, retain internal contextual debug strings but use them correctly within safe catch blocks, passing the underlying error for proper i18n handling without wiping the developer context.

## 4. Verification
- Verify the `report.md` was created properly.
