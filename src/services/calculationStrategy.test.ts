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

type Telemetry = ReturnType<CalculationStrategy['exportTelemetry']>;

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

  it('derives circuit breaker health from lastMedian > 500ms', () => {
    const strategy = new CalculationStrategy();
    strategy.recordMetrics('wasm', 600, false, 500);

    const t = strategy.exportTelemetry();
    expect(t.circuitBreaker.wasm.healthy).toBe(false);
    expect(t.stats.wasm.errors).toBe(1);
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
