import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSettings = {
  active: ['ema1'],
  configs: {
    ema1: { period: 10 }
  }
};

const mockKlines = [
  { time: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
  { time: 2000, open: 1.5, high: 2.5, low: 1.0, close: 2.0, volume: 150 },
  { time: 3000, open: 2.0, high: 3.0, low: 1.5, close: 2.5, volume: 200 }
];

vi.mock('./technicalsService', () => ({
  technicalsService: {
    calculateTechnicalsInline: vi.fn()
  }
}));

vi.mock('./calculationStrategy', () => ({
  calculationStrategy: {
    recordMetrics: vi.fn()
  }
}));

vi.mock('../stores/indicator.svelte', () => ({
  indicatorState: {
    toJSON: () => mockSettings
  }
}));

// We'll dynamically control these mocks within tests
vi.mock('./wasmCalculator', () => {
  return {
    wasmCalculator: {
      isAvailable: vi.fn(() => true),
      calculate: vi.fn()
    }
  };
});

vi.mock('./webGpuCalculator', () => {
  return {
    WebGpuCalculator: {
      isSupported: vi.fn(() => Promise.resolve(true))
    },
    webGpuCalculator: {
      calculate: vi.fn()
    }
  };
});

describe('engineBenchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('benchmarkEngine', () => {
    it('should calculate technicals using TS engine without throwing', async () => {
      const { benchmarkEngine } = await import('./engineBenchmark');
      const { technicalsService } = await import('./technicalsService');

      const warmupRuns = 1;
      const measuredRuns = 2;
      const result = await benchmarkEngine('ts', mockKlines, mockSettings as any, warmupRuns, measuredRuns);

      expect(result.length).toBe(measuredRuns);
      expect(technicalsService.calculateTechnicalsInline).toHaveBeenCalledTimes(warmupRuns + measuredRuns);
      result.forEach(time => expect(typeof time).toBe('number'));
    });

    it('should return empty array if WASM engine throws an error', async () => {
      const { wasmCalculator } = await import('./wasmCalculator');
      // Mock an error during calculation
      (wasmCalculator.calculate as any).mockRejectedValueOnce(new Error('WASM computation failed'));

      const { benchmarkEngine } = await import('./engineBenchmark');
      const result = await benchmarkEngine('wasm', mockKlines, mockSettings as any, 1, 2);

      expect(result).toEqual([]);
      expect(wasmCalculator.calculate).toHaveBeenCalledTimes(1);
    });

    it('should return empty array if WASM is not available', async () => {
      const { wasmCalculator } = await import('./wasmCalculator');
      (wasmCalculator.isAvailable as any).mockReturnValueOnce(false);

      const { benchmarkEngine } = await import('./engineBenchmark');
      const result = await benchmarkEngine('wasm', mockKlines, mockSettings as any, 1, 2);

      expect(result).toEqual([]);
      expect(wasmCalculator.calculate).not.toHaveBeenCalled();
    });

    it('should calculate technicals using WASM engine when successful', async () => {
      const { wasmCalculator } = await import('./wasmCalculator');
      (wasmCalculator.calculate as any).mockResolvedValue(undefined);

      const { benchmarkEngine } = await import('./engineBenchmark');
      const warmupRuns = 1;
      const measuredRuns = 1;
      const result = await benchmarkEngine('wasm', mockKlines, mockSettings as any, warmupRuns, measuredRuns);

      expect(result.length).toBe(measuredRuns);
      expect(wasmCalculator.calculate).toHaveBeenCalledTimes(warmupRuns + measuredRuns);
    });

    it('should return empty array if GPU engine throws an error', async () => {
      const { webGpuCalculator } = await import('./webGpuCalculator');
      (webGpuCalculator.calculate as any).mockRejectedValueOnce(new Error('GPU Out of Memory'));

      const { benchmarkEngine } = await import('./engineBenchmark');
      const result = await benchmarkEngine('gpu', mockKlines, mockSettings as any, 1, 2);

      expect(result).toEqual([]);
      expect(webGpuCalculator.calculate).toHaveBeenCalledTimes(1);
    });

    it('should return empty array if GPU is not supported', async () => {
      const { WebGpuCalculator } = await import('./webGpuCalculator');
      (WebGpuCalculator.isSupported as any).mockResolvedValueOnce(false);

      const { benchmarkEngine } = await import('./engineBenchmark');
      const result = await benchmarkEngine('gpu', mockKlines, mockSettings as any, 1, 2);

      expect(result).toEqual([]);
      const { webGpuCalculator } = await import('./webGpuCalculator');
      expect(webGpuCalculator.calculate).not.toHaveBeenCalled();
    });

    it('should calculate technicals using GPU engine when successful', async () => {
      const { webGpuCalculator } = await import('./webGpuCalculator');
      (webGpuCalculator.calculate as any).mockResolvedValue(undefined);

      const { benchmarkEngine } = await import('./engineBenchmark');
      const warmupRuns = 1;
      const measuredRuns = 1;
      const result = await benchmarkEngine('gpu', mockKlines, mockSettings as any, warmupRuns, measuredRuns);

      expect(result.length).toBe(measuredRuns);
      expect(webGpuCalculator.calculate).toHaveBeenCalledTimes(warmupRuns + measuredRuns);
    });

    it('should return empty array for an unknown engine type', async () => {
      const { benchmarkEngine } = await import('./engineBenchmark');
      const result = await benchmarkEngine('quantum' as any, mockKlines, mockSettings as any, 1, 2);
      expect(result).toEqual([]);
    });
  });

  describe('runBenchmark', () => {
    it('should run benchmark, record metrics, and skip unavailable engines', async () => {
      const { runBenchmark } = await import('./engineBenchmark');
      const { calculationStrategy } = await import('./calculationStrategy');

      const { wasmCalculator } = await import('./wasmCalculator');
      // Let WASM fail, TS succeed
      (wasmCalculator.calculate as any).mockRejectedValue(new Error('WASM fallback test'));

      // GPU succeeds
      const { webGpuCalculator } = await import('./webGpuCalculator');
      (webGpuCalculator.calculate as any).mockResolvedValue(undefined);

      const sizes = [100];
      const results = await runBenchmark(sizes, 1, 2);

      expect(results.sizes).toEqual(sizes);
      // It should only have results for TS and GPU, WASM failed
      expect(results.results.map(r => r.engine)).toEqual(expect.arrayContaining(['ts', 'gpu']));
      expect(results.results.map(r => r.engine)).not.toContain('wasm');

      // Strategy should have been called for successful engines
      expect(calculationStrategy.recordMetrics).toHaveBeenCalledWith('ts', expect.any(Number), true, 100);
      expect(calculationStrategy.recordMetrics).toHaveBeenCalledWith('gpu', expect.any(Number), true, 100);
      expect(calculationStrategy.recordMetrics).not.toHaveBeenCalledWith('wasm', expect.any(Number), true, 100);
    });
  });
});
