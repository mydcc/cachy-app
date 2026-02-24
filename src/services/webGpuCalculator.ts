/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
   * Supports multiple outputs and flexible parameter types (float/int/mixed).
   */
  async compute(
      shaderName: string,
      shaderCode: string,
      inputs: (Float32Array | Uint32Array)[],
      params: number[] | ArrayBuffer | Float32Array | Uint32Array,
      outputSizeOrSizes: number | number[]
  ): Promise<Float32Array | Float32Array[]> {
      await this.init();
      if (!this.device) throw new Error('WebGPU device not initialized');

      const outputSizes = Array.isArray(outputSizeOrSizes) ? outputSizeOrSizes : [outputSizeOrSizes];

      // 1. Create/Reuse Input Buffers
      const ownedBuffers: GPUBuffer[] = []; // Buffers we create here (outputs, params, staging)
      const bindGroupEntries: GPUBindGroupEntry[] = [];

      // Inputs: Bindings 0..N-1
      for (let i = 0; i < inputs.length; i++) {
          const buffer = this.getOrCreateInputBuffer(inputs[i]);
          bindGroupEntries.push({ binding: i, resource: { buffer } });
      }

      // Outputs: Bindings N..N+M-1
      const outputBuffers: GPUBuffer[] = [];
      for (let i = 0; i < outputSizes.length; i++) {
          const size = outputSizes[i] * 4;
          const buffer = this.device.createBuffer({
              size: size,
              usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
          });
          outputBuffers.push(buffer);
          ownedBuffers.push(buffer);
          bindGroupEntries.push({ binding: inputs.length + i, resource: { buffer } });
      }

      // Params Buffer (Uniform): Binding N+M
      const paramBinding = inputs.length + outputSizes.length;
      let paramsBuffer: GPUBuffer | null = null;

      if (params) {
          let bufferSize = 0;
          if (params instanceof ArrayBuffer || params instanceof Float32Array || params instanceof Uint32Array) {
              bufferSize = params.byteLength;
          } else {
              bufferSize = (params as number[]).length * 4;
          }
          bufferSize = Math.max(16, bufferSize); // Minimum uniform buffer size
          
          paramsBuffer = this.device.createBuffer({
              size: bufferSize, 
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
          
          if (params instanceof ArrayBuffer) {
              this.device.queue.writeBuffer(paramsBuffer, 0, params as any);
          } else if (params instanceof Float32Array) {
              this.device.queue.writeBuffer(paramsBuffer, 0, params as any);
          } else if (params instanceof Uint32Array) {
               this.device.queue.writeBuffer(paramsBuffer, 0, params as any);
          } else {
              // Default to Uint32Array for number[] for backward compatibility
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
      
      // Dispatch based on first output size
      const workgroupCount = Math.ceil(outputSizes[0] / 64);
      passEncoder.dispatchWorkgroups(workgroupCount);
      passEncoder.end();

      // Read back
      const stagingBuffers: GPUBuffer[] = [];
      const results: Float32Array[] = [];

      for (let i = 0; i < outputBuffers.length; i++) {
          const size = outputSizes[i] * 4;
          const staging = this.device.createBuffer({
              size: size,
              usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
          });
          stagingBuffers.push(staging);
          ownedBuffers.push(staging);
          commandEncoder.copyBufferToBuffer(outputBuffers[i], 0, staging, 0, size);
      }

      this.device.queue.submit([commandEncoder.finish()]);

      await Promise.all(stagingBuffers.map(buf => buf.mapAsync(GPUMapMode.READ)));

      for (const staging of stagingBuffers) {
          results.push(new Float32Array(staging.getMappedRange().slice(0)));
          staging.unmap();
      }
      
      // Cleanup owned buffers
      for (const buf of ownedBuffers) buf.destroy();

      return Array.isArray(outputSizeOrSizes) ? results : results[0];
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
            if (settings.sma.sma1.length > 0) {
                const val = await this.calculateSma(closes32, settings.sma.sma1.length);
                this.injectResult(result, `SMA${settings.sma.sma1.length}`, val as Float32Array, closes, 'movingAverages');
            }
             if (settings.sma.sma2.length > 0) {
                const val = await this.calculateSma(closes32, settings.sma.sma2.length);
                this.injectResult(result, `SMA${settings.sma.sma2.length}`, val as Float32Array, closes, 'movingAverages');
            }
             if (settings.sma.sma3.length > 0) {
                const val = await this.calculateSma(closes32, settings.sma.sma3.length);
                this.injectResult(result, `SMA${settings.sma.sma3.length}`, val as Float32Array, closes, 'movingAverages');
            }

            // EMA
            if (enabledIndicators.ema !== false) {
                 if (settings.ema.ema1.length > 0) {
                    const val = await this.calculateEma(closes32, settings.ema.ema1.length);
                    this.injectResult(result, `EMA${settings.ema.ema1.length}`, val as Float32Array, closes, 'movingAverages');
                }
                 if (settings.ema.ema2.length > 0) {
                    const val = await this.calculateEma(closes32, settings.ema.ema2.length);
                    this.injectResult(result, `EMA${settings.ema.ema2.length}`, val as Float32Array, closes, 'movingAverages');
                }
                 if (settings.ema.ema3.length > 0) {
                    const val = await this.calculateEma(closes32, settings.ema.ema3.length);
                    this.injectResult(result, `EMA${settings.ema.ema3.length}`, val as Float32Array, closes, 'movingAverages');
                }
            }
            
            // WMA
            if (enabledIndicators.wma !== false && settings.wma.length > 0) {
                const val = await this.calculateWma(closes32, settings.wma.length);
                this.injectResult(result, `WMA${settings.wma.length}`, val as Float32Array, closes, 'movingAverages');
            }
            
            // VWMA
            if (enabledIndicators.vwma !== false && settings.vwma.length > 0) {
                 const val = await this.calculateVwma(closes32, volumes32, settings.vwma.length);
                 this.injectResult(result, `VWMA${settings.vwma.length}`, val as Float32Array, closes, 'movingAverages');
            }
            
            // HMA
            if (enabledIndicators.hma !== false && settings.hma.length > 0) {
                const length = settings.hma.length;
                const halfLength = Math.floor(length / 2);
                const sqrtLength = Math.round(Math.sqrt(length));
                
                const wmaHalf = await this.calculateWma(closes32, halfLength) as Float32Array;
                const wmaFull = await this.calculateWma(closes32, length) as Float32Array;
                
                const intermediate = new Float32Array(len);
                for(let i=0; i<len; i++) {
                    intermediate[i] = (2 * wmaHalf[i]) - wmaFull[i];
                }
                
                const hma = await this.calculateWma(intermediate, sqrtLength) as Float32Array;
                this.injectResult(result, `HMA${length}`, hma, closes, 'movingAverages');
            }
            
            // Volume MA
            if (enabledIndicators.volumeMa !== false && settings.volumeMa.length > 0) {
                let val: Float32Array | null = null;
                
                if (settings.volumeMa.maType === 'sma') {
                    val = await this.calculateSma(volumes32, settings.volumeMa.length) as Float32Array;
                } else if (settings.volumeMa.maType === 'ema') {
                    val = await this.calculateEma(volumes32, settings.volumeMa.length) as Float32Array;
                } else if (settings.volumeMa.maType === 'wma') {
                    val = await this.calculateWma(volumes32, settings.volumeMa.length) as Float32Array;
                }
                
                if (val) {
                    if (!result.advanced) result.advanced = {};
                    const lastIdx = val.length - 1;
                    result.advanced.volumeMa = val[lastIdx];
                }
            }
            
            // MACD
            if (enabledIndicators.macd !== false) {
                 const fast = await this.calculateEma(closes32, settings.macd.fastLength) as Float32Array;
                 const slow = await this.calculateEma(closes32, settings.macd.slowLength) as Float32Array;
                 
                 const macdLine = new Float32Array(len);
                 for(let i=0; i<len; i++) macdLine[i] = fast[i] - slow[i];
                 
                 const signalLine = await this.calculateEma(macdLine, settings.macd.signalLength) as Float32Array;
                 
                 const histogram = new Float32Array(len);
                 for(let i=0; i<len; i++) histogram[i] = macdLine[i] - signalLine[i];
                 
                 this.injectResult(result, `MACD_Line`, macdLine, closes, 'oscillators');
                 this.injectResult(result, `MACD_Signal`, signalLine, closes, 'oscillators');
                 this.injectResult(result, `MACD_Hist`, histogram, closes, 'oscillators');
            }
            
            // RSI
            if (enabledIndicators.rsi !== false) {
                 const val = await this.calculateRsi(closes32, settings.rsi.length);
                 this.injectResult(result, `RSI${settings.rsi.length}`, val as Float32Array, closes, 'oscillators');
            }

            // Stoch
            if (enabledIndicators.stoch !== false) {
                 const k_raw = await this.calculateStochRaw(highs32, lows32, closes32, settings.stochastic.kPeriod);
                 const k_smooth = await this.calculateSma(k_raw as Float32Array, settings.stochastic.kSmoothing) as Float32Array;
                 const d_line = await this.calculateSma(k_smooth, settings.stochastic.dPeriod) as Float32Array;
                 this.injectResult(result, `StochK`, k_smooth, closes, 'oscillators');
                 this.injectResult(result, `StochD`, d_line, closes, 'oscillators');
            }
            
            // CCI
            if (enabledIndicators.cci !== false) {
                 const val = await this.calculateCci(highs32, lows32, closes32, settings.cci.length);
                 this.injectResult(result, `CCI`, val as Float32Array, closes, 'oscillators');
            }
            
            // ADX
            if (enabledIndicators.adx !== false) {
                const val = await this.calculateAdx(highs32, lows32, closes32, settings.adx.adxSmoothing);
                 this.injectResult(result, `ADX`, val as Float32Array, closes, 'oscillators');
            }
            
            // MFI
            if (enabledIndicators.mfi !== false) {
                const val = await this.calculateMfi(highs32, lows32, closes32, volumes32, settings.mfi.length) as Float32Array;
                if (!result.advanced) result.advanced = {};
                const lastVal = val[val.length-1];
                let action = "Neutral";
                if (lastVal > 80) action = "Sell";
                else if (lastVal < 20) action = "Buy";
                
                result.advanced.mfi = { value: lastVal, action };
            }

            // Williams %R
            if (enabledIndicators.williamsR !== false && settings.williamsR.length > 0) {
                const wr = await this.calculateWilliamsR(highs32, lows32, closes32, settings.williamsR.length);
                this.injectResult(result, 'Williams %R', wr as Float32Array, closes, 'oscillators');
            }
            
            // Momentum
            if (enabledIndicators.momentum !== false && settings.momentum.length > 0) {
                const mom = await this.calculateMomentum(closes32, settings.momentum.length);
                this.injectResult(result, 'Momentum', mom as Float32Array, closes, 'oscillators');
            }
            
            // ATR
            if (enabledIndicators.atr !== false) {
                 const val = await this.calculateAtr(highs32, lows32, closes32, settings.atr.length) as Float32Array;
                 if (!result.volatility) result.volatility = { atr: 0, bb: { upper:0, middle:0, lower:0, percentP:0 } };
                 result.volatility.atr = val[val.length - 1];
            }
            
            // Bollinger Bands
            if (enabledIndicators.bollingerBands !== false) {
                const middle = await this.calculateSma(closes32, settings.bollingerBands.length) as Float32Array;
                const stddev = await this.calculateStdDev(closes32, settings.bollingerBands.length) as Float32Array;
                
                const upper = new Float32Array(len);
                const lower = new Float32Array(len);
                const mult = settings.bollingerBands.stdDev;
                
                for(let i=0; i<len; i++) {
                    upper[i] = middle[i] + (stddev[i] * mult);
                    lower[i] = middle[i] - (stddev[i] * mult);
                }
                
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
                const atr = await this.calculateAtr(highs32, lows32, closes32, settings.superTrend.period) as Float32Array;
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
                this.injectResult(result, 'CHOP', chop as Float32Array, closes, 'volatility');
            }
            
            // VWAP
            if (enabledIndicators.vwap !== false) {
                const isNewSession = new Uint32Array(len);
                isNewSession[0] = 1;
                for(let i=1; i<len; i++) {
                     const current = new Date(times[i]);
                     const prev = new Date(times[i-1]);
                     if (current.getUTCDate() !== prev.getUTCDate()) {
                         isNewSession[i] = 1;
                     }
                }
                const val = await this.calculateVwap(highs32, lows32, closes32, volumes32, isNewSession) as Float32Array;
                if (!result.advanced) result.advanced = {};
                result.advanced.vwap = val[len-1];
            }

        } catch (e) {
            console.error('[WebGPU] Calc failed, falling back to CPU', e);
        } finally {
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
          (result as any)[category][name] = val;
      }
  }

  // --- Helper Methods ---

  async calculateSma(data: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('sma', smaShader, [data], [windowSize, data.length], data.length) as Promise<Float32Array>;
  }

  async calculateWma(data: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('wma', wmaShader, [data], [windowSize, data.length], data.length) as Promise<Float32Array>;
  }

  async calculateEma(data: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('ema', emaShader, [data], [windowSize, data.length], data.length) as Promise<Float32Array>;
  }
  
  async calculateVwma(data: Float32Array, volume: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('vwma', vwmaShader, [data, volume], [windowSize, data.length], data.length) as Promise<Float32Array>;
  }
  
  async calculateRsi(data: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('rsi', rsiShader, [data], [windowSize, data.length], data.length) as Promise<Float32Array>;
  }
  
  async calculateStdDev(data: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('stddev', stddevShader, [data], [windowSize, data.length], data.length) as Promise<Float32Array>;
  }
  
  async calculateCci(high: Float32Array, low: Float32Array, close: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('cci', cciShader, [high, low, close], [windowSize, high.length], high.length) as Promise<Float32Array>;
  }

  async calculateAtr(high: Float32Array, low: Float32Array, close: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('atr', atrShader, [high, low, close], [windowSize, high.length], high.length) as Promise<Float32Array>;
  }

  async calculateAdx(high: Float32Array, low: Float32Array, close: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('adx', adxShader, [high, low, close], [windowSize, high.length], high.length) as Promise<Float32Array>;
  }
  
  async calculateMfi(high: Float32Array, low: Float32Array, close: Float32Array, volume: Float32Array, windowSize: number): Promise<Float32Array> {
      return this.compute('mfi', mfiShader, [high, low, close, volume], [windowSize, high.length], high.length) as Promise<Float32Array>;
  }
  
  async calculateVwap(high: Float32Array, low: Float32Array, close: Float32Array, volume: Float32Array, isNewSession: Uint32Array): Promise<Float32Array> {
      return this.compute('vwap', vwapShader, [high, low, close, volume, isNewSession], [high.length], high.length) as Promise<Float32Array>;
  }
  
  async calculateStochRaw(high: Float32Array, low: Float32Array, close: Float32Array, kLen: number): Promise<Float32Array> {
      // Params: k_len, k_smooth (unused in raw), d_len (unused), data_len
      return this.compute('stochRaw', stochRawShader, [high, low, close], [kLen, 0, 0, high.length], high.length) as Promise<Float32Array>;
  }

  async calculateSuperTrend(
      high: Float32Array, 
      low: Float32Array, 
      close: Float32Array, 
      atr: Float32Array, 
      factor: number,
      len: number
  ): Promise<{ supertrend: Float32Array, trend: Float32Array }> {
      // Params: factor (f32), data_len (u32)
      // Create mixed buffer
      const paramsBuf = new ArrayBuffer(8); // 4 + 4
      const viewF32 = new Float32Array(paramsBuf);
      const viewU32 = new Uint32Array(paramsBuf);
      viewF32[0] = factor;
      viewU32[1] = len; 
      
      // Use generic compute with multiple outputs
      const results = await this.compute(
          'supertrend',
          superTrendShader,
          [high, low, close, atr],
          paramsBuf,
          [len, len] // Two outputs: supertrend, trend
      ) as Float32Array[];
      
      return { supertrend: results[0], trend: results[1] };
  }

  // --- New Methods ---

  async calculateChoppiness(highs: Float32Array, lows: Float32Array, closes: Float32Array, length: number): Promise<Float32Array> {
    const count = closes.length;
    const params = new Uint32Array([length, count]);
    return this.compute('choppiness', chopShader, [highs, lows, closes], params.buffer, count) as Promise<Float32Array>;
  }

  async calculateWilliamsR(highs: Float32Array, lows: Float32Array, closes: Float32Array, length: number): Promise<Float32Array> {
     const count = closes.length;
     const params = new Uint32Array([length, count]);
     return this.compute('williamsR', wrShader, [highs, lows, closes], params.buffer, count) as Promise<Float32Array>;
  }
  
  async calculateMomentum(closes: Float32Array, length: number): Promise<Float32Array> {
     const count = closes.length;
     const params = new Uint32Array([length, count]);
     return this.compute('momentum', momShader, [closes], params.buffer, count) as Promise<Float32Array>;
  }
}

export const webGpuCalculator = new WebGpuCalculator();
