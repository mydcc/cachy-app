/*
 * Copyright (C) 2026 MYDCT
 *
 * Browser Capability Detection for Performance Optimization
 * Detects SIMD, WebAssembly, WebGPU support
 */

/**
 * Browser capabilities for performance optimization
 */
export interface BrowserCapabilities {
  // WebAssembly Support
  wasm: boolean;
  wasmSIMD: boolean;
  wasmThreads: boolean;
  
  // WebGPU Support
  gpu: boolean;
  gpuFeatures?: string[];
  
  // Cross-Origin Isolation (required for SharedArrayBuffer)
  crossOriginIsolated: boolean;
  sharedMemory: boolean; // Alias for crossOriginIsolated
  
  // System Info
  cpuCores: number;
  deviceMemory?: number; // GB
  isMobile: boolean;
  
  // Battery (mobile)
  battery?: {
    charging: boolean;
    level: number;
  };
}

/**
 * Detect SIMD support in WebAssembly
 * SIMD (Single Instruction Multiple Data) allows vectorized operations
 * for 2-4x speedup on array operations
 */
export async function detectWasmSIMD(): Promise<boolean> {
  if (typeof WebAssembly === 'undefined') {
    return false;
  }
  
  try {
    // SIMD feature test module
    // This is a minimal WASM module that uses v128 (SIMD) instructions
    const simdTestModule = new Uint8Array([
      0, 97, 115, 109, // WASM magic number
      1, 0, 0, 0,      // Version 1
      1, 5, 1, 96, 0, 1, 123, // Type section (function returns v128)
      3, 2, 1, 0,      // Function section
      10, 10, 1, 8, 0, // Code section
      65, 0,           // i32.const 0
      253, 15,         // v128.const (SIMD instruction)
      253, 98,         // i8x16.splat (SIMD instruction)
      11               // end
    ]);
    
    // Try to validate the SIMD module
    const hasSIMD = await WebAssembly.validate(simdTestModule);
    
    if (import.meta.env.DEV && hasSIMD) {
      console.log('[Capabilities] SIMD supported - array operations will be accelerated');
    }
    
    return hasSIMD;
  } catch (e) {
    return false;
  }
}

/**
 * Detect WebAssembly Threads support
 */
export async function detectWasmThreads(): Promise<boolean> {
  if (typeof WebAssembly === 'undefined') {
    return false;
  }
  
  // Threads require SharedArrayBuffer
  if (typeof SharedArrayBuffer === 'undefined') {
    return false;
  }
  
  // Additional check: try to compile a module with shared memory
  try {
    const threadsModule = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0,
      5, 4, 1,          // Memory section
      3, 1, 1           // Shared memory, min 1 page
    ]);
    
    return await WebAssembly.validate(threadsModule);
  } catch (e) {
    return false;
  }
}

/**
 * Detect WebGPU support
 */
export async function detectWebGPU(): Promise<{ available: boolean; features?: string[] }> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return { available: false };
  }
  
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) {
      return { available: false };
    }
    
    // Get supported features
    const features = Array.from(adapter.features as Set<string>);
    
    if (import.meta.env.DEV) {
      console.log('[Capabilities] WebGPU supported with features:', features);
    }
    
    return { available: true, features };
  } catch (e) {
    return { available: false };
  }
}

/**
 * Detect battery status (for mobile optimization)
 */
export async function detectBattery(): Promise<{ charging: boolean; level: number } | undefined> {
  if (typeof navigator === 'undefined' || !('getBattery' in navigator)) {
    return undefined;
  }
  
  try {
    const battery = await (navigator as any).getBattery();
    return {
      charging: battery.charging,
      level: battery.level
    };
  } catch (e) {
    return undefined;
  }
}

/**
 * Detect device memory (Chrome only)
 */
export function detectDeviceMemory(): number | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  
  // Chrome-specific API
  return (navigator as any).deviceMemory;
}

/**
 * Detect if running on mobile device
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  
  // Check user agent
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = ['android', 'iphone', 'ipad', 'ipod', 'mobile'];
  
  return mobileKeywords.some(keyword => userAgent.includes(keyword));
}

/**
 * Comprehensive capability detection
 */
export async function detectBrowserCapabilities(): Promise<BrowserCapabilities> {
  const [wasm, wasmSIMD, wasmThreads, gpu, battery] = await Promise.all([
    Promise.resolve(typeof WebAssembly !== 'undefined'),
    detectWasmSIMD(),
    detectWasmThreads(),
    detectWebGPU(),
    detectBattery()
  ]);
  
  const capabilities: BrowserCapabilities = {
    wasm,
    wasmSIMD,
    wasmThreads,
    gpu: gpu.available,
    gpuFeatures: gpu.features,
    crossOriginIsolated: typeof globalThis !== 'undefined' && !!globalThis.crossOriginIsolated,
    sharedMemory: typeof globalThis !== 'undefined' && !!globalThis.crossOriginIsolated, // Alias
    cpuCores: navigator.hardwareConcurrency || 2,
    deviceMemory: detectDeviceMemory(),
    isMobile: isMobileDevice(),
    battery
  };
  
  if (import.meta.env.DEV) {
    console.log('[Capabilities] Detection complete:', capabilities);
  }
  
  return capabilities;
}

/**
 * Singleton cache for capabilities (detect once per session)
 */
let capabilitiesCache: BrowserCapabilities | null = null;

export async function getCapabilities(): Promise<BrowserCapabilities> {
  if (capabilitiesCache) {
    return capabilitiesCache;
  }
  
  capabilitiesCache = await detectBrowserCapabilities();
  return capabilitiesCache;
}
