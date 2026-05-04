1. **Fix incorrect error throw in `src/services/tradeService.ts`**:
   - Open `src/services/tradeService.ts`. Find the `TRADE_ERRORS` object around line 72. Add `INVALID_AMOUNT: "apiErrors.invalidAmount"` to it.
   - Run `sed` to replace `throw new Error("apiErrors.invalidAmount")` with `throw new Error(TRADE_ERRORS.INVALID_AMOUNT)` in `closePosition` and `flashClosePosition`.
   - Update `src/services/tradeService_errors.test.ts` to expect `TRADE_ERRORS.INVALID_AMOUNT` instead of `"apiErrors.invalidAmount"`.
   - *Verification:* `grep` the modified files and read output to ensure changes are accurate.

2. **Add bounded eviction (LRU / Threshold) to Memory Leak targets**:
   - `src/services/omsService.ts`: Check `updatePosition` logic. If `this.positions.size > this.MAX_POSITIONS`, the current code attempts to prune items with `0` amount. Add a fallback hard eviction limit: `if (this.positions.size > this.MAX_POSITIONS * 2) { const keys = Array.from(this.positions.keys()); for (let i = 0; i < keys.length - this.MAX_POSITIONS; i++) this.positions.delete(keys[i]); }`. This acts as an emergency bounds check.
   - `src/services/marketWatcher.ts`: In `ensureHistory`, where `this.exhaustedHistory.add(exhaustKey)` happens, inject an eviction step: `if (this.exhaustedHistory.size > 1000) { const first = this.exhaustedHistory.values().next().value; if (first) this.exhaustedHistory.delete(first); }`. Do the same anywhere `exhaustedHistory.add` is called.
   - *Verification:* Use `cat` and `grep` to read the exact changes implemented in both files and ensure valid TypeScript syntax.

3. **Improve Type Safety and Parsing for `TpSlOrder` in `tradeService.ts`**:
   - At the top of `src/services/tradeService.ts`, add `import { z } from "zod";`.
   - Add the exact `TpSlOrderSchema` based on `TpSlOrder` interface:
     ```typescript
     const TpSlOrderSchema = z.object({
         orderId: z.string().optional(), id: z.string().optional(), planId: z.string().optional(),
         symbol: z.string(), planType: z.enum(["PROFIT", "LOSS"]).or(z.string()),
         triggerPrice: z.string().optional(), qty: z.string().optional(),
         status: z.string().optional(), ctime: z.number().optional(), createTime: z.number().optional(),
         side: z.string().optional(), price: z.string().optional(), executePrice: z.string().optional(),
         clientOrderId: z.string().optional(), reduceOnly: z.boolean().optional(),
         workingType: z.string().optional(), timeInForce: z.string().optional()
     }).passthrough();
     ```
   - In `fetchTpSlOrders`, refactor the unsafe parsing blocks to:
     ```typescript
     const rawArray = Array.isArray(data) ? data : data.rows || [];
     const res: TpSlOrder[] = [];
     for (const item of rawArray) {
         const parsed = TpSlOrderSchema.safeParse(item);
         if (parsed.success) res.push(parsed.data as TpSlOrder);
         else logger.warn("market", "Invalid TpSlOrder skipped", { error: parsed.error });
     }
     ```
   - *Verification:* `grep` for `as TpSlOrder[]` to ensure all unsafe casts are removed, and read the updated method to confirm correctness.

4. **Verify tests and pre-commit**:
   - `npm run test src/services/tradeService_errors.test.ts`
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
