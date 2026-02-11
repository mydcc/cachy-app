import smaShader from '../shaders/sma.wgsl?raw';
import wmaShader from '../shaders/wma.wgsl?raw';
import emaShader from '../shaders/ema.wgsl?raw';
import rsiShader from '../shaders/rsi.wgsl?raw';
import stddevShader from '../shaders/stddev.wgsl?raw';
import stochRawShader from '../shaders/stoch_raw.wgsl?raw';
import vwmaShader from '../shaders/vwma.wgsl?raw';
import atrShader from '../shaders/atr.wgsl?raw';
import cciShader from '../shaders/cci.wgsl?raw';
import superTrendShader from '../shaders/supertrend.wgsl?raw';
import mfiShader from '../shaders/mfi.wgsl?raw';
import adxShader from '../shaders/adx.wgsl?raw';
import vwapShader from '../shaders/vwap.wgsl?raw';
import chopShader from '../shaders/choppiness.wgsl?raw';
import wrShader from '../shaders/williams_r.wgsl?raw';
import momShader from '../shaders/momentum.wgsl?raw';
import commonShader from '../shaders/common.wgsl?raw';

import type { TechnicalsData } from './technicalsTypes';
import type { IndicatorSettings } from '../types/indicators';
import { calculateIndicatorsFromArrays } from '../utils/technicalsCalculator'; // Fallback
import { toNumFast } from '../utils/fastConversion';

export class WebGpuCalculator {
  private device: GPUDevice | null = null;
  private adapter: GPUAdapter | null = null;
  private pipelines = new Map<string, GPUComputePipeline>();
  
  // Per-frame GPU buffer cache: reuses GPU buffers when the same TypedArray
  // reference is passed to multiple compute() calls within a single calculate() frame.
  private frameBufferCache = new Map<Float32Array | Uint32Array, GPUBuffer>();
  private frameBufferHits = 0;
  private frameBufferMisses = 0;
  
  // Feature detection
  static async isSupported(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  }

  isAvailable(): boolean {
    return !!this.device || (typeof navigator !== 'undefined' && !!navigator.gpu);
  }

  async init(): Promise<void> {
    if (this.device) return;

    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }

    this.adapter = await navigator.gpu.requestAdapter();
    if (!this.adapter) {
      throw new Error('No WebGPU adapter found');
    }

    this.device = await this.adapter.requestDevice();
    
    // Lost device handling
    this.device.lost.then((info) => {
      console.error(`WebGPU device lost: ${info.message}`);
      this.device = null;
      this.pipelines.clear();
    });

    // Pre-create pipelines for known shaders
    // This is an optimization to avoid recreating pipelines on every compute call
    // For shaders with 'auto' layout, we can create them once.
    // For shaders with specific layouts (e.g., SuperTrend, StochRaw, VWAP),
    // we might need a more specialized creation or create them on first use.
    // For now, let's create all known 'auto' layout pipelines here.
    // Shaders like SuperTrend, StochRaw, VWAP have specific binding requirements
    // that might not fit the generic `compute` method's auto-layout.
    // The `compute` method handles pipeline creation on demand if not found.
    // So, we only need to pre-create if we want to ensure they are ready.
    // The user's instruction implies pre-creating some, so let's follow that.
    
    // The user's instruction snippet for init() is a bit fragmented and seems to replace
    // the generic pipeline creation logic. I will integrate the new pipeline sets
    // into the existing `init` flow, assuming `createComputePipeline` is a new helper.
    
    // Let's assume the user wants to pre-create these specific pipelines.
    // The `compute` method already handles caching, so this might be redundant
    // unless there's a specific reason to pre-create them here (e.g., for specific layouts).
    // Given the instruction, I'll add the new pipeline sets here.
    // I'll also add a helper `createComputePipeline` as implied by the instruction.
    
    // The original `compute` method creates pipelines on demand.
    // The instruction seems to want to pre-create some.
    // I will add the pre-creation calls here, and ensure `createComputePipeline` is defined.
    // Note: The `compute` method's pipeline creation logic will still work as a fallback
    // or for pipelines not listed here.

    // The instruction snippet for init() is:
    /*
      let pipeline      this.pipelines.set('vwap', await this.createComputePipeline(vwapShader)); // specific layout -> createComputePipeline
      this.pipelines.set('stochRaw', await this.createComputePipeline(stochRawShader));
      this.pipelines.set('supertrend', await this.createComputePipeline(superTrendShader));
      
      // New shaders
      this.pipelines.set('choppiness', await this.createComputePipeline(chopShader));
      this.pipelines.set('williamsR', await this.createComputePipeline(wrShader));
      this.pipelines.set('momentum', await this.createComputePipeline(momShader));

      if (import.meta.env.DEV) {
        console.log('[WebGPU] Initialized pipelines');
      }    });
          this.pipelines.set(shaderName, pipeline);
      }
    */
    // This looks like it's meant to be *inside* the `init` method, replacing or augmenting
    // the pipeline creation logic. However, the `compute` method already handles pipeline caching.
    // To faithfully apply the change, I will add these `this.pipelines.set` calls to `init()`,
    // and define `createComputePipeline`. This means these pipelines will be created eagerly.

    this.pipelines.set('vwap', await this.createComputePipeline(vwapShader)); // specific layout -> createComputePipeline
    this.pipelines.set('stochRaw', await this.createComputePipeline(stochRawShader));
    this.pipelines.set('supertrend', await this.createComputePipeline(superTrendShader));
    
    // New shaders
    this.pipelines.set('choppiness', await this.createComputePipeline(chopShader));
    this.pipelines.set('williamsR', await this.createComputePipeline(wrShader));
    this.pipelines.set('momentum', await this.createComputePipeline(momShader));

    if (import.meta.env.DEV) {
      console.log('[WebGPU] Initialized pipelines');
    }
  }

  private async createComputePipeline(shaderCode: string): Promise<GPUComputePipeline> {
    if (!this.device) throw new Error('WebGPU device not initialized for pipeline creation');
    const module = this.device.createShaderModule({ code: shaderCode });
    return this.device.createComputePipeline({
        layout: 'auto',
        compute: { module, entryPoint: 'main' },
    });
  }

  /**
   * Generic Compute Method
   * Executes a compute shader with given inputs and parameters.
   * Assumes output is the same size as the first input.
   */
  /**
   * Get or create a GPU buffer for the given TypedArray.
   * If the same JS reference was already uploaded this frame, reuse the GPU buffer.
   */
  private getOrCreateInputBuffer(data: Float32Array | Uint32Array): GPUBuffer {
      const cached = this.frameBufferCache.get(data);
      if (cached) {
          this.frameBufferHits++;
          return cached;
      }
      
      this.frameBufferMisses++;
      const buffer = this.device!.createBuffer({
          size: data.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true,
      });
      if (data instanceof Float32Array) {
          new Float32Array(buffer.getMappedRange()).set(data);
      } else {
          new Uint32Array(buffer.getMappedRange()).set(data);
      }
      buffer.unmap();
      this.frameBufferCache.set(data, buffer);
      return buffer;
  }
  
  /**
   * Destroy all per-frame cached GPU buffers. Call at end of calculate().
   */
  private clearFrameBuffers(): void {
      if (import.meta.env.DEV && (this.frameBufferHits > 0 || this.frameBufferMisses > 0)) {
          console.log(`[WebGPU] Frame buffer stats: ${this.frameBufferHits} reuses, ${this.frameBufferMisses} new uploads`);
      }
      this.frameBufferCache.forEach(buf => buf.destroy());
      this.frameBufferCache.clear();
      this.frameBufferHits = 0;
      this.frameBufferMisses = 0;
  }

  /**
   * Generic Compute Method
   * Executes a compute shader with given inputs and parameters.
   * Uses per-frame buffer cache to avoid re-uploading identical data.
   */
  async compute(
      shaderName: string,
      shaderCode: string,
      inputs: (Float32Array | Uint32Array)[],
      params: number[] | ArrayBuffer,
      outputSize: number
  ): Promise<Float32Array> {
      await this.init();
      if (!this.device) throw new Error('WebGPU device not initialized');

      // 1. Create/Reuse Input Buffers
      const ownedBuffers: GPUBuffer[] = []; // Buffers we create here (output, params, staging)
      const bindGroupEntries: GPUBindGroupEntry[] = [];

      for (let i = 0; i < inputs.length; i++) {
          const buffer = this.getOrCreateInputBuffer(inputs[i]);
          // Don't push to ownedBuffers — these are managed by frameBufferCache
          bindGroupEntries.push({ binding: i, resource: { buffer } });
      }

      // Output Buffer (Storage + Write access in shader, Copy Src to read back)
      const outputByteSize = outputSize * 4;
      const outputBuffer = this.device.createBuffer({
          size: outputByteSize,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      ownedBuffers.push(outputBuffer);
      bindGroupEntries.push({ binding: inputs.length, resource: { buffer: outputBuffer } });
      
      // Output Buffer 2 (Optional)? 
      // Current generic compute only supports 1 output.
      // SuperTrend returns 2 values (SuperTrend, Trend).
      // We might need to extend this for multiple outputs.
      // For now, SuperTrend shader has 2 write inputs? 
      // Binding 4: output_supertrend, Binding 5: output_trend.
      // If shader asks for Binding 5, we crash if not provided.
      // Generic compute assumes `inputs.length + 1` is params.
      // SuperTrend Shader: 4 inputs + 2 outputs + 1 param.
      // This Generic function is too simple for SuperTrend.
      // We need it to be more flexible or specialized.
      // To keep it simple: We will allow `extraOutputs` param?
      
      // Params Buffer (Uniform)
      // Binding = inputs.length + outputs (1)
      const paramBinding = inputs.length + 1; // Assuming 1 output
      // Wait, if shader needs more outputs, we need to pass them.
      // Let's stick to 1 output for standard wrappers.
      // For SuperTrend, we will write a custom `computeSuperTrend` or make compute accept `outputCount`.
      
      let paramsBuffer: GPUBuffer | null = null;
      if (params) {
          let bufferSize = 0;
          if (params instanceof ArrayBuffer) {
              bufferSize = params.byteLength;
          } else {
              bufferSize = (params as number[]).length * 4;
          }
          bufferSize = Math.max(16, bufferSize);
          
          paramsBuffer = this.device.createBuffer({
              size: bufferSize, 
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
          
          if (params instanceof ArrayBuffer) {
              this.device.queue.writeBuffer(paramsBuffer, 0, params);
          } else {
              this.device.queue.writeBuffer(paramsBuffer, 0, new Uint32Array(params as number[]));
          }
          
          ownedBuffers.push(paramsBuffer);
          bindGroupEntries.push({ binding: paramBinding, resource: { buffer: paramsBuffer } });
      }

      // 2. Pipeline Creation (Cached)
      let pipeline = this.pipelines.get(shaderName);
      if (!pipeline) {
          const module = this.device.createShaderModule({ code: shaderCode });
          pipeline = this.device.createComputePipeline({
              layout: 'auto',
              compute: { module, entryPoint: 'main' },
          });
          this.pipelines.set(shaderName, pipeline);
      }

      // 3. Bind Group
      const bindGroup = this.device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: bindGroupEntries,
      });

      // 4. Encode & Dispatch
      const commandEncoder = this.device.createCommandEncoder();
      const passEncoder = commandEncoder.beginComputePass();
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      
      const workgroupCount = Math.ceil(outputSize / 64);
      passEncoder.dispatchWorkgroups(workgroupCount);
      passEncoder.end();

      // Read back
      const stagingBuffer = this.device.createBuffer({
          size: outputByteSize,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      ownedBuffers.push(stagingBuffer);
      commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputByteSize);
      this.device.queue.submit([commandEncoder.finish()]);

      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
      stagingBuffer.unmap();
      
      // Cleanup owned buffers (output, params, staging — NOT cached input buffers)
      for (const buf of ownedBuffers) buf.destroy();

      return result;
  }

  /**
   * Main entry point for hybrid calculation
   */
  async calculate(
    klines: any[],
    settings: IndicatorSettings,
    enabledIndicators: Partial<Record<string, boolean>> = {}
  ): Promise<TechnicalsData> {
    await this.init();

    // 1. Prepare Data for GPU (Float32) and CPU (Float64)
    // Allocate ALL typed arrays ONCE — no per-indicator duplication
    const len = klines.length;
    const closes32 = new Float32Array(len);
    const highs32 = new Float32Array(len);
    const lows32 = new Float32Array(len);
    const volumes32 = new Float32Array(len);
    
    const times = new Float64Array(len);
    const opens = new Float64Array(len);
    const highs = new Float64Array(len);
    const lows = new Float64Array(len);
    const closes = new Float64Array(len);
    const volumes = new Float64Array(len);

    for (let i = 0; i < len; i++) {
        const k = klines[i];
        const o = toNumFast(k.open);
        const h = toNumFast(k.high);
        const l = toNumFast(k.low);
        const c = toNumFast(k.close);
        const v = toNumFast(k.volume || 0);
        
        times[i] = k.time;
        opens[i] = o;
        highs[i] = h;    highs32[i] = h;
        lows[i] = l;     lows32[i] = l;
        closes[i] = c;   closes32[i] = c;
        volumes[i] = v;   volumes32[i] = v;
    }

    // 2. Identify what runs on GPU vs CPU
    const useGpuForSma = enabledIndicators.sma !== false;
    
    // 3. Run CPU Calculation (excluding GPU parts if possible, or just overwrite)
    // To allow partial CPU calc, we temporarily disable SMA in the options passed to CPU
    const cpuEnabled = { ...enabledIndicators };
    if (useGpuForSma) {
        cpuEnabled.sma = false;
    }

    // Run Base CPU Calc
    const result = calculateIndicatorsFromArrays(
        times, opens, highs, lows, closes, volumes,
        settings, cpuEnabled
    );

    // 4. Run GPU Calculation
    if (useGpuForSma && this.device) {
        try {
            // --- Moving Averages ---
            
            // SMA
            if (settings.sma.sma1.length > 0) {
                const val = await this.calculateSma(closes32, settings.sma.sma1.length);
                this.injectResult(result, `SMA${settings.sma.sma1.length}`, val, closes, 'movingAverages');
            }
             if (settings.sma.sma2.length > 0) {
                const val = await this.calculateSma(closes32, settings.sma.sma2.length);
                this.injectResult(result, `SMA${settings.sma.sma2.length}`, val, closes, 'movingAverages');
            }
             if (settings.sma.sma3.length > 0) {
                const val = await this.calculateSma(closes32, settings.sma.sma3.length);
                this.injectResult(result, `SMA${settings.sma.sma3.length}`, val, closes, 'movingAverages');
            }

            // EMA (Using Serial Shader)
            if (enabledIndicators.ema !== false) {
                 if (settings.ema.ema1.length > 0) {
                    const val = await this.calculateEma(closes32, settings.ema.ema1.length);
                    this.injectResult(result, `EMA${settings.ema.ema1.length}`, val, closes, 'movingAverages');
                }
                 if (settings.ema.ema2.length > 0) {
                    const val = await this.calculateEma(closes32, settings.ema.ema2.length);
                    this.injectResult(result, `EMA${settings.ema.ema2.length}`, val, closes, 'movingAverages');
                }
                 if (settings.ema.ema3.length > 0) {
                    const val = await this.calculateEma(closes32, settings.ema.ema3.length);
                    this.injectResult(result, `EMA${settings.ema.ema3.length}`, val, closes, 'movingAverages');
                }
            }
            
            // WMA
            if (enabledIndicators.wma !== false && settings.wma.length > 0) {
                const val = await this.calculateWma(closes32, settings.wma.length);
                this.injectResult(result, `WMA${settings.wma.length}`, val, closes, 'movingAverages');
            }
            
            // VWMA
            if (enabledIndicators.vwma !== false && settings.vwma.length > 0) {
                 const val = await this.calculateVwma(closes32, volumes32, settings.vwma.length);
                 this.injectResult(result, `VWMA${settings.vwma.length}`, val, closes, 'movingAverages');
            }
            
            // HMA (Hull Moving Average) - Composition of WMAs
            // WMA(2*WMA(n/2) - WMA(n), sqrt(n))
            if (enabledIndicators.hma !== false && settings.hma.length > 0) {
                const length = settings.hma.length;
                const halfLength = Math.floor(length / 2);
                const sqrtLength = Math.round(Math.sqrt(length));
                
                const wmaHalf = await this.calculateWma(closes32, halfLength);
                const wmaFull = await this.calculateWma(closes32, length);
                
                // 2 * wmaHalf - wmaFull
                const intermediate = new Float32Array(len);
                for(let i=0; i<len; i++) {
                    intermediate[i] = (2 * wmaHalf[i]) - wmaFull[i];
                }
                
                const hma = await this.calculateWma(intermediate, sqrtLength);
                this.injectResult(result, `HMA${length}`, hma, closes, 'movingAverages');
            }
            
            // Volume MA
            if (enabledIndicators.volumeMa !== false && settings.volumeMa.length > 0) {
                let val: Float32Array | null = null;
                
                if (settings.volumeMa.maType === 'sma') {
                    val = await this.calculateSma(volumes32, settings.volumeMa.length);
                } else if (settings.volumeMa.maType === 'ema') {
                    val = await this.calculateEma(volumes32, settings.volumeMa.length);
                } else if (settings.volumeMa.maType === 'wma') {
                    val = await this.calculateWma(volumes32, settings.volumeMa.length);
                }
                
                if (val) {
                    if (!result.advanced) result.advanced = {};
                    const lastIdx = val.length - 1;
                    result.advanced.volumeMa = val[lastIdx];
                }
            }
            
            // MACD (Moving Average Convergence Divergence)
            // MACD Line = EMA(fast) - EMA(slow)
            // Signal Line = EMA(MACD Line, signal)
            // Histogram = MACD Line - Signal Line
            if (enabledIndicators.macd !== false) {
                 const fast = await this.calculateEma(closes32, settings.macd.fastLength);
                 const slow = await this.calculateEma(closes32, settings.macd.slowLength);
                 
                 const macdLine = new Float32Array(len);
                 for(let i=0; i<len; i++) macdLine[i] = fast[i] - slow[i];
                 
                 const signalLine = await this.calculateEma(macdLine, settings.macd.signalLength);
                 
                 const histogram = new Float32Array(len);
                 for(let i=0; i<len; i++) histogram[i] = macdLine[i] - signalLine[i];
                 
                 // Inject
                 this.injectResult(result, `MACD_Line`, macdLine, closes, 'oscillators');
                 this.injectResult(result, `MACD_Signal`, signalLine, closes, 'oscillators');
                 this.injectResult(result, `MACD_Hist`, histogram, closes, 'oscillators');
            }
            
            // --- Oscillators ---
            
            // RSI
            if (enabledIndicators.rsi !== false) {
                 const val = await this.calculateRsi(closes32, settings.rsi.length);
                 this.injectResult(result, `RSI${settings.rsi.length}`, val, closes, 'oscillators');
            }

            // Stoch
            if (enabledIndicators.stoch !== false) {
                 const k_raw = await this.calculateStochRaw(highs32, lows32, closes32, settings.stochastic.kPeriod);
                 const k_smooth = await this.calculateSma(k_raw, settings.stochastic.kSmoothing);
                 const d_line = await this.calculateSma(k_smooth, settings.stochastic.dPeriod);
                 this.injectResult(result, `StochK`, k_smooth, closes, 'oscillators');
                 this.injectResult(result, `StochD`, d_line, closes, 'oscillators');
            }
            
            // CCI
            if (enabledIndicators.cci !== false) {
                 const val = await this.calculateCci(highs32, lows32, closes32, settings.cci.length);
                 this.injectResult(result, `CCI`, val, closes, 'oscillators');
            }
            
            // ADX
            if (enabledIndicators.adx !== false) {
                const val = await this.calculateAdx(highs32, lows32, closes32, settings.adx.adxSmoothing);
                 this.injectResult(result, `ADX`, val, closes, 'oscillators');
            }
            
            // MFI
            if (enabledIndicators.mfi !== false) {
                const val = await this.calculateMfi(highs32, lows32, closes32, volumes32, settings.mfi.length);
                if (!result.advanced) result.advanced = {};
                // MFI usually in advanced or oscillators depending on UI. Check type.
                // TechnicalsData interface: advanced.mfi: { value: number, action: string }. 
                // Also could be in oscillators. 
                // Let's put in advanced to match technicalsCalculator.ts
                const lastVal = val[val.length-1];
                let action = "Neutral";
                if (lastVal > 80) action = "Sell";
                else if (lastVal < 20) action = "Buy";
                
                result.advanced.mfi = { value: lastVal, action };
            }

            // Williams %R
            if (enabledIndicators.williamsR !== false && settings.williamsR.length > 0) {
                const wr = await this.calculateWilliamsR(highs32, lows32, closes32, settings.williamsR.length);
                this.injectResult(result, 'Williams %R', wr, closes, 'oscillators');
            }
            
            // Momentum
            if (enabledIndicators.momentum !== false && settings.momentum.length > 0) {
                const mom = await this.calculateMomentum(closes32, settings.momentum.length);
                this.injectResult(result, 'Momentum', mom, closes, 'oscillators');
            }
            
            // --- Volatility ---
            
            // ATR
            if (enabledIndicators.atr !== false) {
                 const val = await this.calculateAtr(highs32, lows32, closes32, settings.atr.length);
                 
                 if (!result.volatility) result.volatility = { atr: 0, bb: { upper:0, middle:0, lower:0, percentP:0 } };
                 result.volatility.atr = val[val.length - 1];
            }
            
            // Bollinger Bands
            if (enabledIndicators.bb !== false) {
                const middle = await this.calculateSma(closes32, settings.bb.length);
                const stddev = await this.calculateStdDev(closes32, settings.bb.length);
                
                const upper = new Float32Array(len);
                const lower = new Float32Array(len);
                const mult = settings.bb.stdDev;
                
                for(let i=0; i<len; i++) {
                    upper[i] = middle[i] + (stddev[i] * mult);
                    lower[i] = middle[i] - (stddev[i] * mult);
                }
                
                // Need to replicate Volatility object structure for BB
                if (!result.volatility) result.volatility = { atr: 0, bb: { upper:0, middle:0, lower:0, percentP:0 } };
                const idx = len - 1;
                const range = upper[idx] - lower[idx];
                const pp = range === 0 ? 0.5 : (closes[idx] - lower[idx]) / range;
                
                result.volatility.bb = {
                    upper: upper[idx],
                    middle: middle[idx],
                    lower: lower[idx],
                    percentP: pp
                };
            }
            
            // SuperTrend
            if (enabledIndicators.superTrend !== false) {
                const atr = await this.calculateAtr(highs32, lows32, closes32, settings.superTrend.period);
                const st = await this.calculateSuperTrend(highs32, lows32, closes32, atr, settings.superTrend.factor, len);
                
                if (!result.advanced) result.advanced = {};
                const lastIdx = len - 1;
                result.advanced.superTrend = { 
                    value: st.supertrend[lastIdx], 
                    trend: st.trend[lastIdx] === 1 ? 'bull' : 'bear' 
                };
            }

            // Choppiness Index
            if (enabledIndicators.choppiness !== false && settings.choppiness.length > 0) {
                const chop = await this.calculateChoppiness(highs32, lows32, closes32, settings.choppiness.length);
                this.injectResult(result, 'CHOP', chop, closes, 'volatility');
            }
            
            // VWAP
            if (enabledIndicators.vwap !== false) {
                // Session Detection
                const isNewSession = new Uint32Array(len);
                isNewSession[0] = 1;
                for(let i=1; i<len; i++) {
                     const current = new Date(times[i]);
                     const prev = new Date(times[i-1]);
                     if (current.getUTCDate() !== prev.getUTCDate()) {
                         isNewSession[i] = 1;
                     }
                }
                
                const val = await this.calculateVwap(highs32, lows32, closes32, volumes32, isNewSession);
                
                if (!result.advanced) result.advanced = {};
                result.advanced.vwap = val[len-1];
            }
            

        } catch (e) {
            console.error('[WebGPU] Calc failed, falling back to CPU', e);
        } finally {
            // Cleanup all per-frame cached GPU buffers
            this.clearFrameBuffers();
        }
    }

    return result;
  }

  private injectResult(result: TechnicalsData, name: string, values: Float32Array, closes: Float64Array, category: 'movingAverages' | 'oscillators' | 'volatility') {
      if (!result[category]) {
          if (category === 'movingAverages') result[category] = [];
          else if (category === 'oscillators') result[category] = [];
          else (result as any)[category] = {};
      }
      
      const lastIdx = values.length - 1;
      const val = values[lastIdx];
      
      if (category === 'movingAverages' || category === 'oscillators') {
          // Check if exists and update, or push
          const arr = result[category] as any[];
          const existing = arr.find(x => x.name === name);
          if (existing) {
              existing.value = val;
              if (category === 'movingAverages') existing.price = closes[lastIdx];
          } else {
              const entry: any = {
                  name: name,
                  value: val,
                  signal: 0,
                  action: "Neutral"
              };
              if (category === 'movingAverages') entry.price = closes[lastIdx];
              arr.push(entry);
          }
      } else {
          // Volatility is still a record in TechnicalsData
          (result as any)[category][name] = val;
      }
  }

  // --- Helper Methods ---

  async calculateSma(data: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('sma', smaShader, [data], [windowSize, data.length], data.length);
  }

  async calculateWma(data: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('wma', wmaShader, [data], [windowSize, data.length], data.length);
  }

  async calculateEma(data: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('ema', emaShader, [data], [windowSize, data.length], data.length);
  }
  
  async calculateVwma(data: Float32Array, volume: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('vwma', vwmaShader, [data, volume], [windowSize, data.length], data.length);
  }
  
  async calculateRsi(data: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('rsi', rsiShader, [data], [windowSize, data.length], data.length);
  }
  
  async calculateStdDev(data: Float32Array, windowSize: number): Promise<Float32Array> {
      // StdDev shader calculates raw standard deviation (mult=1.0 hardcoded in shader).
      // BB multiplier is applied in TS after this call.
      return this.compute('stddev', stddevShader, [data], [windowSize, data.length], data.length);
  }
  
  async calculateCci(high: Float32Array, low: Float32Array, close: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('cci', cciShader, [high, low, close], [windowSize, high.length], high.length); 
  }

  async calculateAtr(high: Float32Array, low: Float32Array, close: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('atr', atrShader, [high, low, close], [windowSize, high.length], high.length); 
  }

  async calculateAdx(high: Float32Array, low: Float32Array, close: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('adx', adxShader, [high, low, close], [windowSize, high.length], high.length); 
  }
  
  async calculateMfi(high: Float32Array, low: Float32Array, close: Float32Array, volume: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('mfi', mfiShader, [high, low, close, volume], [windowSize, high.length], high.length); 
  }
  
  async calculateVwap(high: Float32Array, low: Float32Array, close: Float32Array, volume: Float32Array, isNewSession: Uint32Array): Promise<Float32Array> {
      // isNewSession is Uint32Array, passed as input
      // compute handles Float32/Uint32 inputs if we updated it (yes, we did)
      return this.compute('vwap', vwapShader, [high, low, close, volume, isNewSession], [high.length], high.length); 
  }
  
  // Specialized method for SuperTrend with 2 outputs and Mixed Params
  async calculateStochRaw(high: Float32Array, low: Float32Array, close: Float32Array, kLen: number): Promise<Float32Array> {
      // Params: k_len, k_smooth (unused in raw), d_len (unused), data_len
      return this.compute('stochRaw', stochRawShader, [high, low, close], [kLen, 0, 0, high.length], high.length); 
  }

  async calculateSuperTrend(
      high: Float32Array, 
      low: Float32Array, 
      close: Float32Array, 
      atr: Float32Array, 
      factor: number,
      len: number
  ): Promise<{ supertrend: Float32Array, trend: Float32Array }> {
      await this.init();
      if (!this.device) throw new Error('WebGPU not init');
      
      const inputs = [high, low, close, atr];
      const outputSize = len;
      // Params: factor (f32), data_len (u32)
      // Create mixed buffer
      const paramsBuf = new ArrayBuffer(8); // 4 + 4
      const viewF32 = new Float32Array(paramsBuf);
      const viewU32 = new Uint32Array(paramsBuf);
      viewF32[0] = factor;
      viewU32[1] = len; 
      
      const buffers: GPUBuffer[] = [];
      const entries: GPUBindGroupEntry[] = [];
      
      // Inputs
      for(let i=0; i<inputs.length; i++) {
        const buf = this.device.createBuffer({
            size: inputs[i].byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(buf.getMappedRange()).set(inputs[i]);
        buf.unmap();
        buffers.push(buf);
        entries.push({ binding: i, resource: { buffer: buf } });
      }
      
      // Output 1: SuperTrend
      const outST = this.device.createBuffer({ size: outputSize * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      buffers.push(outST);
      entries.push({ binding: 4, resource: { buffer: outST } });
      
      // Output 2: Trend
      const outTrend = this.device.createBuffer({ size: outputSize * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      buffers.push(outTrend);
      entries.push({ binding: 5, resource: { buffer: outTrend } });
      
      // Params
      const pBuf = this.device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(pBuf, 0, paramsBuf);
      buffers.push(pBuf);
      entries.push({ binding: 6, resource: { buffer: pBuf } });
      
      // Pipeline
      let pipeline = this.pipelines.get('supertrend');
      if (!pipeline) {
          const mod = this.device.createShaderModule({ code: superTrendShader });
          pipeline = this.device.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
          this.pipelines.set('supertrend', pipeline);
      }
      
      const bg = this.device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: entries
      });
      
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(1); // Serial
      pass.end();
      
      // Readback
      const stagST = this.device.createBuffer({ size: outputSize * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const stagTrend = this.device.createBuffer({ size: outputSize * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      
      encoder.copyBufferToBuffer(outST, 0, stagST, 0, outputSize * 4);
      encoder.copyBufferToBuffer(outTrend, 0, stagTrend, 0, outputSize * 4);
      
      this.device.queue.submit([encoder.finish()]);
      
      await Promise.all([
          stagST.mapAsync(GPUMapMode.READ),
          stagTrend.mapAsync(GPUMapMode.READ)
      ]);
      
      const stRes = new Float32Array(stagST.getMappedRange().slice(0));
      const trendRes = new Float32Array(stagTrend.getMappedRange().slice(0));
      
      stagST.unmap();
      stagTrend.unmap();
      
      // Cleanup
      for(const b of buffers) b.destroy();
      stagST.destroy();
      stagTrend.destroy();
      
      return { supertrend: stRes, trend: trendRes };
  }

  // --- New Methods ---

  async calculateChoppiness(highs: Float32Array, lows: Float32Array, closes: Float32Array, length: number): Promise<Float32Array> {
    const count = closes.length;
    // Params: length (u32), count (u32)
    const params = new Uint32Array([length, count]);
    return this.compute('choppiness', chopShader, [highs, lows, closes], params.buffer, count);
  }

  async calculateWilliamsR(highs: Float32Array, lows: Float32Array, closes: Float32Array, length: number): Promise<Float32Array> {
     const count = closes.length;
     const params = new Uint32Array([length, count]);
     return this.compute('williamsR', wrShader, [highs, lows, closes], params.buffer, count);
  }
  
  async calculateMomentum(closes: Float32Array, length: number): Promise<Float32Array> {
     const count = closes.length;
     const params = new Uint32Array([length, count]);
     return this.compute('momentum', momShader, [closes], params.buffer, count);
  }
}

export const webGpuCalculator = new WebGpuCalculator();
