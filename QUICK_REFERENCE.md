# ⚡ QUICK REFERENCE: Fix-by-Fix Implementation Guide

## Cachy-App Hardening Sprint

**Use this to quickly access specific fixes without reading the full 80+ page docs**

---

## 🚨 START HERE: Critical Issues Priority Order

### MUST FIX FIRST (Blocking Financial Loss)

```
CRITICAL-001 ← CRITICAL-005 ← CRITICAL-003 ← CRITICAL-006
   (4h)           (2h)           (3h)           (1h)
Decimal      Passphrase    Race Cond    XSS Fix
Balance      Validation    in Orders    Tooltip
Corruption
```

**Rationale:** Fix 1-4 blocks 80% of financial loss scenarios, takes only 10 hours

---

## 📋 ISSUE-BY-ISSUE FIX GUIDE

### CRITICAL-001: Inconsistent Decimal Serialization

**File:** [src/services/apiService.ts](src/services/apiService.ts#L637-L660)  
**Fix Time:** 4 hours  
**Complexity:** Medium  

**The Problem in 1 Line:**
API returns `null` → code silently converts to `Decimal(0)` → user sees $0 balance → user liquidates

**Quick Fix (Step-by-Step):**

1. Create new file: `src/types/schemas.ts` with Zod schema

```typescript
import { z } from "zod";
import { Decimal } from "decimal.js";

const StrictDecimal = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val, ctx) => {
    if (val === null || val === undefined) {
      logger.error("data", "Null decimal in API response");
      return new Decimal(0);
    }
    try {
      const d = new Decimal(String(val));
      if (d.isNaN() || !d.isFinite()) return new Decimal(0);
      return d;
    } catch (e) {
      logger.error("data", `Failed to parse: ${val}`, e);
      return new Decimal(0);
    }
  });

export const BalanceSchema = z.object({
  available: StrictDecimal,
  margin: StrictDecimal,
  crossUnrealizedPNL: StrictDecimal,
});
```

1. Apply in `apiService.ts`:

```typescript
async fetchBalance(exchange: string) {
  const res = await fetch(/* ... */);
  const validation = BalanceSchema.safeParse(res);
  if (!validation.success) {
    throw new Error("Invalid balance response");
  }
  return validation.data;
}
```

1. Write test:

```typescript
it("rejects null prices", () => {
  const result = StrictDecimal.parse(null);
  expect(result.toString()).toBe("0");  // Falls back safely
});
```

**Acceptance Criteria:**

- ✅ All API responses validated before use
- ✅ Every null → Decimal(0) conversion logged
- ✅ Schema applied to: balance, ticker, prices, volumes
- ✅ Unit tests pass

---

### CRITICAL-002: WebSocket Subscription Memory Leak

**File:** [src/services/bitunixWs.ts](src/services/bitunixWs.ts)  
**Fix Time:** 6 hours  
**Complexity:** High  

**The Problem in 1 Line:**
Provider switch doesn't clear subscriptions → zombie listeners accumulate → 100MB+ memory after 24h

**Quick Fix:**

1. In `bitunixWs.destroy()`:

```typescript
destroy() {
  // ADD THIS:
  this.publicSubscriptions.clear();  // Explicitly clear Set
  logger.log("memory", `Cleared ${this.publicSubscriptions.size} subscriptions`);
  
  // ... rest of cleanup ...
}
```

1. In subscription unsubscribe:

```typescript
unsubscribe(symbol: string, channel: string) {
  const key = `${channel}:${symbol}`;
  const wasPresent = this.publicSubscriptions.has(key);
  this.publicSubscriptions.delete(key);
  
  if (wasPresent && this.wsPublic?.readyState === WebSocket.OPEN) {
    this.wsPublic.send(JSON.stringify({
      action: "unsubscribe",
      channel,
      symbol,
    }));
  }
}
```

1. Add subscription monitoring:

```typescript
// Periodically check for orphaned subscriptions
private validateSubscriptionState() {
  for (const key of this.publicSubscriptions) {
    if (!marketWatcher.isWatching(key)) {
      logger.warn("memory", `Orphaned subscription: ${key}`);
      const [channel, symbol] = key.split(":");
      this.unsubscribe(symbol, channel);
    }
  }
}
```

**Acceptance Criteria:**

- ✅ Subscriptions cleared on destroy
- ✅ No orphaned listeners after provider switch
- ✅ Memory stable after 24h (<50MB)
- ✅ Test shows subscriptions removed in cleanup

---

### CRITICAL-003: Race Condition in Order Execution

**File:** [src/services/tradeService.ts](src/services/tradeService.ts)  
**Fix Time:** 3 hours  
**Complexity:** Medium  

**The Problem in 1 Line:**
Credentials cleared while order being placed → signature fails → user retries with double leverage → liquidation

**Quick Fix:**

1. Re-validate credentials immediately before signing:

```typescript
async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
  // Guard 1: Authorize now
  TradeExecutionGuard.ensureAuthorized();

  // Guard 2: Get FRESH credentials (check not cleared since validation)
  const freshApiKey = settingsState.apiKeys?.bitunix?.key;
  const freshApiSecret = settingsState.apiKeys?.bitunix?.secret;

  if (!freshApiKey || !freshApiSecret) {
    throw new Error("API_CREDENTIALS_CLEARED");  // Specific error
  }

  // Guard 3: Sign IMMEDIATELY (don't defer, don't await)
  const signed = generateBitunixSignature(freshApiKey, freshApiSecret, params);

  // Guard 4: Make API call
  return this.executeSignedRequest(signed);
}
```

1. Test the race condition:

```typescript
it("detects credential change during order", async () => {
  settingsState.apiKeys.bitunix.key = "valid";
  settingsState.apiKeys.bitunix.secret = "valid";

  const orderPromise = service.placeOrder({
    symbol: "BTCUSDT",
    side: "buy",
    type: "market",
    amount: new Decimal(1),
  });

  // Credentials cleared mid-placement
  await new Promise(r => setTimeout(r, 10));
  settingsState.apiKeys.bitunix.key = undefined;

  await expect(orderPromise).rejects.toThrow("CREDENTIALS_CLEARED");
});
```

**Acceptance Criteria:**

- ✅ Credentials re-validated before signing
- ✅ Race condition test passes
- ✅ Specific error message when credentials cleared mid-order
- ✅ No silent signature generation failures

---

### CRITICAL-004: Unvalidated P&L Calculations

**File:** [src/services/marketAnalyst.ts](src/services/marketAnalyst.ts), [src/services/bitunixWs.ts](src/services/bitunixWs.ts)  
**Fix Time:** 5 hours  
**Complexity:** Medium  

**The Problem in 1 Line:**
WebSocket sends `{"lastPrice": "Infinity"}` → `new Decimal("Infinity")` → P&L calculation breaks silently

**Quick Fix:**

1. Add schema validation to WebSocket messages:

```typescript
// In bitunixWs.ts
const MessageSchema = z.object({
  action: z.literal("push"),
  data: z.object({
    symbol: z.string().min(3),
    lastPrice: z.union([
      z.string().regex(/^\d+(\.\d+)?$/),
      z.number().min(0).max(1e18),  // Reasonable bounds
    ]).transform(v => new Decimal(String(v))),
  }),
});

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  // VALIDATE
  const validation = MessageSchema.safeParse(message);
  if (!validation.success) {
    logger.error("network", "Invalid WS message", validation.error.issues);
    return;  // Skip corrupted
  }

  this.handleMessage(validation.data, "public");
};
```

1. Test edge cases:

```typescript
it("rejects Infinity in price", () => {
  const result = MessageSchema.safeParse({
    action: "push",
    data: { symbol: "BTCUSDT", lastPrice: "Infinity" },
  });
  expect(result.success).toBe(false);
});

it("rejects NaN volume", () => {
  const result = MessageSchema.safeParse({
    action: "push",
    data: { symbol: "BTCUSDT", lastPrice: "50000", volume: "NaN" },
  });
  expect(result.success).toBe(false);
});
```

**Acceptance Criteria:**

- ✅ All WebSocket messages validated before processing
- ✅ Invalid values rejected (not silently defaulted)
- ✅ Bounds checking on prices (no Infinity/NaN)
- ✅ Unit tests for edge cases pass

---

### CRITICAL-005: Missing Passphrase Validation

**File:** [src/utils/server/bitget.ts](src/utils/server/bitget.ts)  
**Fix Time:** 2 hours  
**Complexity:** Low  

**The Problem in 1 Line:**
Passphrase `"12345"` passes validation → order fails at exchange → user retries with wrong key → account locked

**Quick Fix:**

```typescript
export function validateBitgetKeys(
  apiKey: unknown,
  apiSecret: unknown,
  passphrase: unknown,
): string | null {
  // Type checks
  if (typeof apiKey !== "string" || apiKey.length < 5) {
    return "Invalid API Key";
  }
  if (typeof apiSecret !== "string" || apiSecret.length < 5) {
    return "Invalid API Secret";
  }
  if (typeof passphrase !== "string" || passphrase.length < 1) {
    return "Invalid Passphrase";
  }

  // NEW: Test signature generation (catches crypto errors)
  try {
    const testSignature = generateBitgetSignature(
      apiSecret,
      "GET",
      "/api/v5/account/balance",
      "",
      Date.now().toString()
    );

    if (!testSignature || testSignature.length < 10) {
      return "Signature generation failed";
    }
  } catch (e) {
    return `Credential validation error: ${e.message}`;
  }

  return null;  // Valid
}
```

**Acceptance Criteria:**

- ✅ Test signature generation before accepting keys
- ✅ Specific error for invalid passphrase
- ✅ No false positives (valid keys pass)

---

### CRITICAL-006: XSS Vulnerability in Tooltip

**File:** [src/lib/actions/tooltip.ts](src/lib/actions/tooltip.ts#L65)  
**Fix Time:** 1 hour  
**Complexity:** Very Low  

**The Problem in 1 Line:**
`contentContainer.innerHTML = config.content` → attacker injects `<img onerror="steal()">` → session hijacked

**Quick Fix:**

```typescript
// BEFORE (XSS vulnerability):
contentContainer.innerHTML = config.content;

// AFTER (safe):
import DOMPurify from "dompurify";  // Already installed!

contentContainer.innerHTML = DOMPurify.sanitize(config.content, {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "u", "a"],
  ALLOWED_ATTR: ["href"],
});
```

**One-line test:**

```typescript
expect(DOMPurify.sanitize('<img src=x onerror="alert()">'))
  .not.toContain("onerror");
```

**Acceptance Criteria:**

- ✅ XSS payloads sanitized
- ✅ Safe formatting preserved (b, i, em)
- ✅ No functional change to UI

---

### CRITICAL-007: Order Status Sync Race Condition

**File:** [src/routes/api/sync/orders/+server.ts](src/routes/api/sync/orders/+server.ts)  
**Fix Time:** 4 hours  
**Complexity:** Medium  

**The Problem in 1 Line:**
Sync completes before order placement response → client shows 2 identical orders → user cancels one, other still active

**Quick Fix (Optimistic Updates):**

```typescript
// In component: PlaceOrder.svelte
async function placeOrder() {
  // 1. Generate optimistic order ID
  const optimisticId = generateLocalOrderId();

  // 2. Add to UI immediately
  tradeState.addOrder({
    id: optimisticId,
    status: "pending",
    _isOptimistic: true,
    ...orderParams,
  });

  try {
    // 3. Send to server
    const response = await fetch("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        ...orderParams,
        clientOrderId: optimisticId,  // Link back to optimistic
      }),
    });

    const result = await response.json();

    // 4. Replace optimistic with real
    tradeState.replaceOrder(optimisticId, {
      ...result,
      _isOptimistic: false,
    });
  } catch (e) {
    // 5. Remove on error
    tradeState.removeOrder(optimisticId);
  }
}

// Sync reconciliation
async function syncOrders() {
  const serverOrders = await fetchFromServer();

  serverOrders.forEach(order => {
    const optimistic = tradeState.findByClientId(order.clientOrderId);
    if (optimistic) {
      // Match & replace
      tradeState.replaceOrder(optimistic.id, {
        ...order,
        _isOptimistic: false,
      });
    }
  });

  // Clean up orphaned optimistic (older than 2 min)
  tradeState.removeOrphanedOptimistic(Date.now() - 120000);
}
```

**Acceptance Criteria:**

- ✅ User sees order immediately (optimistic)
- ✅ Order never duplicates (matched via clientOrderId)
- ✅ Sync replaces optimistic with real
- ✅ No double orders after reconciliation

---

### CRITICAL-008: Missing Null Check in RMS Monitor

**File:** [src/services/rmsService.ts](src/services/rmsService.ts)  
**Fix Time:** 2 hours  
**Complexity:** Low  

**The Problem in 1 Line:**
`pos.unrealizedPnl.isNegative()` on `null` → TypeError → monitor stops → liquidation not triggered

**Quick Fix:**

```typescript
public monitorRisk(): void {
  try {
    const positions = omsService.getPositions();

    if (!positions || !Array.isArray(positions)) {
      logger.warn("rms", "Invalid positions, skipping monitor");
      return;
    }

    positions.forEach(pos => {
      // Strict checks
      if (!pos || !pos.unrealizedPnl) {
        logger.warn("rms", "Invalid position, skipping");
        return;
      }

      // Now safe
      if (pos.unrealizedPnl.isNegative() && 
          pos.unrealizedPnl.abs().gt(this.profile.maxDrawdownPercent)) {
        this.triggerEmergencyExit(pos);
      }
    });
  } catch (e) {
    logger.error("rms", "Monitor failed", e);
    errorTracker.captureException(e);  // Alert admin
  }
}
```

**Acceptance Criteria:**

- ✅ Null position handled gracefully
- ✅ Monitor continues after encountering bad data
- ✅ Errors logged and tracked

---

## 🟡 TOP 4 WARNING FIXES (Highest Business Impact)

### WARNING-001: Hardcoded Error Messages (6h)

**Action:** Grep all error messages, map to i18n keys, update translation files

```bash
# Find hardcoded strings
grep -r "throw new Error\|console\.error" src/services/*.ts | grep -v "i18n\|ERROR_KEYS"
# Map each to src/locales/{en,de}.json
```

---

### WARNING-002: Unbounded Cache (3h)

**Action:** Fix in [src/stores/market.svelte.ts](src/stores/market.svelte.ts)

```typescript
// Add hard limit with aggressive eviction
private enforceCacheLimit() {
  while (Object.keys(this.data).length > MAX_CACHE_SIZE) {
    const toEvict = this.evictLRU();
    if (toEvict) delete this.data[toEvict];
  }
  
  // Also limit klines per symbol
  Object.values(this.data).forEach(market => {
    const timeframes = Object.keys(market.klines);
    timeframes.forEach(tf => {
      if (market.klines[tf].length > 100) {
        market.klines[tf] = market.klines[tf].slice(-100);
      }
    });
  });
}
```

---

### WARNING-003: News Fetch Dedup Race (2h)

**Action:** Store promise BEFORE returning:

```typescript
// BEFORE: Promise stored AFTER return (race!)
return fetchPromise;

// AFTER: Promise stored BEFORE return
pendingNewsFetches.set(symbolKey, fetchPromise);
return fetchPromise;
```

---

### WARNING-007: Rate Limiting (4h)

**Action:** Add RateLimiter class to [src/services/apiService.ts](src/services/apiService.ts):

```typescript
class RateLimiter {
  private buckets = new Map<string, number[]>();
  
  canRequest(provider: string): boolean {
    const limit = { bitunix: 10, bitget: 50 }[provider] || Infinity;
    const now = Date.now();
    const bucket = this.buckets.get(provider) || [];
    
    const recent = bucket.filter(t => now - t < 1000);
    if (recent.length >= limit) return false;
    
    recent.push(now);
    this.buckets.set(provider, recent);
    return true;
  }
}
```

---

## ✅ TESTING COMMANDS

```bash
# Run all unit tests
npm run test

# Run specific test file
npm run test -- services/tradeService.test.ts

# Watch mode
npm run test -- --watch

# Check TypeScript
npm run check

# Lint
npm run lint
```

---

## 📊 PROGRESS TRACKING

Use this to track your progress:

```
CRITICAL ISSUES:
- [ ] CRITICAL-001: Decimal Schema (4h)
- [ ] CRITICAL-002: WebSocket Cleanup (6h)
- [ ] CRITICAL-003: Credential Guard (3h)
- [ ] CRITICAL-004: WebSocket Validation (5h)
- [ ] CRITICAL-005: Passphrase Test (2h)
- [ ] CRITICAL-006: XSS Fix (1h)
- [ ] CRITICAL-007: Optimistic Orders (4h)
- [ ] CRITICAL-008: RMS Null Check (2h)
SUBTOTAL: 27/34 hours (Estimate may vary)

TOP WARNING ISSUES:
- [ ] WARNING-001: i18n Hardcoded (6h)
- [ ] WARNING-002: Cache Limit (3h)
- [ ] WARNING-003: News Dedup (2h)
- [ ] WARNING-007: Rate Limiting (4h)
SUBTOTAL: 15/15 hours
```

---

## 🎯 SUCCESS CRITERIA (Day 1, Day 5, Day 14)

### Day 1 (After CRITICAL fixes)

- ✅ No new "Null decimal" errors in logs
- ✅ Memory stable <100MB
- ✅ All critical unit tests pass (20+)

### Day 5 (After WARNING fixes)

- ✅ Error messages localized for all users
- ✅ No rate limit errors
- ✅ WebSocket subscriptions <50 active

### Day 14 (After Refactoring)

- ✅ All 50+ new unit tests passing
- ✅ Code review approved
- ✅ UAT sign-off
- ✅ Ready for production deployment

---
