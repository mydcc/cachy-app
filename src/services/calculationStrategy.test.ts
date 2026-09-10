import { describe, it, expect, vi, beforeEach } from 'vitest';

// calculationStrategy pulls svelte-ish deps (toastService.svelte, i18n, svelte/store).
vi.mock('./toastService.svelte', () => ({
  toastService: { error: vi.fn(), warning: vi.fn() }
}));
vi.mock('../locales/i18n', () => ({
  _: { subscribe: (fn: (t: unknown) => void) => { fn((key: string) => key); return () => {}; } }
}));
vi.mock('svelte/store', () => ({
  get: (store: { subscribe: (fn: (t: unknown) => void) => () => void }) => {
    let value: unknown;
    store.subscribe((v: unknown) => { value = v; })();
    return value;
  }
}));

const capabilitiesMock = vi.hoisted(() => ({
  current: Promise.resolve({
    wasm: true,
    wasmSIMD: true,
    wasmThreads: false,
    gpu: true,
    gpuFeatures: [],
    crossOriginIsolated: false,
    sharedMemory: false,
    cpuCores: 8,
    deviceMemory: 8,
    isMobile: false,
    battery: { charging: true, level: 0.9 }
  })
}));

vi.mock('./capabilityDetection', () => ({
  getCapabilities: vi.fn(() => capabilitiesMock.current)
}));

import { CalculationStrategy } from './calculationStrategy';
import { toastService } from './toastService.svelte';
import type { IndicatorSettings } from '../types/indicators';

const autoSettings = { preferredEngine: 'auto' } as IndicatorSettings;

const baseCaps = {
  wasm: true,
  wasmSIMD: true,
  wasmThreads: false,
  gpu: true,
  gpuFeatures: [] as string[],
  crossOriginIsolated: false,
  sharedMemory: false,
  cpuCores: 8,
  deviceMemory: 8,
  isMobile: false,
  battery: { charging: true, level: 0.9 } as { charging: boolean; level: number } | undefined
};

const makeStrategy = (caps: typeof baseCaps | Promise<typeof baseCaps>) => {
  capabilitiesMock.current = Promise.resolve(caps) as never;
  return new CalculationStrategy();
};

describe('CalculationStrategy.exportTelemetry', () => {
  beforeEach(() => {
    capabilitiesMock.current = Promise.resolve(baseCaps) as never;
  });

  it('exports resolved capability values (not a Promise) after warm-up', async () => {
    const strategy = makeStrategy(baseCaps);
    await vi.waitFor(() => {
      expect(strategy.exportTelemetry().capabilities.wasm).toBe(true);
    });

    const t = strategy.exportTelemetry();
    expect(t.capabilities).toEqual({ ts: true, wasm: true, simd: true, sharedMemory: false, gpu: true });
    expect(t.context).toEqual({ lowBattery: false, lowMemory: false, isMobile: false });
  });

  it('falls back to safe defaults before the capability snapshot resolves', () => {
    // Never awaited: simulate the window before detection finishes.
    const strategy = makeStrategy(baseCaps);
    vi.spyOn(strategy as unknown as { capabilitiesSnapshot: unknown }, 'capabilitiesSnapshot', 'get')
      .mockReturnValue(null);

    const t = strategy.exportTelemetry();
    expect(t.capabilities.ts).toBe(true);
    expect(t.capabilities.wasm).toBe(typeof WebAssembly !== 'undefined');
    expect(t.capabilities.simd).toBe(false);
    expect(t.context.lowBattery).toBe(false);
    expect(t.context.lowMemory).toBe(false);
    expect(t.context.isMobile).toBe(false);
  });

  it('flags low battery only when battery exists, is discharging and below 20%', async () => {
    const strategy = makeStrategy({ ...baseCaps, deviceMemory: 2, isMobile: true, battery: { charging: false, level: 0.1 } });
    await vi.waitFor(() => {
      const t = strategy.exportTelemetry();
      expect(t.context.lowBattery).toBe(true);
    });
    expect(strategy.exportTelemetry().context.lowMemory).toBe(true);
    expect(strategy.exportTelemetry().context.isMobile).toBe(true);
  });

  it('never flags low battery when battery info is unavailable (desktop)', async () => {
    const strategy = makeStrategy({ ...baseCaps, battery: undefined });
    await vi.waitFor(() => {
      expect(strategy.exportTelemetry().context.lowBattery).toBe(false);
    });
  });

  it('derives circuit breaker health from the degradation state, not one spike', () => {
    const strategy = new CalculationStrategy();
    strategy.selectEngine(autoSettings); // pins wasm
    strategy.recordMetrics('wasm', 600, false, 500);
    strategy.recordMetrics('wasm', 600, false, 500);

    expect(strategy.exportTelemetry().circuitBreaker.wasm.healthy).toBe(true);

    strategy.recordMetrics('wasm', 600, false, 500);

    const t = strategy.exportTelemetry();
    expect(t.circuitBreaker.wasm.healthy).toBe(false);
    expect(t.stats.wasm.errors).toBe(3);
  });
});

describe('CalculationStrategy session pinning and degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pins one engine per session in auto mode instead of routing by size', () => {
    const strategy = new CalculationStrategy();
    // Capabilities are unresolved here, so auto pins WASM optimistically.
    expect(strategy.selectEngine(autoSettings)).toBe('wasm');
    expect(strategy.selectEngine(autoSettings)).toBe('wasm');
  });

  it('pins TS when capabilities already rule out WASM', async () => {
    capabilitiesMock.current = Promise.resolve({ ...baseCaps, wasm: false }) as never;
    const strategy = new CalculationStrategy();
    await strategy.capabilitiesReady();

    expect(strategy.selectEngine(autoSettings)).toBe('ts');
  });

  it('lets an explicit preferredEngine bypass pinning and degradation', () => {
    const strategy = new CalculationStrategy();
    strategy.selectEngine(autoSettings);
    strategy.recordMetrics('wasm', 600, true, 500);
    strategy.recordMetrics('wasm', 600, true, 500);
    strategy.recordMetrics('wasm', 600, true, 500);

    expect(strategy.selectEngine(autoSettings)).toBe('ts'); // degraded
    expect(strategy.selectEngine({ preferredEngine: 'wasm' } as IndicatorSettings)).toBe('wasm');
    expect(strategy.selectEngine({ preferredEngine: 'ts' } as IndicatorSettings)).toBe('ts');
  });

  it('degrades only after 3 consecutive slow runs, with a switch notice', () => {
    const strategy = new CalculationStrategy();
    strategy.selectEngine(autoSettings);

    strategy.recordMetrics('wasm', 600, true, 500);
    strategy.recordMetrics('wasm', 600, true, 500);
    expect(strategy.selectEngine(autoSettings)).toBe('wasm');
    expect(strategy.exportTelemetry().circuitBreaker.wasm.healthy).toBe(true);

    strategy.recordMetrics('wasm', 600, true, 500);
    expect(strategy.selectEngine(autoSettings)).toBe('ts');
    expect(strategy.exportTelemetry().circuitBreaker.wasm).toMatchObject({ healthy: false, failures: 3 });
    // The file-level i18n mock returns the key itself, so the switch notice
    // is asserted by key (interpolation happens only with real svelte-i18n).
    expect(vi.mocked(toastService.error)).toHaveBeenCalledWith('calculationStrategy.engineDegraded');
  });

  it('resets the slow streak on a fast success', () => {
    const strategy = new CalculationStrategy();
    strategy.selectEngine(autoSettings);

    strategy.recordMetrics('wasm', 600, true, 500);
    strategy.recordMetrics('wasm', 600, true, 500);
    strategy.recordMetrics('wasm', 40, true, 500);
    strategy.recordMetrics('wasm', 600, true, 500);
    strategy.recordMetrics('wasm', 600, true, 500);

    expect(strategy.selectEngine(autoSettings)).toBe('wasm');
    expect(strategy.exportTelemetry().circuitBreaker.wasm.healthy).toBe(true);
  });

  it('never degrades from benchmark context, only from live runs', () => {
    const strategy = new CalculationStrategy();
    strategy.selectEngine(autoSettings);

    strategy.recordMetrics('wasm', 1200, true, 10000, 'bench');
    strategy.recordMetrics('wasm', 1200, true, 10000, 'bench');
    strategy.recordMetrics('wasm', 1200, true, 10000, 'bench');

    expect(strategy.selectEngine(autoSettings)).toBe('wasm');
    expect(strategy.exportTelemetry().circuitBreaker.wasm.healthy).toBe(true);
  });

  it('re-probes the pinned engine after the degradation window', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const strategy = new CalculationStrategy();
      strategy.selectEngine(autoSettings);
      strategy.recordMetrics('wasm', 600, true, 500);
      strategy.recordMetrics('wasm', 600, true, 500);
      strategy.recordMetrics('wasm', 600, true, 500);
      expect(strategy.selectEngine(autoSettings)).toBe('ts');

      vi.setSystemTime(new Date('2026-01-01T00:06:00Z'));
      expect(strategy.selectEngine(autoSettings)).toBe('wasm');

      // Slow again → degrades again instead of flapping per tick.
      strategy.recordMetrics('wasm', 600, true, 500);
      strategy.recordMetrics('wasm', 600, true, 500);
      strategy.recordMetrics('wasm', 600, true, 500);
      expect(strategy.selectEngine(autoSettings)).toBe('ts');
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('CalculationStrategy.recordMetrics', () => {
  it('keeps success and failure accounting per engine', () => {
    const strategy = new CalculationStrategy();
    strategy.recordMetrics('wasm', 1200, false, 500);
    strategy.recordMetrics('ts', 40, true, 500);

    const t = strategy.exportTelemetry();
    expect(t.stats.wasm.errors).toBe(1);
    expect(t.stats.ts.errors).toBe(0);
    expect(t.stats.ts.calls).toBe(1);
    expect(t.usagePercent.wasm).toBe(50);
    expect(t.usagePercent.ts).toBe(50);
  });
});

describe('CalculationStrategy cache accounting', () => {
  it('starts with zero hits, misses and hit rate', () => {
    const strategy = new CalculationStrategy();

    const t = strategy.exportTelemetry();
    expect(t.cache).toEqual({ hits: 0, misses: 0, hitRate: 0 });
  });

  it('counts hits and misses apart from engine calls', () => {
    const strategy = new CalculationStrategy();
    strategy.recordMetrics('ts', 40, true, 500);
    strategy.recordCacheHit();
    strategy.recordCacheHit();
    strategy.recordCacheMiss();

    const t = strategy.exportTelemetry();
    expect(t.cache).toEqual({ hits: 2, misses: 1, hitRate: 67 });
    // Engine Avg stays honest: the ~0ms cache hits never enter engine stats.
    expect(t.stats.ts.calls).toBe(1);
    expect(t.usagePercent.ts).toBe(100);
  });
});
