# Testing Guide: CPU Usage and Technical Indicators Fix

## Overview
This guide provides step-by-step instructions for testing the CPU usage and technical indicators update fixes.

## Pre-Test Checklist

1. ✅ Clear browser cache and localStorage
2. ✅ Close all other tabs/applications (for accurate CPU measurement)
3. ✅ Enable browser DevTools console (to see debug logs)
4. ✅ Have a system monitor ready (Activity Monitor/Task Manager)

## Test Scenarios

### Scenario 1: Verify Reduced CPU Usage

**Setup:**
1. Open the app with "Light Settings" mode
2. Set favorite symbols to 4-5 coins (e.g., BTCUSDT, ETHUSDT, SOLUSDT, LINKUSDT)
3. Enable Technical indicators panel

**Test Steps:**
1. Let the app sit idle for 2 minutes
2. Monitor CPU usage in system monitor
3. Check console for calculation logs

**Expected Results:**
- ✅ CPU usage: 20-30% (not 50%)
- ✅ Console shows single calculation per request (not duplicate)
- ✅ Cache HIT logs appear frequently
- ✅ No continuous high CPU activity

**Pass Criteria:**
- CPU usage remains below 35% during idle
- Calculations complete within 1 second
- No duplicate "Cache MISS" logs for same data

---

### Scenario 2: Verify Real-Time Technical Updates

**Setup:**
1. Open Technicals panel
2. Select an active symbol (e.g., BTCUSDT)
3. Set timeframe to 1h

**Test Steps:**
1. Watch RSI, MACD, and EMA values
2. Wait for 30-60 seconds
3. Compare values with external source (TradingView)

**Expected Results:**
- ✅ Numbers update within 1-2 seconds
- ✅ No stale data (values match current market)
- ✅ Smooth updates without UI freezing

**Pass Criteria:**
- Indicators update at least once per minute
- Values are accurate compared to external source
- UI remains responsive during updates

---

### Scenario 3: Cache Performance

**Setup:**
1. Enable DevTools console (set to verbose)
2. Open Technicals panel
3. Switch between 2-3 symbols repeatedly

**Test Steps:**
1. Switch symbol A → B → A → B
2. Watch console logs
3. Note Cache HIT vs MISS ratio

**Expected Results:**
- ✅ First calculation: "Cache MISS, calculating..."
- ✅ Return to same symbol: "Cache HIT"
- ✅ Cleanup logs max every 30 seconds
- ✅ No excessive "Evicted LRU cache entry" logs

**Pass Criteria:**
- Cache hit rate >60% when revisiting symbols
- Cleanup runs ≤2 times per minute
- No cache thrashing warnings

---

### Scenario 4: Multiple Timeframes

**Setup:**
1. Add 4-5 favorite timeframes (5m, 15m, 1h, 4h)
2. Enable all Technical indicator categories
3. Open Technicals panel

**Test Steps:**
1. Switch between different timeframes
2. Monitor CPU usage
3. Check calculation times

**Expected Results:**
- ✅ Each timeframe calculates independently
- ✅ CPU spikes briefly (<2s) then returns to baseline
- ✅ Cache handles multiple timeframe contexts
- ✅ No "cache full" errors

**Pass Criteria:**
- Cache size handles 15 different contexts
- No recalculation for unchanged data
- Smooth switching without lag

---

### Scenario 5: Settings Changes

**Setup:**
1. Open Settings → Indicators
2. Locate cache settings (if exposed in UI)

**Test Steps:**
1. Change cache size from 15 to 20
2. Change cache TTL from 60 to 120 seconds
3. Check console for update confirmation

**Expected Results:**
- ✅ Console shows: `[Technicals] Cache config updated: size=20, TTL=120000ms`
- ✅ New settings take effect immediately
- ✅ No app restart required

**Pass Criteria:**
- Settings persist after page reload
- Cache respects new size/TTL immediately
- No errors in console

---

### Scenario 6: Worker Fallback

**Setup:**
1. Open DevTools → Application → Service Workers
2. (If available) Disable Web Workers temporarily
3. Or: Test on older browser without worker support

**Test Steps:**
1. Open Technicals panel
2. Watch console for "Worker failed, falling back to inline"
3. Verify calculations still work

**Expected Results:**
- ✅ Fallback to inline calculation succeeds
- ✅ Cache check happens before calculation
- ✅ Results identical to worker version
- ✅ Performance acceptable (slower but functional)

**Pass Criteria:**
- No calculation errors
- UI updates correctly
- Inline cache HIT logs appear

---

## Debug Console Commands

Open DevTools console and try these:

```javascript
// Check cache stats
import("./services/technicalsService").then(({getCacheStats}) => 
  console.log(getCacheStats())
);

// Force cache settings update
import("./services/technicalsService").then(({updateCacheSettings}) => 
  updateCacheSettings(20, 120)
);
```

## Console Log Examples

### Good (Expected):
```
[Technicals] Cache config updated: size=15, TTL=60000ms
[Technicals] Cache MISS, calculating...
[Technicals] Cache HIT
[Technicals] Cleaned 2 stale cache entries
```

### Bad (Issues):
```
[Technicals] Cache MISS, calculating...
[Technicals] Cache MISS, calculating...  ← Duplicate! (Should not happen)
[Technicals] Cleaned 15 stale cache entries  ← Too many entries cleaned
Worker Error Event  ← Worker crashed (fallback should handle)
```

## Performance Metrics

### Target Metrics:
- **Idle CPU:** 20-30%
- **Calculation Time:** <1 second
- **Cache Hit Rate:** >60%
- **Cleanup Frequency:** ≤2 per minute
- **Memory Usage:** <250MB (5-15 cache entries)

### Red Flags:
- ⚠️ CPU >40% idle for >10 seconds
- ⚠️ Calculations taking >3 seconds
- ⚠️ Cache hit rate <30%
- ⚠️ Cleanup every request
- ⚠️ Memory growing unbounded

## Troubleshooting

### Issue: CPU Still High
1. Check console for duplicate calculation logs
2. Verify cache initialization logs on app start
3. Disable other extensions/addons
4. Try hard refresh (Ctrl+Shift+R)

### Issue: Stale Indicators
1. Check if data is actually updating (compare with external source)
2. Verify cache TTL isn't too long (should be 60s default)
3. Clear localStorage and reload
4. Check for WebSocket connection issues

### Issue: Slow Calculations
1. Check worker is loading (not falling back)
2. Reduce number of enabled indicators
3. Verify cache is being used (check logs)
4. Ensure kline history limit is reasonable (<1000)

## Reporting Issues

When reporting issues, include:
1. **Browser & Version:** (e.g., Chrome 120)
2. **Settings Mode:** (Light/Balanced/Pro)
3. **Console Logs:** Last 20-30 lines
4. **CPU Usage:** Screenshot from system monitor
5. **Steps to Reproduce:** Exact sequence that triggers issue

## Success Criteria

The fix is successful when ALL of the following are true:
- ✅ CPU usage 20-30% idle (not 50%)
- ✅ Technical indicators update in real-time
- ✅ Cache hit rate >60% for repeat data
- ✅ No duplicate calculations in console
- ✅ Calculations complete <1 second
- ✅ Memory usage stable (<250MB)
- ✅ Settings persist and take effect
- ✅ No errors in console logs

## Additional Tests

### Stress Test:
1. Add 10 favorite symbols
2. Enable all indicators
3. Switch rapidly between symbols
4. Verify: CPU stays reasonable, no crashes, cache handles load

### Long-Running Test:
1. Leave app open for 1 hour
2. Check: Memory stable, cache cleanup working, no leaks

### Multi-Tab Test:
1. Open app in 2 tabs
2. Verify: Settings sync, no conflicts, each tab independent
