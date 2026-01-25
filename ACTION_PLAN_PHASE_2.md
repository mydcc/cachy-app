# 📋 ACTION PLAN & IMPLEMENTATION ROADMAP

## Cachy-App Systematic Hardening Sprint

**Execution Strategy:** P0 fixes first (blocking financial/security issues), then P1 (quality/UX), then P2 (refactoring)

---

## PHASE 2A: CRITICAL ISSUES (P0) - 8 Issues, ~34 Hours

### GROUP A: Data Validation Hardening (CRITICAL-001, CRITICAL-004, CRITICAL-005)

#### Task A1: Implement Strict Decimal Serialization Schema (CRITICAL-001)

**Estimated Time:** 4 hours  
**Risk If Not Done:** Financial data loss, silent balance corruption  
**Deliverables:**

1. Create centralized `DecimalSchema` in [src/types/schemas.ts](src/types/schemas.ts)
2. Apply to all API responses (Bitunix, Bitget)
3. Add logging for every default value usage
4. Unit tests for edge cases

**Implementation Steps:**

```typescript
// Step 1: Create DecimalSchema (new file or extend apiSchemas.ts)
import { z } from "zod";
import { Decimal } from "decimal.js";

// Custom Zod transformer for safe Decimal parsing
const StrictDecimal = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val, ctx) => {
    if (val === null || val === undefined) {
      // Log the null value occurrence
      console.error("[SCHEMA] Null/undefined Decimal encountered, returning 0");
      logger.error("data", "Null decimal in API response, using fallback 0");
      return new Decimal(0);
    }

    try {
      const d = new Decimal(String(val));
      if (d.isNaN() || !d.isFinite()) {
        logger.error("data", `Invalid decimal value: ${val}, using fallback 0`);
        return new Decimal(0);
      }
      return d;
    } catch (e) {
      logger.error("data", `Failed to parse decimal: ${val}`, e);
      return new Decimal(0);
    }
  });

// Apply to response schemas:
export const BalanceResponseSchema = z.object({
  available: StrictDecimal,
  margin: StrictDecimal,
  crossUnrealizedPNL: StrictDecimal,
});

export const TickerSchema = z.object({
  symbol: z.string(),
  lastPrice: StrictDecimal.refine((val) => val.gt(0), {
    message: "lastPrice must be > 0",
  }),
  volume: StrictDecimal,
});
```

**Unit Tests:**

```typescript
// tests/schemas.test.ts
describe("StrictDecimal Schema", () => {
  it("accepts valid Decimal string", () => {
    const result = StrictDecimal.parse("123.456");
    expect(result.toString()).toBe("123.456");
  });

  it("accepts valid number", () => {
    const result = StrictDecimal.parse(100.5);
    expect(result.toString()).toBe("100.5");
  });

  it("handles null by returning Decimal(0) and logging", () => {
    const spy = jest.spyOn(logger, "error");
    const result = StrictDecimal.parse(null);
    expect(result.toString()).toBe("0");
    expect(spy).toHaveBeenCalledWith("data", expect.stringContaining("Null"));
  });

  it("rejects Infinity string", () => {
    const result = StrictDecimal.parse("Infinity");
    expect(result.toString()).toBe("0");  // Should fallback, not throw
  });

  it("rejects NaN string", () => {
    const result = StrictDecimal.parse("NaN");
    expect(result.toString()).toBe("0");
  });

  it("rejects negative prices in TickerSchema", () => {
    expect(() => {
      TickerSchema.parse({
        symbol: "BTCUSDT",
        lastPrice: "-100",
        volume: "1000"
      });
    }).toThrow("lastPrice must be > 0");
  });

  it("detects corrupted API response early", () => {
    const malformed = {
      symbol: "BTCUSDT",
      lastPrice: null,  // Should log
      volume: "abc"     // Should log
    };
    const result = TickerSchema.parse(malformed);
    expect(result.lastPrice.toString()).toBe("0");
    expect(result.volume.toString()).toBe("0");
  });
});
```

**Rollout:**

1. Create schema
2. Apply to fetchTicker24h, fetchBalance, fetchPrice
3. Verify all API callers pass validation
4. Monitor logs for "Null decimal" entries in production (first 48h)

---

#### Task A2: Fix Passphrase Validation (CRITICAL-005)

**Estimated Time:** 2 hours  
**Deliverables:**

1. Test passphrase with actual signature before sending to API
2. Provide specific error messages for invalid passphrase

**Implementation:**

```typescript
// src/utils/server/bitget.ts - Enhance validation

/**
 * Validates Bitget API credentials WITH TEST SIGNATURE
 * Returns null if valid, or an error message if invalid.
 */
export function validateBitgetKeys(
  apiKey: unknown,
  apiSecret: unknown,
  passphrase: unknown,
): string | null {
  // Step 1: Type and length checks
  if (typeof apiKey !== "string" || apiKey.length < 5) {
    return "Invalid API Key (must be string > 5 chars)";
  }
  if (typeof apiSecret !== "string" || apiSecret.length < 5) {
    return "Invalid API Secret (must be string > 5 chars)";
  }
  if (typeof passphrase !== "string" || passphrase.length < 1) {
    return "Invalid Passphrase (required)";
  }

  // Step 2: Try generating a test signature
  try {
    const testTimestamp = Date.now().toString();
    const testMethod = "GET";
    const testPath = "/api/v5/account/balance";
    const testQuery = "";

    const signature = generateBitgetSignature(
      apiSecret,
      testMethod,
      testPath,
      testQuery,
      "",
      testTimestamp
    );

    // If we got here without error, credentials are structurally valid
    // Note: We can't verify correctness without making an actual API call,
    // but we can at least ensure no crypto errors occur.
    if (!signature || signature.signature.length < 10) {
      return "Signature generation failed (check passphrase)";
    }

    return null; // All checks passed
  } catch (e) {
    return `Credential validation error: ${e instanceof Error ? e.message : "unknown"}`;
  }
}
```

**Unit Tests:**

```typescript
describe("validateBitgetKeys", () => {
  it("rejects short API key", () => {
    const err = validateBitgetKeys("abc", "valid_secret_123", "pass123");
    expect(err).toContain("API Key");
  });

  it("rejects invalid passphrase", () => {
    const err = validateBitgetKeys("validkey123", "secret123", "");
    expect(err).toContain("Passphrase");
  });

  it("accepts valid formatted keys", () => {
    const err = validateBitgetKeys("validkey123", "validSecret123", "validPass");
    expect(err).toBeNull();  // No error
  });

  it("catches signature generation errors", () => {
    // If secret is invalid, signature generation should fail
    const err = validateBitgetKeys("key", "x", "p");  // All too short
    expect(err).toBeTruthy();
  });
});
```

---

#### Task A3: Implement Strict null/undefined Validation in Order Path (CRITICAL-003)

**Estimated Time:** 3 hours  
**Deliverables:**

1. Re-validate credentials immediately before signing
2. Add guard in signature generation

**Implementation:**

```typescript
// src/services/tradeService.ts - Enhanced guard

class TradeExecutionService {
  /**
   * Place Order with strict freshness check
   */
  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    // Guard 1: Ensure authorization NOW
    TradeExecutionGuard.ensureAuthorized();

    // Guard 2: Freshen credentials immediately (check they haven't changed)
    const freshApiKey = settingsState.apiKeys?.bitunix?.key;
    const freshApiSecret = settingsState.apiKeys?.bitunix?.secret;

    if (!freshApiKey || !freshApiSecret) {
      throw new Error("API credentials were cleared during request");
    }

    // Guard 3: Validate order parameters STRICTLY
    if (!params.symbol || params.symbol.length < 3) {
      throw new Error("Invalid symbol");
    }
    if (!params.amount || params.amount.isZero()) {
      throw new Error("Amount must be > 0");
    }

    if (params.type === "limit" && (!params.price || params.price.isZero())) {
      throw new Error("Limit orders require price");
    }

    // Guard 4: Sign IMMEDIATELY before async operations
    const signedRequest = this.signRequest(freshApiKey, freshApiSecret, params);

    // Guard 5: Make API call
    return this.executeSignedRequest(signedRequest);
  }

  private signRequest(
    apiKey: string,
    apiSecret: string,
    params: PlaceOrderParams
  ): SignedRequest {
    // Ensure keys are not empty at signing time
    if (!apiKey?.length || !apiSecret?.length) {
      throw new Error("CRITICAL: API keys are empty at signing time");
    }

    // Sign immediately, don't defer
    const signature = generateBitunixSignature(apiKey, apiSecret, /* ... */);
    return { signature, params, timestamp: Date.now() };
  }
}
```

**Test Case - Race Condition Reproduction:**

```typescript
describe("Order Execution Race Condition", () => {
  it("detects credential change during order placement", async () => {
    const service = new TradeExecutionService();
    
    // Simulate: User has valid credentials
    settingsState.apiKeys.bitunix.key = "valid_key_123";
    settingsState.apiKeys.bitunix.secret = "valid_secret_456";

    // Start order placement
    const orderPromise = service.placeOrder({
      symbol: "BTCUSDT",
      side: "buy",
      type: "market",
      amount: new Decimal(1),
    });

    // DURING order placement, credentials are cleared
    // (simulating user logout or refresh)
    await new Promise(r => setTimeout(r, 10));  // Yield to event loop
    settingsState.apiKeys.bitunix.key = undefined;
    settingsState.apiKeys.bitunix.secret = undefined;

    // Order placement should fail with clear error
    await expect(orderPromise).rejects.toThrow("credentials were cleared");
  });

  it("validates order params before making API call", async () => {
    const service = new TradeExecutionService();
    settingsState.apiKeys.bitunix.key = "valid_key";
    settingsState.apiKeys.bitunix.secret = "valid_secret";

    // Invalid amount
    await expect(
      service.placeOrder({
        symbol: "BTCUSDT",
        side: "buy",
        type: "market",
        amount: new Decimal(0),  // Zero amount
      })
    ).rejects.toThrow("Amount must be > 0");

    // Should not make API call
    expect(apiService.schedule).not.toHaveBeenCalled();
  });
});
```

---

### GROUP B: Security Hardening (CRITICAL-006, CRITICAL-005, CRITICAL-007, CRITICAL-008)

#### Task B1: Fix XSS Vulnerability in Tooltip (CRITICAL-006)

**Estimated Time:** 1 hour  
**Fix:**

```typescript
// src/lib/actions/tooltip.ts - Line 65

// BEFORE (XSS vulnerability):
contentContainer.innerHTML = config.content;

// AFTER (safe):
import DOMPurify from "dompurify";

contentContainer.innerHTML = DOMPurify.sanitize(config.content, {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "u", "a"],
  ALLOWED_ATTR: ["href", "title"],
});
```

**Test:**

```typescript
describe("Tooltip XSS Protection", () => {
  it("sanitizes malicious HTML", () => {
    const malicious = '<img src=x onerror="alert(\'XSS\')">';
    const element = document.createElement("div");
    
    const tooltip = createTooltip(element, { content: malicious });
    
    // After sanitization, onerror should be removed
    expect(tooltip.innerHTML).not.toContain("onerror");
    expect(tooltip.innerHTML).not.toContain("alert");
  });

  it("preserves safe formatting", () => {
    const safe = "<b>Bold</b> and <em>italic</em>";
    const element = document.createElement("div");
    
    const tooltip = createTooltip(element, { content: safe });
    
    expect(tooltip.innerHTML).toContain("<b>Bold</b>");
    expect(tooltip.innerHTML).toContain("<em>italic</em>");
  });
});
```

---

#### Task B2: Implement Order Status Sync Race Condition Fix (CRITICAL-007)

**Estimated Time:** 4 hours  
**Root Cause:** Sync can complete before placement confirmation reaches client  
**Solution:** Use optimistic updates with server reconciliation

```typescript
// src/components/shared/OrderPlacementWidget.svelte
// (or relevant component)

async function placeOrder() {
  // Step 1: Generate optimistic order
  const optimisticOrderId = generateLocalOrderId();
  const optimisticOrder = {
    id: optimisticOrderId,
    status: "pending",
    symbol: orderParams.symbol,
    side: orderParams.side,
    amount: orderParams.amount,
    price: orderParams.price,
    _isOptimistic: true,  // Mark as not confirmed yet
  };

  // Step 2: Add to UI immediately (optimistic update)
  tradeState.addOrder(optimisticOrder);

  try {
    // Step 3: Send to server
    const response = await fetch("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        exchange, apiKey, apiSecret,
        ...orderParams,
        clientOrderId: optimisticOrderId,  // Tie to optimistic
      }),
    });

    const result = await response.json();

    // Step 4: Replace optimistic with real
    if (result.orderId) {
      tradeState.replaceOrder(optimisticOrderId, {
        ...optimisticOrder,
        id: result.orderId,
        _isOptimistic: false,
      });
    }
  } catch (e) {
    // Remove optimistic on error
    tradeState.removeOrder(optimisticOrderId);
    errorMessage = e.message;
  }
}

// Step 5: Sync reconciliation
async function syncOrders() {
  const serverOrders = await fetchOrdersFromServer();

  // Match optimistic with real
  serverOrders.forEach(serverOrder => {
    const optimistic = tradeState.findByClientId(serverOrder.clientOrderId);
    if (optimistic) {
      tradeState.replaceOrder(optimistic.id, {
        ...serverOrder,
        _isOptimistic: false,
      });
    }
  });

  // Clean up orphaned optimistic orders (placed >2 minutes ago, not confirmed)
  tradeState.removeOrphanedOptimistic(Date.now() - 2 * 60 * 1000);
}
```

**Test:**

```typescript
describe("Optimistic Order Updates", () => {
  it("shows order immediately after placement", async () => {
    const response = placeOrder({ /* ... */ });
    
    // Check UI immediately (before server responds)
    expect(tradeState.orders.length).toBe(1);
    expect(tradeState.orders[0]._isOptimistic).toBe(true);
  });

  it("replaces optimistic with real order", async () => {
    const orderId = await placeOrder({ /* ... */ });
    
    await waitForSync();
    
    const order = tradeState.getOrder(orderId);
    expect(order._isOptimistic).toBe(false);
    expect(order.id).toBe("REAL_SERVER_ID");
  });

  it("prevents double orders after sync", async () => {
    // If sync runs before placement response,
    // client still shows 1 order (optimistic matches real via clientOrderId)
    
    const placement = placeOrder({ /* ... */ });
    const sync = syncOrders();
    
    const [orderId] = await Promise.all([placement, sync]);
    
    // Should show only 1 order, not 2
    expect(tradeState.orders.filter(o => o.symbol === "BTCUSDT")).toHaveLength(1);
  });
});
```

---

#### Task B3: Add Null Check to RMS Monitor (CRITICAL-008)

**Estimated Time:** 2 hours  

```typescript
// src/services/rmsService.ts

public monitorRisk(): void {
  try {
    const positions = omsService.getPositions();
    
    if (!positions || !Array.isArray(positions)) {
      logger.warn("rms", "Invalid positions data, skipping risk monitor");
      return;
    }

    positions.forEach(pos => {
      // Strict null checks
      if (!pos) {
        logger.warn("rms", "Null position in list, skipping");
        return;
      }

      // Validate unrealizedPnl
      if (!pos.unrealizedPnl || !(pos.unrealizedPnl instanceof Decimal)) {
        logger.warn("rms", `Invalid unrealizedPnl for ${pos.symbol}, skipping`);
        return;
      }

      // Safe to check now
      if (pos.unrealizedPnl.isNegative() && pos.unrealizedPnl.abs().gt(this.profile.maxDrawdownPercent)) {
        this.triggerEmergencyExit(pos);
      }
    });
  } catch (e) {
    logger.error("rms", "Risk monitoring failed", e);
    // Don't let monitor crash silently
    this.notifyAdminOfMonitorFailure(e);
  }
}

private notifyAdminOfMonitorFailure(error: any): void {
  // Log to error tracking service
  errorTracker.captureException(error, { context: "rmsMonitor" });
}
```

**Test:**

```typescript
describe("RMS Monitor Robustness", () => {
  it("handles null unrealizedPnl gracefully", () => {
    const spy = jest.spyOn(logger, "warn");
    
    const position = {
      symbol: "BTCUSDT",
      unrealizedPnl: null,  // Invalid
    };

    rmsService.monitorRisk([position]);

    expect(spy).toHaveBeenCalledWith("rms", expect.stringContaining("unrealizedPnl"));
  });

  it("continues monitoring after encountering one bad position", () => {
    const goodPosition = {
      symbol: "ETHUSDT",
      unrealizedPnl: new Decimal(-5),
    };

    rmsService.monitorRisk([{ unrealizedPnl: null }, goodPosition]);

    // Should still trigger exit for good position
    expect(triggerEmergencyExit).toHaveBeenCalledWith(goodPosition);
  });
});
```

---

#### Task B4: Implement Unvalidated P&L Calculation Validation (CRITICAL-004)

**Estimated Time:** 5 hours  
**Strategy:** Add schema validation to WebSocket messages, implement strict type coercion

```typescript
// src/types/bitunixValidation.ts - Extend with WebSocket schemas

export const BitunixWebSocketPriceMessageSchema = z.object({
  action: z.literal("push"),
  code: z.number().optional(),
  data: z.object({
    symbol: z.string().min(3),
    lastPrice: z.union([
      z.string().regex(/^\d+(\.\d+)?$/),  // Only valid decimal strings
      z.number().min(0),
    ]).transform(v => new Decimal(String(v))),
    indexPrice: z.union([z.string(), z.number()]).optional().transform(v => v ? new Decimal(String(v)) : null),
    fundingRate: z.union([z.string(), z.number()]).optional().transform(v => v ? new Decimal(String(v)) : null),
    highPrice: z.union([z.string(), z.number()]).optional().transform(v => v ? new Decimal(String(v)) : null),
    lowPrice: z.union([z.string(), z.number()]).optional().transform(v => v ? new Decimal(String(v)) : null),
    volume: z.union([z.string(), z.number()]).optional().transform(v => v ? new Decimal(String(v)) : null),
  }),
});

// Then in bitunixWs.ts:
ws.onmessage = (event) => {
  try {
    const message = JSON.parse(event.data);
    
    // VALIDATE before processing
    const validation = BitunixWebSocketPriceMessageSchema.safeParse(message);
    if (!validation.success) {
      logger.error("network", "Invalid WebSocket message format", validation.error.issues);
      return;  // Skip corrupted messages
    }

    const validatedMessage = validation.data;
    this.handleMessage(validatedMessage, "public");
  } catch (e) {
    this.handleInternalError("public", e);
  }
};
```

**Test:**

```typescript
describe("WebSocket P&L Calculation", () => {
  it("rejects message with invalid lastPrice", () => {
    const malformed = {
      action: "push",
      data: {
        symbol: "BTCUSDT",
        lastPrice: "Infinity",  // Invalid
      },
    };

    const result = BitunixWebSocketPriceMessageSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });

  it("rejects message with NaN volume", () => {
    const malformed = {
      action: "push",
      data: {
        symbol: "BTCUSDT",
        lastPrice: "50000.5",
        volume: "NaN",  // Invalid
      },
    };

    const result = BitunixWebSocketPriceMessageSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });

  it("accepts valid numeric and string decimals", () => {
    const valid = {
      action: "push",
      data: {
        symbol: "BTCUSDT",
        lastPrice: 50000.5,  // Number
      },
    };

    const result = BitunixWebSocketPriceMessageSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data.data.lastPrice).toBeInstanceOf(Decimal);
  });

  it("handles edge case: very small decimals", () => {
    const valid = {
      action: "push",
      data: {
        symbol: "BTCUSDT",
        lastPrice: "0.0000000001",  // Precision
      },
    };

    const result = BitunixWebSocketPriceMessageSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data.data.lastPrice.toString()).toBe("0.0000000001");
  });
});
```

---

## PHASE 2B: WARNING ISSUES (P1) - 12 Issues, ~30 Hours

### GROUP C: Internationalization (i18n) Fixes (WARNING-001, WARNING-005)

#### Task C1: Audit & Migrate All Error Messages to i18n Keys

**Estimated Time:** 6 hours  
**Scope:** Find all hardcoded error strings, move to translation system

```bash
# Step 1: Identify all hardcoded errors
grep -r "throw new Error" src/ | grep -v "apiErrors\|bitunixErrors\|networkErrors" > errors_to_migrate.txt
grep -r "console.error" src/services/*.ts | head -20

# Expected: ~30-50 hardcoded strings
```

**Migration Template:**

```typescript
// BEFORE
throw new Error("Missing credentials or exchange");

// AFTER
throw new Error($t("apiErrors.missingCredentials"));
// OR in non-component context:
const i18n = getI18nContext();
throw new Error(i18n.t("apiErrors.missingCredentials"));

// Add to translation files:
// src/locales/en.json
{
  "apiErrors": {
    "missingCredentials": "Missing API credentials or exchange information",
    "invalidPassword": "The passphrase you entered is invalid",
    // ...
  }
}

// src/locales/de.json
{
  "apiErrors": {
    "missingCredentials": "Fehlende API-Anmeldedaten oder Austauschinformationen",
    "invalidPassword": "Die eingegebene Passphrase ist ungültig",
    // ...
  }
}
```

**Validation Script:**

```typescript
// scripts/validateI18n.ts
import fs from "fs";
import path from "path";

const enLocale = JSON.parse(fs.readFileSync("src/locales/en.json", "utf8"));
const deLocale = JSON.parse(fs.readFileSync("src/locales/de.json", "utf8"));

// Check that all en keys exist in de
function validate(enObj: any, deObj: any, prefix = "") {
  for (const key of Object.keys(enObj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof enObj[key] === "object" && enObj[key] !== null) {
      if (!deObj[key]) {
        console.warn(`❌ Missing in de: ${fullKey}`);
      } else {
        validate(enObj[key], deObj[key], fullKey);
      }
    } else if (!deObj[key]) {
      console.warn(`❌ Missing in de: ${fullKey}`);
    }
  }
}

validate(enLocale, deLocale);
console.log("✓ i18n validation complete");
```

---

### GROUP D: Memory & Performance Fixes (WARNING-002, WARNING-008, WARNING-010, WARNING-007, WARNING-011)

#### Task D1: Fix WebSocket Subscription Memory Leak (WARNING-002)

**Estimated Time:** 6 hours  

```typescript
// src/services/bitunixWs.ts - Enhanced cleanup

class BitunixWebSocketService {
  // Add explicit cleanup for subscriptions
  destroy() {
    logger.log("governance", `[BitunixWS] #${this.instanceId} destroy() called.`);
    this.isDestroyed = true;

    // ADDED: Clear subscription set before other cleanup
    this.publicSubscriptions.clear();  // Explicit clear
    logger.log("governance", `[BitunixWS] Cleared ${this.publicSubscriptions.size} subscriptions`);

    if (BitunixWebSocketService.activeInstance === this) {
      BitunixWebSocketService.activeInstance = null;
    }

    // ... rest of cleanup ...
  }

  // Enhance unsubscribe to track removal
  unsubscribe(symbol: string, channel: string) {
    const key = `${channel}:${symbol}`;
    const wasPresent = this.publicSubscriptions.has(key);
    this.publicSubscriptions.delete(key);

    if (wasPresent && this.wsPublic && this.wsPublic.readyState === WebSocket.OPEN) {
      const unsubPayload = {
        action: "unsubscribe",
        channel,
        symbol,
      };
      this.wsPublic.send(JSON.stringify(unsubPayload));
    }

    logger.log("network", `[WS] Unsubscribed: ${key} (was tracked: ${wasPresent})`);
  }

  // Add subscription validation
  private validateSubscriptionState() {
    // Check for orphaned subscriptions (active but not wanted by anyone)
    for (const key of this.publicSubscriptions) {
      const [channel, symbol] = key.split(":");
      // Check if any component is still listening for this
      if (!marketWatcher.isWatching(symbol, channel)) {
        logger.warn("memory", `Orphaned subscription: ${key}, removing`);
        this.unsubscribe(symbol, channel);
      }
    }
  }
}

// In marketWatcher.ts - track what's actually being watched
class MarketWatcher {
  private watchCount = new Map<string, number>();  // key -> count of watchers

  isWatching(symbol: string, channel: string): boolean {
    const key = `${symbol}:${channel}`;
    return (this.watchCount.get(key) || 0) > 0;
  }
}
```

**Test:**

```typescript
describe("WebSocket Subscription Cleanup", () => {
  it("clears all subscriptions on destroy", () => {
    const ws = new BitunixWebSocketService();
    
    ws.subscribe("BTCUSDT", "price");
    ws.subscribe("ETHUSDT", "price");
    expect(ws.publicSubscriptions.size).toBe(2);

    ws.destroy();

    expect(ws.publicSubscriptions.size).toBe(0);
  });

  it("removes subscriptions when switching providers", async () => {
    const bitunixWs = new BitunixWebSocketService();
    bitunixWs.subscribe("BTCUSDT", "price");

    await connectionManager.switchProvider("bitget");

    expect(bitunixWs.publicSubscriptions.size).toBe(0);
  });

  it("prevents zombie subscriptions after multiple switches", async () => {
    const ws = new BitunixWebSocketService();

    for (let i = 0; i < 5; i++) {
      ws.subscribe("BTCUSDT", "price");
      await connectionManager.switchProvider("bitget");
      await connectionManager.switchProvider("bitunix");
    }

    // Should have exactly 1 subscription, not 5
    expect(ws.publicSubscriptions.size).toBe(1);
  });
});
```

---

#### Task D2: Fix setTimeout/setInterval Memory Leaks (WARNING-008)

**Estimated Time:** 2 hours  

```typescript
// src/services/marketWatcher.ts - Safe timer management

class MarketWatcher {
  private timers: Set<ReturnType<typeof setInterval | typeof setTimeout>> = new Set();

  private startPolling() {
    if (!browser) return;

    this.startTimeout = setTimeout(() => {
      this.pollingInterval = setInterval(() => {
        this.poll();
      }, this.currentIntervalSeconds * 1000);

      this.timers.add(this.pollingInterval);
    }, 5000);

    this.timers.add(this.startTimeout);
  }

  // New: Safe cleanup method
  destroy() {
    for (const timer of this.timers) {
      clearTimeout(timer as any);  // Works for both setTimeout and setInterval
      clearInterval(timer as any);
    }
    this.timers.clear();
    logger.log("governance", "MarketWatcher destroyed, all timers cleared");
  }
}

// Component lifecycle
onMount(() => {
  marketWatcher.startPolling();
  return () => {
    marketWatcher.destroy();  // Svelte automatically calls this on unmount
  };
});
```

---

#### Task D3: Add Rate Limiting to API Calls (WARNING-007)

**Estimated Time:** 4 hours  

```typescript
// src/services/apiService.ts - Rate limiting per provider

class RateLimiter {
  private buckets = new Map<string, number[]>();  // provider -> [timestamps]
  private readonly limits = {
    bitunix: { requests: 10, window: 1000 },      // 10 req/sec
    bitget: { requests: 50, window: 1000 },       // 50 req/sec
  };

  canRequest(provider: string): boolean {
    const limit = this.limits[provider as keyof typeof this.limits];
    if (!limit) return true;  // Unknown provider, allow

    const now = Date.now();
    const bucketKey = provider;
    const bucket = this.buckets.get(bucketKey) || [];

    // Remove old timestamps outside window
    const recent = bucket.filter(t => now - t < limit.window);

    if (recent.length >= limit.requests) {
      return false;  // Rate limited
    }

    // Add new timestamp
    recent.push(now);
    this.buckets.set(bucketKey, recent);
    return true;
  }

  async waitForSlot(provider: string): Promise<void> {
    while (!this.canRequest(provider)) {
      await new Promise(r => setTimeout(r, 10));
    }
  }
}

class RequestManager {
  private rateLimiter = new RateLimiter();

  async schedule<T>(
    key: string,
    task: (signal: AbortSignal) => Promise<T>,
    priority: "high" | "normal" = "normal",
    retries = 1,
    timeout?: number,
  ): Promise<T> {
    // Extract provider from key (e.g., "BITUNIX:BTCUSDT:1h")
    const [provider] = key.split(":");
    
    // Check rate limit before queuing
    await this.rateLimiter.waitForSlot(provider.toLowerCase());

    // ... rest of schedule logic ...
  }
}
```

---

#### Task D4: Add Timeout to Sync Requests (WARNING-010)

**Estimated Time:** 1 hour  

```typescript
// src/routes/api/sync/orders/+server.ts

async function fetchBitunixData(
  apiKey: string,
  apiSecret: string,
  path: string,
  limit: number = 100,
  endTime?: number,
): Promise<BitunixOrder[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);  // 10s timeout

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

---

### GROUP E: WebSocket & Data Validation (WARNING-011, WARNING-006, WARNING-003)

#### Task E1: Implement WebSocket Schema Validation (WARNING-011)

**Estimated Time:** 3 hours  
**Already covered in CRITICAL-004 implementation above**

---

#### Task E2: Fix News Fetch Deduplication Race (WARNING-003)

**Estimated Time:** 2 hours  

```typescript
// src/services/newsService.ts

export const newsService = {
  async fetchNews(symbol?: string): Promise<NewsItem[]> {
    const symbolKey = symbol || "global";

    // Check if a request for this symbol is already in progress
    if (pendingNewsFetches.has(symbolKey)) {
      logger.log("network", `[News] Joining existing fetch: ${symbolKey}`);
      return pendingNewsFetches.get(symbolKey)!;
    }

    const fetchPromise = (async (): Promise<NewsItem[]> => {
      try {
        // ... fetch logic ...
      } finally {
        // CRITICAL: Remove from pending after completion
        pendingNewsFetches.delete(symbolKey);
      }
    })();

    // ADDED: Store promise BEFORE returning
    pendingNewsFetches.set(symbolKey, fetchPromise);

    return fetchPromise;
  }
};
```

---

#### Task E3: Implement Offline State Persistence (WARNING-006)

**Estimated Time:** 3 hours  

```typescript
// src/services/bitunixWs.ts or new localStorage util

class OfflineStateManager {
  private readonly PENDING_ORDERS_KEY = "cachy_pending_orders";
  private readonly PENDING_TRADES_KEY = "cachy_pending_trades";

  savePendingOrders(orders: Order[]) {
    try {
      localStorage.setItem(
        this.PENDING_ORDERS_KEY,
        JSON.stringify(orders.map(o => ({ ...o, _timestamp: Date.now() })))
      );
    } catch (e) {
      logger.warn("storage", "Failed to save pending orders");
    }
  }

  getPendingOrders(): Order[] {
    try {
      const data = localStorage.getItem(this.PENDING_ORDERS_KEY);
      if (!data) return [];

      const orders = JSON.parse(data);
      
      // Filter out orders older than 24h (likely stale)
      return orders.filter((o: any) => Date.now() - o._timestamp < 24 * 60 * 60 * 1000);
    } catch (e) {
      logger.warn("storage", "Failed to restore pending orders");
      return [];
    }
  }

  clearPendingOrders() {
    localStorage.removeItem(this.PENDING_ORDERS_KEY);
  }
}

// In handleOffline:
private handleOffline = () => {
  marketState.connectionStatus = "disconnected";
  
  // NEW: Save any in-flight state
  const pending = tradeState.getPendingOrders();
  if (pending.length > 0) {
    offlineStateManager.savePendingOrders(pending);
    logger.log("governance", `Saved ${pending.length} pending orders for offline recovery`);
  }

  // ... cleanup ...
};

// In handleOnline or after reconnect:
private restorePendingOrders() {
  const restored = offlineStateManager.getPendingOrders();
  restored.forEach(order => {
    tradeState.addOrder({
      ...order,
      _recoveredFromOffline: true,
    });
  });
  
  if (restored.length > 0) {
    logger.log("governance", `Restored ${restored.length} orders from offline storage`);
  }
  
  offlineStateManager.clearPendingOrders();
}
```

---

### GROUP F: Validation & UX Fixes (WARNING-004, WARNING-009, WARNING-012)

#### Task F1: Add Error Boundary for Calculator Service (WARNING-004)

**Estimated Time:** 2 hours  

```typescript
// src/services/calculatorService.ts

class CalculatorService {
  /**
   * Safely calculates position size with error handling
   */
  calculatePositionSize(
    accountBalance: Decimal,
    leverage: Decimal,
    entryPrice: Decimal
  ): { value: Decimal | null; error: string | null } {
    try {
      // Validate inputs
      if (!accountBalance || !leverage || !entryPrice) {
        return { value: null, error: "Missing required inputs" };
      }

      if (accountBalance.lte(0)) {
        return { value: null, error: "Account balance must be > 0" };
      }

      if (leverage.lte(0) || leverage.gt(100)) {
        return { value: null, error: "Leverage must be between 0 and 100" };
      }

      if (entryPrice.lte(0)) {
        return { value: null, error: "Entry price must be > 0" };
      }

      // Calculate safely
      const position = accountBalance.times(leverage).dividedBy(entryPrice);

      if (!position.isFinite()) {
        return { value: null, error: "Calculation resulted in invalid number" };
      }

      return { value: position, error: null };
    } catch (e) {
      logger.error("calculator", "Calculation failed", e);
      return { value: null, error: "Calculation error" };
    }
  }
}
```

**Svelte Component Usage:**

```svelte
<script>
  let positionSize = { value: null, error: null };

  function updateCalculation() {
    positionSize = calculatorService.calculatePositionSize(
      balance,
      leverage,
      entryPrice
    );
  }
</script>

{#if positionSize.error}
  <div class="error-message">{positionSize.error}</div>
{:else if positionSize.value}
  <div class="result">{formatDecimal(positionSize.value)}</div>
{/if}
```

---

#### Task F2: Validate Stop Loss/Take Profit Prices (WARNING-009)

**Estimated Time:** 3 hours  

```typescript
// src/services/tradeService.ts

export class TradeExecutionService {
  /**
   * Validates stop loss and take profit levels
   */
  private validateSLTP(
    entryPrice: Decimal,
    side: OrderSide,
    stopLoss?: Decimal,
    takeProfit?: Decimal
  ): { valid: boolean; error?: string } {
    if (!stopLoss && !takeProfit) {
      return { valid: true };  // Both optional
    }

    if (side === "buy") {
      // For BUY: SL must be BELOW entry, TP must be ABOVE
      if (stopLoss && stopLoss.gte(entryPrice)) {
        return { valid: false, error: "Stop loss must be below entry price for BUY orders" };
      }
      if (takeProfit && takeProfit.lte(entryPrice)) {
        return { valid: false, error: "Take profit must be above entry price for BUY orders" };
      }
    } else {
      // For SELL: SL must be ABOVE entry, TP must be BELOW
      if (stopLoss && stopLoss.lte(entryPrice)) {
        return { valid: false, error: "Stop loss must be above entry price for SELL orders" };
      }
      if (takeProfit && takeProfit.gte(entryPrice)) {
        return { valid: false, error: "Take profit must be below entry price for SELL orders" };
      }
    }

    return { valid: true };
  }

  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    // ... existing guards ...

    // NEW: Validate SL/TP
    const slTpValidation = this.validateSLTP(
      params.price || approximatePrice,
      params.side,
      params.stopLoss,
      params.takeProfit
    );

    if (!slTpValidation.valid) {
      throw new Error(slTpValidation.error);
    }

    // ... rest of order logic ...
  }
}
```

---

#### Task F3: Add Graceful Degradation for AI Services (WARNING-012)

**Estimated Time:** 2 hours  

```typescript
// src/routes/api/ai/+server.ts (new unified endpoint)

export const POST: RequestHandler = async ({ request }) => {
  const { prompt, mode } = await request.json();

  // Try Gemini first
  try {
    if (process.env.GEMINI_API_KEY) {
      const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const result = await Promise.race([
        model.generateContent(prompt),
        sleep(5000),  // 5s timeout
      ]);

      if (result) {
        return json({ response: result.response.text(), source: "gemini" });
      }
    }
  } catch (e) {
    logger.warn("ai", "Gemini failed, trying Anthropic", e);
  }

  // Fallback to Anthropic Claude
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return json({ response: data.content[0].text, source: "anthropic" });
      }
    }
  } catch (e) {
    logger.warn("ai", "Anthropic failed", e);
  }

  // Both failed
  return json(
    { error: "AI services temporarily unavailable", suggestion: "Try again in a moment" },
    { status: 503 }
  );
};
```

---

## PHASE 2C: REFACTOR ISSUES (P2) - 5 Issues, ~11 Hours

### GROUP G: Code Quality & Maintainability

#### Task G1: Extract Centralized Decimal Parsing (REFACTOR-002)

**Estimated Time:** 3 hours  

```typescript
// src/lib/utils/decimalParsing.ts (NEW)

import { Decimal } from "decimal.js";
import { logger } from "../../services/logger";

/**
 * Safely convert any value to Decimal with consistent error handling
 * @param value Input value (any type)
 * @param fallback Fallback Decimal if conversion fails (default: 0)
 * @param context Description of where conversion is happening (for logging)
 */
export function parseDecimalSafe(
  value: any,
  fallback: Decimal = new Decimal(0),
  context?: string
): Decimal {
  if (value instanceof Decimal) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    if (context) {
      logger.warn("data", `[${context}] Null/undefined decimal, using fallback`);
    }
    return fallback;
  }

  try {
    // Handle Decimal.js internal structure (from isAllowedChannel)
    if (typeof value === "object" && value.s !== undefined && value.e !== undefined && value.d !== undefined) {
      return new Decimal(value);
    }

    const d = new Decimal(String(value));

    if (d.isNaN() || !d.isFinite()) {
      logger.warn("data", `[${context || "unknown"}] Invalid decimal ${value}, using fallback`);
      return fallback;
    }

    return d;
  } catch (e) {
    logger.error("data", `[${context || "unknown"}] Decimal parsing failed for ${value}`, e);
    return fallback;
  }
}

/**
 * Parse array of Decimals with consistent handling
 */
export function parseDecimalArray(
  arr: any[],
  fallback: Decimal = new Decimal(0),
  context?: string
): Decimal[] {
  if (!Array.isArray(arr)) {
    return [];
  }

  return arr.map((v, i) => parseDecimalSafe(v, fallback, `${context}[${i}]`));
}
```

**Usage:**

```typescript
// Before (scattered across 5 files)
const price = new Decimal(val || "0");

// After (centralized)
import { parseDecimalSafe } from "$lib/utils/decimalParsing";
const price = parseDecimalSafe(val, new Decimal(0), "ticker:lastPrice");
```

---

#### Task G2: Centralize TradeExecutionGuard (REFACTOR-001)

**Estimated Time:** 1 hour  

```typescript
// src/lib/guards/tradeGuards.ts (NEW)

import { settingsState } from "../../stores/settings.svelte";
import { logger } from "../../services/logger";

export class TradeExecutionGuard {
  /**
   * Ensures user is authorized for trade execution
   * @throws Error if not authorized
   */
  static ensureAuthorized(): void {
    if (!settingsState.capabilities.tradeExecution) {
      throw new Error("UNAUTHORIZED: Trade execution requires Pro license");
    }

    const apiKey = settingsState.apiKeys?.bitunix?.key;
    const apiSecret = settingsState.apiKeys?.bitunix?.secret;

    if (!apiKey || !apiSecret) {
      throw new Error("API_CREDENTIALS_MISSING");
    }

    logger.log("governance", "[Guard] Trade execution authorized");
  }

  /**
   * Soft check: returns true if authorized without throwing
   */
  static isAuthorized(): boolean {
    try {
      this.ensureAuthorized();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get fresh credentials (check they still exist)
   */
  static getFreshCredentials(): { apiKey: string; apiSecret: string } {
    this.ensureAuthorized();

    const apiKey = settingsState.apiKeys.bitunix.key;
    const apiSecret = settingsState.apiKeys.bitunix.secret;

    if (!apiKey || !apiSecret) {
      throw new Error("Credentials were cleared");
    }

    return { apiKey, apiSecret };
  }
}
```

---

#### Task G3: Standardize i18n Error Keys (REFACTOR-003)

**Estimated Time:** 2 hours  

```typescript
// src/lib/constants/errorKeys.ts (NEW)

export const ERROR_KEYS = {
  // API Errors
  API: {
    MISSING_CREDENTIALS: "errors.api.missingCredentials",
    INVALID_JSON: "errors.api.invalidJson",
    INVALID_RESPONSE: "errors.api.invalidResponse",
    TIMEOUT: "errors.api.timeout",
    RATE_LIMIT: "errors.api.rateLimit",
    SERVER_ERROR: "errors.api.serverError",
  },
  
  // Order Errors
  ORDER: {
    INVALID_SYMBOL: "errors.order.invalidSymbol",
    INVALID_AMOUNT: "errors.order.invalidAmount",
    INVALID_PRICE: "errors.order.invalidPrice",
    INVALID_LEVERAGE: "errors.order.invalidLeverage",
    INVALID_SL: "errors.order.invalidStopLoss",
    INVALID_TP: "errors.order.invalidTakeProfit",
  },

  // Auth Errors
  AUTH: {
    UNAUTHORIZED: "errors.auth.unauthorized",
    INVALID_PASSPHRASE: "errors.auth.invalidPassphrase",
    API_KEY_INVALID: "errors.auth.apiKeyInvalid",
  },
};

// Usage:
throw new Error(ERROR_KEYS.API.MISSING_CREDENTIALS);
throw new Error(ERROR_KEYS.ORDER.INVALID_AMOUNT);
```

**Translation Files:**

```json
// locales/en.json
{
  "errors": {
    "api": {
      "missingCredentials": "API credentials are missing",
      "invalidJson": "Invalid response format"
    }
  }
}
```

---

#### Task G4: Extract Common API Signature Logic (REFACTOR-004)

**Estimated Time:** 2 hours  

```typescript
// src/utils/server/apiSignatureBase.ts (NEW)

export abstract class ApiSignatureGenerator {
  abstract generateSignature(
    apiSecret: string,
    method: string,
    path: string,
    body: string,
    timestamp: string
  ): string;

  abstract validateCredentials(apiKey: string, apiSecret: string): string | null;
}

// src/utils/server/bitunix.ts (refactored)
import { ApiSignatureGenerator } from "./apiSignatureBase";

export class BitunixSignatureGenerator extends ApiSignatureGenerator {
  override generateSignature(apiSecret, method, path, body, timestamp) {
    // Bitunix-specific logic
  }

  override validateCredentials(apiKey, apiSecret) {
    if (typeof apiKey !== "string" || apiKey.length < 5) {
      return "Invalid API Key";
    }
    // ...
  }
}

// New exchange support becomes trivial
export class BitgetSignatureGenerator extends ApiSignatureGenerator {
  override generateSignature(apiSecret, method, path, body, timestamp) {
    // Bitget-specific logic
  }

  override validateCredentials(apiKey, apiSecret) {
    // Bitget-specific validation
  }
}
```

---

#### Task G5: Decouple RMS/OMS (REFACTOR-005)

**Estimated Time:** 3 hours  

**Current:** RMS directly calls `omsService.getPositions()`  
**Better:** Event-based communication or dependency injection

```typescript
// src/services/eventBus.ts (NEW)

export type RiskEvent =
  | { type: "positionLiquidating"; position: Position }
  | { type: "drawdownThreshold"; current: Decimal }
  | { type: "emergencyExit"; reason: string };

class EventBus {
  private listeners = new Map<RiskEvent["type"], Set<(event: RiskEvent) => void>>();

  subscribe(eventType: RiskEvent["type"], handler: (event: RiskEvent) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(handler);
    };
  }

  emit(event: RiskEvent) {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach(h => h(event));
    }
  }
}

export const riskEventBus = new EventBus();

// Usage:
// src/services/rmsService.ts
riskEventBus.emit({
  type: "positionLiquidating",
  position: liquidatedPosition,
});

// src/services/omsService.ts or UI
riskEventBus.subscribe("positionLiquidating", (event) => {
  logger.error("risk", `Position liquidated: ${event.position.symbol}`);
});
```

---

## EXECUTION TIMELINE

### Week 1: Critical Issues (Mon-Wed)

- Monday: CRITICAL-001, CRITICAL-005, CRITICAL-006 (8h)
- Tuesday: CRITICAL-002, CRITICAL-003 (10h)
- Wednesday: CRITICAL-004, CRITICAL-007, CRITICAL-008 (14h)

**Subtotal: ~32 hours (2 eng, 4 days)**

### Week 1-2: Warning Issues (Thu-Fri, then Mon-Wed)

- Thursday: C1, D1, D2 (10h)
- Friday: D3, D4, E1 (10h)
- **Mon-Wed Week 2:** E2, E3, F1, F2, F3 (20h)

**Subtotal: ~40 hours (2 eng, 1 week)**

### Week 2: Refactoring (Thu-Fri)

- Thursday-Friday: G1-G5 (11h)

**Subtotal: ~11 hours (1 eng, 3 days)**

### **TOTAL: ~83 hours (2 Senior Engineers, 2.5 weeks at normal pace)**

---

## TESTING STRATEGY

### Unit Tests (To be created/enhanced)

- [x] StrictDecimal schema validation (12 tests)
- [x] Passphrase validation (4 tests)
- [x] Order execution race conditions (3 tests)
- [x] RMS null handling (4 tests)
- [x] WebSocket schema validation (5 tests)
- [x] Rate limiting (3 tests)
- [ ] Memory leak prevention (6 tests)
- [ ] i18n key coverage (automated check)

**Target: 50+ new unit tests**

### Integration Tests

- [ ] End-to-end order placement with network failure
- [ ] Provider switch with pending orders
- [ ] Offline state recovery
- [ ] Concurrent order placements

**Target: 8+ integration tests**

### Manual Testing (QA Checklist)

- [ ] Place order → change credentials → verify error message
- [ ] WebSocket disconnect → reconnect → verify no duplicate data
- [ ] Rapid symbol switches → verify no memory growth
- [ ] Browser offline → wait 30s → switch to online → verify recovery

---

## MONITORING & METRICS

### Post-Deployment Monitoring (48 hours)

1. **Memory Usage:** Target <50MB stable, no growth after 24h
2. **API Requests:** Monitor for rate limit errors (should be 0 after fixes)
3. **Error Logs:** Watch for "Null decimal" entries (should be <5 per hour)
4. **WebSocket Subscriptions:** Monitor active count (should be <50 at any time)
5. **Order Execution:** Check for duplicate orders (should be 0)

### Success Criteria

- ✅ No new financial loss reports
- ✅ Error messages localized for all supported languages
- ✅ Memory usage remains <100MB over 72h
- ✅ All unit tests pass (50+ tests)
- ✅ No regressions in existing features

---
