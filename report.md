# Code Analysis & Risk Report

## Step 1: In-depth analysis & report

### 🔴 CRITICAL
1. **Precision Loss in Active Technicals Manager**: `src/services/activeTechnicalsManager.svelte.ts` uses `price.toNumber()` on Decimal objects (lines 654, 666). This causes precision loss in calculations, violating the strict Decimal.js usage requirement.
2. **Unsafe JSON Parsing**: Various files across the codebase, including `src/components/shared/BackgroundRenderer.svelte`, use native `JSON.parse` which is susceptible to precision loss for 64-bit integers and large floats, instead of the custom `safeJsonParse` utility.
3. **Optimistic UI State Rollback**: `tradeService` unconditionally rolls back optimistic state on indeterminate network timeouts instead of retaining it as `_isUnconfirmed = true`.
4. **WebSocket Memory Leaks**: `bitunixWs.ts` and potentially other websocket services may not correctly clear `syntheticSubs` or `pendingSubscriptions` sets within their `destroy()` method, leading to unbounded memory growth.

### 🟡 WARNING
1. **Unsafe Error Handling**: Catch blocks in multiple services (e.g. `src/services/dataRepairService.ts`, `src/services/syncService.ts`, `src/services/newsService.ts`, `src/routes/api/*`) use `catch (e: any)` rather than `catch (e: unknown)` and proper type-narrowing to string representations.
2. **Missing I18n Keys & Raw Error Exposure**: Several error endpoints expose raw HTML strings or `statusText` instead of mapping them to safe localization keys (e.g., `apiErrors.invalidResponse`).
3. **Unbounded Caches**: Caching Maps/Sets lack proper bounded eviction strategies, iterating incorrectly with `.keys().next().value` instead of `.entries()`.

### 🔵 REFACTOR
1. **Type Safety in API Payloads**: API responses in `tradeService` and `newsService` lack thorough Zod schema `.passthrough()` validation, occasionally relying on implicit assumptions or unsafe casts.

---

## Step 2: Action Plan

**1. Precision Loss & Decimal Hardening**
- *Goal*: Eliminate `.toNumber()` usage in `activeTechnicalsManager.svelte.ts` to ensure strict decimal preservation.
- *Test*:
  ```typescript
  it('preserves decimal precision in technicals calculations', () => {
      const precisionPrice = new Decimal('0.123456789012345678');
      manager.updatePrice(precisionPrice);
      // Assert value was not corrupted via toNumber() intermediate step
      expect(manager.getCurrentPrice().toString()).toBe('0.123456789012345678');
  });
  ```
- *Justification*: Measurably improves stability by ensuring accurate financial calculations, preventing potential financial impact.

**2. WebSocket Teardown & Memory Management**
- *Goal*: Secure `destroy()` methods in `bitunixWs.ts` to ensure all internal `Map` and `Set` collections (`syntheticSubs`, `pendingSubscriptions`) are fully cleared.
- *Test*:
  ```typescript
  it('prevents memory leaks by clearing sets on destroy', () => {
      // simulate 10,000 rapid subscribe/unsubscribe cycles
      for (let i = 0; i < 10000; i++) {
          bitunixWs.subscribe(`topic_${i}`);
      }
      bitunixWs.destroy();
      expect((bitunixWs as any).syntheticSubs.size).toBe(0);
      expect((bitunixWs as any).pendingSubscriptions.size).toBe(0);
  });
  ```
- *Justification*: Measurably improves performance and stability by preventing memory leaks during service re-initialization, which is critical for a high-frequency trading platform.

**3. Resilient Error Handling & Safe JSON**
- *Goal*: Replace native `JSON.parse` with `safeJsonParse` throughout the codebase, and harden `catch (e: any)` instances to `catch (e: unknown)`.
- *Test*:
  ```typescript
  it('preserves large integers over 64-bit precision limits', () => {
      const jsonPayload = '{"id": 9007199254740993}';
      const parsed = safeJsonParse(jsonPayload);
      expect(parsed.id).toBe('9007199254740993'); // Not precision-loss corrupted
  });
  ```
- *Justification*: Measurably improves stability by preventing unexpected application crashes during parsing exceptions or unhandled promise rejections, ensuring type safety.

**4. Optimistic UI Hardening**
- *Goal*: Implement unconfirmed order states (`_isUnconfirmed = true`) for network timeouts in `tradeService`.
- *Test*:
  ```typescript
  it('marks orders as unconfirmed on network timeout instead of rollback', async () => {
      const abortError = new DOMException('Timeout', 'AbortError');
      vi.spyOn(apiService, 'post').mockRejectedValue(abortError);

      await tradeService.createOrder({ price: '1000' });
      // Verify order is not deleted but marked unconfirmed
      const order = tradeState.orders.find(o => o.price === '1000');
      expect(order).toBeDefined();
      expect(order._isUnconfirmed).toBe(true);
  });
  ```
- *Justification*: Measurably improves consistency and prevents potential double ordering on the exchange due to unconfirmed but executed orders.
