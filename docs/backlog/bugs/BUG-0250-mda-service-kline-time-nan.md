---
id: BUG-0250
title: mdaService.normalizeKlines yields NaN for kline time due to undefined fallback
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
---

# BUG-0250 — mdaService.normalizeKlines yields NaN for kline time due to undefined fallback

## Symptom

When standardizing market data through `mdaService.normalizeKlines`, the resulting `time` property of each kline object can become `NaN` if the `time` field is missing from the underlying API payload. This poisons technical indicator calculations and historical chart views that rely on time continuity.

## Evidence

**Demonstrated.** A test script mimicking the payload shape shows the defect directly:
```typescript
import { mdaService } from './src/services/mdaService.js';
console.log(mdaService.normalizeKlines([{ open: 100, close: 105 }], 'bitunix'));
```
Output:
```
[
  {
    time: NaN,
    open: 100,
    high: 100,
    low: 100,
    close: 105,
    volume: '0'
  }
]
```
The same issue applies to generic/Bitget payloads since `Number(undefined)` evaluates to `NaN`.

## Cause

In `src/services/mdaService.ts`, `normalizeKlines` tries to construct a fallback for the timestamp across different payload structures. For Bitunix: `Number(k.time || k.t || k.ts || k.timestamp)`, and for generic/Bitget: `Number(k[0] || k.time)`.
If none of those fields exist in the raw kline object (which happens under partial pushes or schema divergence), the logical OR chain evaluates to `undefined`, and `Number(undefined)` produces `NaN`.

## Fix

Change `normalizeKlines` to reject/drop the kline if a timestamp is totally missing by returning `null`, exactly as it already does for a missing `open` or `close`.

## Acceptance criteria

- [ ] A test reproduces the `NaN` timestamp defect with missing time fields and fails without the fix
- [ ] The test passes with the fix by filtering out klines with a missing timestamp

## Links

None.
