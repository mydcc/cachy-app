<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { settingsState } from "../../../stores/settings.svelte";
  import { bitunixWs } from "../../../services/bitunixWs";
  import { uiState } from "../../../stores/ui.svelte";
  import { PerformanceMonitor } from "../../../utils/performanceMonitor";
  import { _ } from "../../../locales/i18n";

  // ========================================
  // LIFECYCLE STATE MANAGEMENT
  // ========================================
  
  const LifecycleState = {
    IDLE: 'IDLE',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    ERROR: 'ERROR',
    DISPOSED: 'DISPOSED'
  } as const;

  type LifecycleStateType = typeof LifecycleState[keyof typeof LifecycleState];

  let lifecycleState = $state<LifecycleStateType>(LifecycleState.IDLE);
  
  // ========================================
  // THEME & COLOR RESOLUTION
  // ========================================

  const resolveColor = (varName: string, fallback: string = "#000000"): string => {
    if (!browser) return fallback;
    const style = getComputedStyle(document.documentElement);
    const initialValue = varName.startsWith("--") ? style.getPropertyValue(varName) : varName;
    const trimmed = initialValue.trim();
    if (trimmed.startsWith("var(")) {
      const match = trimmed.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
      if (match) return style.getPropertyValue(match[1]).trim() || match[2] || fallback;
    }
    return trimmed || fallback;
  };

  function updateColors() {
    if (!worker || lifecycleState !== LifecycleState.READY) return;

    const colorUp = resolveColor("--color-up") || "#00ff88";
    const colorDown = resolveColor("--color-down") || "#ff4444";
    const bg = resolveColor("--color-bg-primary") || "#000000";

    worker.postMessage({
      type: 'updateColors',
      data: { colorUp, colorDown, background: bg }
    });
  }

  // ========================================
  // WORKER MANAGEMENT
  // ========================================

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let worker: Worker | null = null;
  let themeObserver: MutationObserver | null = null;
  
  let lastFlowMode = $state(settingsState.tradeFlowSettings.flowMode);

  function initWorker() {
    try {
      if (!canvas) return;
      lifecycleState = LifecycleState.INITIALIZING;
      
      worker = new TradeFlowWorker();
      
      // Check for OffscreenCanvas support
      if (!canvas.transferControlToOffscreen) {
        throw new Error("OffscreenCanvas not supported in this browser.");
      }

      const offscreen = canvas.transferControlToOffscreen();
      
      worker.postMessage({
        type: 'init',
        data: {
          canvas: offscreen,
          width: window.innerWidth,
          height: window.innerHeight,
          pixelRatio: Math.min(window.devicePixelRatio, 2),
          settings: JSON.parse(JSON.stringify(settingsState.tradeFlowSettings))
        }
      }, [offscreen]);

      lifecycleState = LifecycleState.READY;
      updateColors();
    } catch (e) {
      console.error("[TradeFlow] Worker Init Error:", e);
      lifecycleState = LifecycleState.ERROR;
    }
  }

  // ========================================
  // DATA FORWARDING
  // ========================================

  function onTrade(trade: any) {
    if (lifecycleState !== LifecycleState.READY || !worker || !trade) return;
    
    // Bitunix Trade Format: { p: "price", v: "vol", s: "side", t: ts }
    const side = trade.s || trade.side;
    const pStr = trade.p || trade.price;
    const vStr = trade.v || trade.size || trade.amount;
    
    if (!side || pStr === undefined || vStr === undefined) return;

    const price = parseFloat(pStr);
    const amount = parseFloat(vStr);
    
    if (isNaN(price) || isNaN(amount)) return;
    if (amount < settingsState.tradeFlowSettings.minVolume) return;

      log(LogLevel.INFO, '✅ Three.js initialization complete');
      return { success: true };
    } catch (error) {
      log(LogLevel.ERROR, '❌ Initialization failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : $_('errors.unknown')
      };
    }
    
    const buys = tradeHistory.filter(s => s === 'buy' || s === 'BUY').length;
    targetSentiment = (buys / tradeHistory.length) * 2 - 1;

    worker.postMessage({
      type: 'onTrade',
      data: {
        trade: {
          type: (side === 'buy' || side === 'BUY') ? 'buy' : 'sell',
          price,
          amount
        },
        sentiment: targetSentiment
      }
    });
  }

  // Atmosphere state
  let tradeHistory: string[] = [];
  const tradeHistorySize = 100;
  let targetSentiment = 0;

  // ========================================
  // SVELTE EFFECTS & LIFECYCLE
  // ========================================

  $effect(() => {
    if (worker && settingsState.tradeFlowSettings.flowMode !== lastFlowMode) {
      lastFlowMode = settingsState.tradeFlowSettings.flowMode;
      worker.postMessage({
        type: 'switchMode',
        data: { mode: lastFlowMode }
      });
    }
  });

  $effect(() => {
    if (lifecycleState === LifecycleState.READY && worker) {
      worker.postMessage({
        type: 'updateSettings',
        data: { settings: JSON.parse(JSON.stringify(settingsState.tradeFlowSettings)) }
      });
    }
  });

  // Dynamic Subscription
  $effect(() => {
    if (!browser || lifecycleState !== LifecycleState.READY) return;
    
    const currentSymbol = tradeState.symbol || "BTCUSDT";
    bitunixWs.subscribeTrade(currentSymbol, onTrade);
    
    return () => {
      bitunixWs.unsubscribeTrade(currentSymbol, onTrade);
    };
  });

  onMount(() => {
    if (!browser) return;

    initWorker();

    window.addEventListener('resize', handleResize);
    
    themeObserver = new MutationObserver(() => updateColors());
    themeObserver.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ["class", "data-mode", "style"] 
    });

    return () => {
      cleanup();
    };
  });

  function handleResize() {
    if (!worker) return;
    worker.postMessage({
      type: 'resize',
      data: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });
  }

  function cleanup() {
    window.removeEventListener('resize', handleResize);
    if (themeObserver) themeObserver.disconnect();
    if (worker) {
      worker.terminate();
      worker = null;
    }
    lifecycleState = LifecycleState.DISPOSED;
  }
</script>

<div 
  bind:this={container}
  class="trade-flow-container"
>
  <canvas bind:this={canvas}></canvas>
  
  {#if lifecycleState === LifecycleState.INITIALIZING}
    <div class="status-overlay initializing">Warming Neural Core...</div>
  {:else if lifecycleState === LifecycleState.ERROR}
    <div class="status-overlay error">Visual Effects Disabled</div>
  {:else if lifecycleState === LifecycleState.READY}
    <!-- Optional Debug Info or Active State Indicator -->
  {/if}
</div>

<style>
  .trade-flow-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: -1;
    pointer-events: none;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  onMount(() => {
    if (!browser || !container) return;
    
    log(LogLevel.INFO, '🎬 Component mounted, starting initialization...');
    lifecycleState = LifecycleState.INITIALIZING;
    
    const result = initThree();
    performanceMonitor = new PerformanceMonitor("TradeFlowWave");
    performanceMonitor.start(renderer || undefined);
    
    if (!result.success) {
      lifecycleState = LifecycleState.ERROR;
      lifecycleError = result.error || $_('errors.unknown');
      log(LogLevel.ERROR, '❌ Initialization failed:', lifecycleError);
    } else {
      lifecycleState = LifecycleState.READY;
      isVisible = !document.hidden;
      
      // Auto-start animation
      startAnimationLoop();
      
      // Listen for visibility changes
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Resize Observer
      const resizeObserver = new ResizeObserver(() => onResize());
      resizeObserver.observe(container);
      
      // Market Data
      if (tradeState.symbol) {
         updateSubscription(tradeState.symbol);
      }
      
       // React to settings changes safely
       $effect(() => {
           // Watch critical settings affecting geometry
           const mode = settingsState.tradeFlowSettings.flowMode;
           const width = settingsState.tradeFlowSettings.gridWidth;
           const length = settingsState.tradeFlowSettings.gridLength;
           const theme = uiState.currentTheme; // Trigger on theme change

           // If Mode or Grid Dimensions or Theme Changed -> Re-Init
           if (scene && lifecycleState === LifecycleState.READY) {
               const modeChanged = lastFlowMode !== mode;
               // Simple check if we need to rebuild
               // We rebuid if mode or dimensions change, or if theme changes (to update colors)
               
               if (modeChanged) {
                   log(LogLevel.INFO, '🔄 Flow Mode changed:', mode);
                   lastFlowMode = mode;
                   updateThemeColors(); // Update colors first
                   initSceneObjects();
               } else {
                   // Check dimensions or theme
                   // We just force update if anything else in dependency changed that requires rebuild
                   updateThemeColors();
                   initSceneObjects();
               }
               
               updateCameraPosition();
           } else if (lifecycleState === LifecycleState.READY) {
               // Just Camera Updates for other settings
               updateCameraPosition();
           }
       });
       
       $effect(() => {
           if (tradeState.symbol) {
               updateSubscription(tradeState.symbol);
           }
       });
       
       // Initial Theme Colors
       updateThemeColors();
    }
  });
  
  function updateThemeColors() {
      if (!browser) return;
      const style = getComputedStyle(document.body);
      
      const up = style.getPropertyValue('--color-up').trim();
      const down = style.getPropertyValue('--color-down').trim();
      const warning = style.getPropertyValue('--color-warning').trim();
      
      if (up) colorUp.setStyle(up);
      if (down) colorDown.setStyle(down);
      if (warning) colorWarning.setStyle(warning);
      
      // Update Uniforms if materials exist
      materials.forEach(mat => {
          if (mat.uniforms.uColorUp) mat.uniforms.uColorUp.value.copy(colorUp);
      });
  }

  .initializing { color: var(--color-up, #00ff88); }
  .error { color: var(--color-down, #ff4444); }
</style>
