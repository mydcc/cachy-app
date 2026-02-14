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
  import { tradeState } from "../../../stores/trade.svelte";
  import { bitunixWs } from "../../../services/bitunixWs";
  import { uiState } from "../../../stores/ui.svelte";
  import { _ } from "../../../locales/i18n";
  import TradeFlowWorker from "./tradeFlow.worker?worker";

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

  // Atmosphere state
  let tradeHistory: string[] = [];
  const tradeHistorySize = 100;
  let targetSentiment = 0;

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

    // Update History
    tradeHistory.push(side);
    if (tradeHistory.length > tradeHistorySize) {
      tradeHistory.shift();
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



  // ========================================
  // SVELTE EFFECTS & LIFECYCLE
  // ========================================


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
    // Use the returned cleanup function for guaranteed unsubscription
    const cleanup = bitunixWs.subscribeTrade(currentSymbol, onTrade);
    
    return () => {
      cleanup();
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

    // Restore injection hook for debugging and testing
    if (typeof window !== 'undefined') {
      (window as any).__injectTrade = (trade: any) => {
        if (worker) {
          worker.postMessage({
            type: 'onTrade',
            data: {
              trade: {
                type: trade.side?.toLowerCase() || trade.type?.toLowerCase() || 'buy',
                price: trade.price || 90000,
                amount: trade.size || trade.amount || 1.0
              },
              sentiment: 0
            }
          });
        }
      };
    }

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
    <div class="status-overlay initializing">{$_("settings.visuals.tradeFlow.initializing")}</div>
  {:else if lifecycleState === LifecycleState.ERROR}
    <div class="status-overlay error">{$_("settings.visuals.tradeFlow.error")}</div>
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


  .initializing { color: var(--color-up, #00ff88); }
  .error { color: var(--color-down, #ff4444); }
</style>
