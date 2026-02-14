import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebGpuCalculator } from '../../src/services/webGpuCalculator';

// Stub WebGPU constants
vi.stubGlobal('GPUBufferUsage', {
  STORAGE: 1,
  COPY_DST: 2,
  COPY_SRC: 4,
  UNIFORM: 8,
  MAP_READ: 16,
});
vi.stubGlobal('GPUMapMode', {
  READ: 1,
});

// Mock WebGPU objects
const mockCommandEncoder = {
    beginComputePass: vi.fn(() => ({
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      dispatchWorkgroups: vi.fn(),
      end: vi.fn(),
    })),
    copyBufferToBuffer: vi.fn(),
    finish: vi.fn(),
};

const mockQueue = {
    writeBuffer: vi.fn(),
    submit: vi.fn(),
};

const mockPipeline = {
    getBindGroupLayout: vi.fn(),
};

const mockBufferPrototype = {
  mapAsync: vi.fn(),
  unmap: vi.fn(),
  destroy: vi.fn(),
  // getMappedRange will be dynamic
};

const mockDevice = {
  createShaderModule: vi.fn(),
  createComputePipeline: vi.fn(() => mockPipeline),
  createBuffer: vi.fn((desc) => ({
      ...mockBufferPrototype,
      getMappedRange: vi.fn(() => new ArrayBuffer(desc.size)),
  })),
  createBindGroup: vi.fn(),
  createCommandEncoder: vi.fn(() => mockCommandEncoder),
  queue: mockQueue,
  lost: new Promise(() => {}),
};

const mockAdapter = {
  requestDevice: vi.fn(() => Promise.resolve(mockDevice)),
};

const mockGpu = {
  requestAdapter: vi.fn(() => Promise.resolve(mockAdapter)),
};

describe('WebGpuCalculator', () => {
  let calculator: WebGpuCalculator;

  beforeEach(() => {
    vi.stubGlobal('navigator', { gpu: mockGpu });
    // Reset mocks
    vi.clearAllMocks();
    calculator = new WebGpuCalculator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize correctly', async () => {
    await calculator.init();
    expect(mockGpu.requestAdapter).toHaveBeenCalled();
    expect(mockAdapter.requestDevice).toHaveBeenCalled();
  });

  it('should handle Float32Array params', async () => {
    const params = new Float32Array([1.5, 2.5]);
    const inputs = [new Float32Array(10)];

    await calculator.compute('test_float', 'shader_code', inputs, params, 10);

    // Verify writeBuffer called with params
    expect(mockQueue.writeBuffer).toHaveBeenCalledWith(
        expect.anything(), // buffer
        0, // offset
        params // data
    );
  });

  it('should handle ArrayBuffer params (mixed types)', async () => {
      const buffer = new ArrayBuffer(8);
      new Float32Array(buffer)[0] = 1.5;
      new Uint32Array(buffer)[1] = 10;

      const inputs = [new Float32Array(10)];

      await calculator.compute('test_mixed', 'shader_code', inputs, buffer, 10);

      expect(mockQueue.writeBuffer).toHaveBeenCalledWith(
          expect.anything(),
          0,
          buffer
      );
  });

  it('should handle Uint32Array params', async () => {
      const params = new Uint32Array([10, 20]);
      const inputs = [new Float32Array(10)];

      await calculator.compute('test_uint', 'shader_code', inputs, params, 10);

      expect(mockQueue.writeBuffer).toHaveBeenCalledWith(
          expect.anything(),
          0,
          params
      );
  });

  it('should handle number[] params (default to Uint32Array)', async () => {
      const params = [10, 20];
      const inputs = [new Float32Array(10)];

      await calculator.compute('test_array', 'shader_code', inputs, params, 10);

      expect(mockQueue.writeBuffer).toHaveBeenCalledWith(
          expect.anything(),
          0,
          expect.any(Uint32Array)
      );
  });

  it('should handle multiple outputs', async () => {
      const inputs = [new Float32Array(10)];
      const outputSizes = [10, 20];
      const params = new Uint32Array([1]);

      const result = await calculator.compute('test_multi', 'shader_code', inputs, params, outputSizes);

      // Should return array of results
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).length).toBe(2);

      // Check copyBufferToBuffer called twice (once per output to staging)
      // Note: we're checking the shared mockCommandEncoder
      // It is called in compute() -> copyBufferToBuffer
      expect(mockCommandEncoder.copyBufferToBuffer).toHaveBeenCalledTimes(2);
  });
});
