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
  import { activeExchange } from "../../../services/exchange";
  import { marketState } from "../../../stores/market.svelte";
  import { activeTechnicalsManager } from "../../../services/activeTechnicalsManager.svelte";
  import { readIndicatorSignal } from "./indicatorSignal";
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

  /** Hex or rgb() to an RGB triple. Used only to tell a light theme from a dark one. */
  function parseColorToRgb(colorStr: string): [number, number, number] | null {
    const trimmed = colorStr.trim();
    if (trimmed.startsWith("#")) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16),
        ];
      } else if (hex.length >= 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
      }
    }
    const match = trimmed.match(/\d+/g);
    if (match && match.length >= 3) {
      return [parseInt(match[0], 10), parseInt(match[1], 10), parseInt(match[2], 10)];
    }
    return null;
  }

  /**
   * The galaxy mode's star palette, read from the same `--galaxy-*` theme
   * variables the standalone Galaxy 3D background uses. Additive blending turns
   * to normal on a light theme, otherwise the stars wash the page out — the
   * standalone background makes the same switch.
   */
  function resolveGalaxyPalette() {
    const bgStr = resolveColor("--galaxy-bg") || "#0a0e27";
    const rgb = parseColorToRgb(bgStr);
    let light = false;
    if (rgb) {
      const [r, g, b] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
      light = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 > 0.5;
    }
    return {
      inside: resolveColor("--galaxy-stars-core") || "#6366f1",
      out1: resolveColor("--galaxy-stars-edge") || "#8b5cf6",
      out2: resolveColor("--galaxy-stars-edge-2") || "#8b5cf6",
      out3: resolveColor("--galaxy-stars-edge-3") || "#6366f1",
      // THREE.NormalBlending = 1, THREE.AdditiveBlending = 2.
      blending: light ? 1 : 2,
      cutoff: light ? 0.6 : 0.2,
    };
  }

  function updateColors() {
    if (!worker || lifecycleState !== LifecycleState.READY) return;

    // `colorMode: "custom"` picks the user's own buy/sell colours over the
    // theme's. Every mode reads these two through the worker, so the switch
    // applies to all of them, galaxy included.
    const s = settingsState.tradeFlowSettings;
    const custom = s.colorMode === "custom";
    const colorUp = (custom ? s.customColorUp : resolveColor("--color-up")) || "#00ff88";
    const colorDown = (custom ? s.customColorDown : resolveColor("--color-down")) || "#ff4444";
    const bg = resolveColor("--color-bg-primary") || "#000000";

    worker.postMessage({
      type: 'updateColors',
      data: { colorUp, colorDown, background: bg, galaxy: resolveGalaxyPalette() }
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

  // Recent real trades — used by the "ambient" / "replay" data-source modes to
  // keep the scene alive with a postable replay when the live feed goes quiet.
  let recentTrades: { type: 'buy' | 'sell'; price: number; amount: number }[] = [];
  const recentTradesMax = 60;
  let lastRealTradeAt = 0;

  // Raw trade payload from the WS feed (short Bitunix keys) or the debug
  // injection hook below (longer keys) — both fall back across the two.
  interface RawTradeEvent {
    s?: string;
    side?: string;
    type?: string;
    p?: string | number;
    price?: string | number;
    v?: string | number;
    size?: string | number;
    amount?: string | number;
  }

  function onTrade(trade: RawTradeEvent) {
    if (lifecycleState !== LifecycleState.READY || !worker || !trade) return;
    
    // Bitunix Trade Format: { p: "price", v: "vol", s: "side", t: ts }
    const side = trade.s || trade.side;
    const pStr = trade.p || trade.price;
    const vStr = trade.v || trade.size || trade.amount;
    
    if (!side || pStr === undefined || vStr === undefined) return;

    const price = parseFloat(String(pStr));
    const amount = parseFloat(String(vStr));
    
    if (isNaN(price) || isNaN(amount)) return;
    
    // Calculate actual trade volume in quote currency (usually USD)
    const tradeVolumeUSD = price * amount;
    
    if (tradeVolumeUSD < settingsState.tradeFlowSettings.minVolume) return;

    // Update History
    tradeHistory.push(side);
    if (tradeHistory.length > tradeHistorySize) {
      tradeHistory.shift();
    }
    
    const buys = tradeHistory.filter(s => s === 'buy' || s === 'BUY').length;
    targetSentiment = (buys / tradeHistory.length) * 2 - 1;

    const tradeType = (side === 'buy' || side === 'BUY') ? 'buy' : 'sell';
    recentTrades.push({ type: tradeType, price, amount });
    if (recentTrades.length > recentTradesMax) recentTrades.shift();
    lastRealTradeAt = Date.now();

    worker.postMessage({
      type: 'onTrade',
      data: {
        trade: {
          type: tradeType,
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


  // Structural settings — changes here require a full engine reinit
  let prevStructuralKey = '';
  $effect(() => {
    if (lifecycleState !== LifecycleState.READY || !worker) return;
    const s = settingsState.tradeFlowSettings;
    // Galaxy tunables ride along here rather than in the lightweight channel
    // below: that one only merges values into the worker's settings object and
    // never reaches the engine's uniforms, and two of the galaxy fields
    // (particleCount, randomness) are baked into buffers that must be rebuilt.
    const structuralKey = `${s.flowMode}_${s.gridWidth}_${s.gridLength}_${s.spread}_${s.size}_${JSON.stringify(s.galaxyFlow)}`;

    if (structuralKey !== prevStructuralKey) {
      prevStructuralKey = structuralKey;
      worker.postMessage({
        type: 'updateSettings',
        data: { settings: JSON.parse(JSON.stringify(s)) }
      });
      // A mode switch builds a fresh engine with no palette yet, so re-send the
      // colours; otherwise the galaxy renders with its uninitialised white stars
      // until the next theme change.
      updateColors();
    }
  });

  // ========================================
  // INDICATOR CHANNEL (ATR / RSI)
  // ========================================

  /**
   * True while at least one setting actually needs computed indicators.
   *
   * Both fields are read into locals before the comparison on purpose: written
   * as one `||` expression, a true left-hand side short-circuits the read of
   * `moodSource`, and an unread value is not a tracked dependency — so
   * switching the mood source would silently fail to re-run the callers below.
   */
  function needsIndicators(s: typeof settingsState.tradeFlowSettings): boolean {
    const volatility = s.volatilitySource;
    const mood = s.moodSource;
    return volatility === "atr" || mood === "rsi";
  }

  // Keep the technicals calculation alive for the symbol we visualise.
  // `register` is ref-counted, so when a chart is already open on the same
  // symbol and interval this costs nothing but a counter — and when it is not,
  // this is what makes the indicator exist at all. Only registered while a
  // setting actually consumes it, so the plain trade-driven background never
  // pays for a calculation it does not use.
  $effect(() => {
    if (!browser || lifecycleState !== LifecycleState.READY) return;
    const s = settingsState.tradeFlowSettings;
    if (!needsIndicators(s)) return;

    const symbol = tradeState.symbol || "BTCUSDT";
    const timeframe = s.indicatorTimeframe || "15m";
    activeTechnicalsManager.register(symbol, timeframe);
    return () => activeTechnicalsManager.unregister(symbol, timeframe);
  });

  // Forward the latest reading to the worker. Read-only on `marketState`: the
  // background must never write into shared market state, or every consumer of
  // it re-renders on a purely decorative update.
  $effect(() => {
    if (lifecycleState !== LifecycleState.READY || !worker) return;
    const s = settingsState.tradeFlowSettings;
    const symbol = tradeState.symbol || "BTCUSDT";
    const timeframe = s.indicatorTimeframe || "15m";

    if (!needsIndicators(s)) {
      worker.postMessage({ type: "indicator", data: { volatilityRel: null, rsi: null } });
      return;
    }

    const entry = marketState.data[symbol];
    const tech = entry?.technicals?.[timeframe];
    // Decimal -> number for visual maths only; see indicatorSignal.ts.
    const lastPrice = entry?.lastPrice ? Number(entry.lastPrice) : null;

    worker.postMessage({
      type: "indicator",
      data: readIndicatorSignal(tech, lastPrice)
    });
  });

  // Colour mode — the only settings that feed the colour channel rather than
  // the settings channel. Without this effect the custom colours would only
  // reach the worker on the next theme change or mode switch.
  $effect(() => {
    if (lifecycleState !== LifecycleState.READY || !worker) return;
    const s = settingsState.tradeFlowSettings;
    // Read all three so each is tracked as a dependency.
    void s.colorMode;
    void s.customColorUp;
    void s.customColorDown;
    updateColors();
  });

  // Lightweight settings — no engine reinit, just forward values
  $effect(() => {
    if (lifecycleState !== LifecycleState.READY || !worker) return;
    const s = settingsState.tradeFlowSettings;
    // Access these to track them as dependencies
    const _vol = s.volumeScale;
    const _persist = s.persistenceDuration;
    const _speed = s.speed;
    const _atmo = s.enableAtmosphere;
    const _rot = s.enableRotation;
    const _camH = s.cameraHeight;
    const _camD = s.cameraDistance;
    const _camPX = s.cameraPositionX;
    const _camRX = s.cameraRotationX;
    const _camRY = s.cameraRotationY;
    const _camRZ = s.cameraRotationZ;
    // Which signal drives amplitude and mood. Scalars the worker reads directly,
    // so they belong on the lightweight channel — without this the worker would
    // never learn the user switched source.
    const _volSrc = s.volatilitySource;
    const _moodSrc = s.moodSource;

    worker.postMessage({
      type: 'updateLightSettings',
      data: {
        volatilitySource: _volSrc,
        moodSource: _moodSrc,
        volumeScale: _vol,
        persistenceDuration: _persist,
        speed: _speed,
        enableAtmosphere: _atmo,
        enableRotation: _rot,
        cameraHeight: _camH,
        cameraDistance: _camD,
        cameraPositionX: _camPX,
        cameraRotationX: _camRX,
        cameraRotationY: _camRY,
        cameraRotationZ: _camRZ,
      }
    });
  });

  // Dynamic Subscription
  $effect(() => {
    if (!browser || lifecycleState !== LifecycleState.READY) return;
    
    const currentSymbol = tradeState.symbol || "BTCUSDT";
    // New symbol => the volume calibration window must forget the old
    // market's notionals before the first trade of this symbol arrives.
    worker?.postMessage({ type: 'resetVolume' });
    // Use the returned cleanup function for guaranteed unsubscription
    const cleanup = activeExchange().marketData.subscribeTrades(currentSymbol, onTrade);

    // Ambient / Replay modes keep the scene alive when the live feed goes
    // quiet: replay a recently seen trade (small price jitter) on a timer.
    const ticker = setInterval(() => {
      if (!worker) return;
      const source = settingsState.tradeFlowSettings.tradeFlowSource;
      if (source === 'live') return;
      const silent = Date.now() - lastRealTradeAt > 1500;
      if (source === 'ambient' && !silent) return;
      if (recentTrades.length === 0) return;
      const base = recentTrades[Math.floor(Math.random() * recentTrades.length)];
      const jitter = 1 + (Math.random() - 0.5) * 0.01; // ±0.5%
      worker.postMessage({
        type: 'onTrade',
        data: {
          trade: {
            type: base.type,
            price: base.price * jitter,
            amount: base.amount
          },
          sentiment: 0
        }
      });
    }, 500);
    
    return () => {
      clearInterval(ticker);
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
      (window as unknown as { __injectTrade?: (trade: RawTradeEvent) => void }).__injectTrade = (trade: RawTradeEvent) => {
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
