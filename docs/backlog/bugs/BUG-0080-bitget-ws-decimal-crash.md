---
id: BUG-0080
title: BitgetWS decimal initializations are vulnerable to unvalidated string crashes
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0080 — BitgetWS decimal initializations are vulnerable to unvalidated string crashes

## Symptom

`BitgetWebSocketService` crashes when processing incoming ticker or kline data if the API returns an empty string or non-numeric string for numerical fields like price or volume. Because Zod's `z.string()` accepts *any* string including `""`, the call to `new Decimal(t.last)` or `new Decimal(k[1])` throws an uncaught `[DecimalError] Invalid argument:`, taking down the entire message handler.

## Evidence

**Derived**

In `src/types/bitgetValidation.ts`, ticker fields are typed simply as `z.string()`:
```typescript
export const BitgetWSTickerSchema = z.object({
  instId: z.string(),
  last: z.string(),
```
This accepts `""`.

In `src/services/bitgetWs.ts`:
```typescript
        // Calc change if possible
        if (t.last && t.open24h) {
          const l = new Decimal(t.last);
          const o = new Decimal(t.open24h);
```
If `t.last` is `""`, `t.last` is falsy so it might skip. But wait, `""` is falsy. What if `t.last` is `"abc"` or `"-"` or `"NaN"`? `t.last` is truthy, `new Decimal("abc")` throws!

Even worse, for Klines:
```typescript
        const klines = msg.data.map((k: BitgetCandleTuple) => {
          // k is [ts, o, h, l, c, v]
          return {
            time: parseInt(k[0]),
            open: new Decimal(k[1]),
            high: new Decimal(k[2]),
            low: new Decimal(k[3]),
            close: new Decimal(k[4]),
            volume: new Decimal(k[5])
          };
        });
```
There is no Zod validation for `msg.data` items for klines (`BitgetCandleTuple` is likely just `[string, string, string, string, string, string]`). If the WebSocket sends an empty string or malformed candle array, `new Decimal(k[1])` immediately throws, crashing `handleMessage` completely.

Since this is unvalidated external input passing directly into the `Decimal` constructor, it violates the data integrity rule. A single bad ticker or candle tick will crash the WebSocket loop.

## Cause

Trusting string fields from external API responses directly into `Decimal` without validating that they are valid numeric strings.

## Fix

Update `BitgetWSTickerSchema` to ensure numeric strings, or wrap `Decimal` instantiations in a safe parser/try-catch in `bitgetWs.ts`. For `BitgetWSTickerSchema`, `z.string().regex(/^-?\d*\.?\d+$/)` or using `safeDecimal` utility is required. The same applies for mapping klines in `bitgetWs.ts`.

## Acceptance criteria

- [ ] A test reproduces the crash by passing a simulated WebSocket message with `msg.data = [["12345", "", "", "", "", ""]]`.
- [ ] The test passes with the fix (ignoring the bad tick instead of crashing).
- [ ] `Decimal` constructors in `bitgetWs.ts` are guarded or strictly validated.

## Links
