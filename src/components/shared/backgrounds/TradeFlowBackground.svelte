<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import * as THREE from "three";
  import { settingsState } from "../../../stores/settings.svelte";
  import { tradeState } from "../../../stores/trade.svelte";
  import { bitunixWs } from "../../../services/bitunixWs";

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

  const LogLevel = {
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
  } as const;

  type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

  const LOG_LEVEL = LogLevel.INFO; // Configurable log level

  function log(level: LogLevelType, message: string, ...args: any[]) {
    if (level <= LOG_LEVEL) {
      const prefix = '[TradeFlow]';
      switch (level) {
        case LogLevel.ERROR:
          console.error(prefix, message, ...args);
          break;
        case LogLevel.WARN:
          console.warn(prefix, message, ...args);
          break;
        case LogLevel.INFO:
          console.info(prefix, message, ...args);
          break;
        case LogLevel.DEBUG:
          console.log(prefix, message, ...args);
          break;
      }
    }
  }

  let lifecycleState = $state<LifecycleStateType>(LifecycleState.IDLE);
  let lifecycleError = $state<string | null>(null);

  // ========================================
  // RESOURCE MANAGEMENT
  // ========================================

  interface ThreeResources {
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    geometry: THREE.BufferGeometry | null;
    material: THREE.PointsMaterial | null;
    points: THREE.Points | null;
    raycaster: THREE.Raycaster | null;
  }

  let resources: ThreeResources = {
    scene: null,
    camera: null,
    renderer: null,
    geometry: null,
    material: null,
    points: null,
    raycaster: null
  };

  // ========================================
  // COMPONENT STATE
  // ========================================

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let rafId: number = 0;
  let mouse = new THREE.Vector2(-1, -1);

  // Particle Data Arrays
  let positions: Float32Array;
  let colors: Float32Array;
  let sizes: Float32Array;

  // Metadata for tooltips
  let metaData: Array<{ price: number; size: number; side: string }> = [];

  // Particle Ring Buffer
  let head = 0;

  // Running Average for Price Deviation
  let avgPrice = 0;
  let runningSum = 0;
  let runningCount = 0;

  // Tooltip State
  let hoveredPoint: { x: number; y: number; price: number; size: number; side: string } | null = $state(null);
  let hoveredIndex = -1;

  // FPS Tracking
  let lastFrameTime = 0;
  let fps = 0;
  let lastRaycastTime = 0;
  const RAYCAST_THROTTLE_MS = 16; // ~60fps max

  // Theme Colors
  let colorUp = new THREE.Color(0x00b894);
  let colorDown = new THREE.Color(0xd63031);

  // Settings Shortcuts
  const settings = $derived(settingsState.tradeFlowSettings);

  // ========================================
  // VALIDATION & INITIALIZATION
  // ========================================

  function checkWebGLSupport(): boolean {
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  function validateContainer(): { valid: boolean; error?: string } {
    if (!container) {
      return { valid: false, error: 'Container not bound' };
    }
    
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { valid: false, error: `Container has zero dimensions: ${rect.width}x${rect.height}` };
    }
    
    return { valid: true };
  }

  function setupParticleSystem() {
    if (!resources.scene) return;

    const particleCount = settings.particleCount;
    
    // Geometry (Pre-allocated)
    resources.geometry = new THREE.BufferGeometry();
    positions = new Float32Array(particleCount * 3);
    colors = new Float32Array(particleCount * 3);
    sizes = new Float32Array(particleCount);

    // Fill with invisible points initially (behind camera)
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 2] = -1000; // Far behind
    }

    resources.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    resources.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    resources.geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Material
    resources.material = new THREE.PointsMaterial({
      size: settings.size,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });

    resources.points = new THREE.Points(resources.geometry, resources.material);
    resources.scene.add(resources.points);

    // Initialize MetaData
    metaData = new Array(particleCount).fill(null).map(() => ({ price: 0, size: 0, side: "" }));
    
    log(LogLevel.DEBUG, '✅ Particle system setup complete');
  }

  function initThree(): { success: boolean; error?: string } {
    try {
      log(LogLevel.INFO, '🚀 Starting Three.js initialization...');

      // WebGL Check
      if (!checkWebGLSupport()) {
        return { success: false, error: 'WebGL not supported in this browser' };
      }
      log(LogLevel.DEBUG, '✅ WebGL support confirmed');

      // Container Validation
      const validation = validateContainer();
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      log(LogLevel.DEBUG, '✅ Container validation passed');

      // Scene Setup
      resources.scene = new THREE.Scene();
      resources.scene.fog = new THREE.FogExp2(0x000000, 0.02);

      // Camera Setup
      resources.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      resources.camera.position.z = 5;

      // Renderer Setup
      resources.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      resources.renderer.setPixelRatio(window.devicePixelRatio);
      resources.renderer.setSize(window.innerWidth, window.innerHeight);
      container.appendChild(resources.renderer.domElement);
      canvas = resources.renderer.domElement;

      // Log canvas visibility
      const canvasRect = canvas.getBoundingClientRect();
      log(LogLevel.INFO, '📐 Canvas created:', {
        dimensions: `${canvasRect.width}x${canvasRect.height}`,
        position: `${canvasRect.left}, ${canvasRect.top}`,
        zIndex: getComputedStyle(canvas).zIndex,
        visibility: getComputedStyle(canvas).visibility,
        display: getComputedStyle(canvas).display
      });

      // Raycaster
      resources.raycaster = new THREE.Raycaster();
      resources.raycaster.params.Points.threshold = 0.2;

      // Setup Particle System
      setupParticleSystem();
      setupAmbientParticles(); // Initialize background noise
      
      // Start Demo Mode after 3 seconds if no trades
      setTimeout(() => {
          if (!hasReceivedRealTrades) {
              startDemoMode();
          }
      }, 3000);

      log(LogLevel.INFO, '✅ Three.js initialization complete');
      return { success: true };
    } catch (error) {
      log(LogLevel.ERROR, '❌ Initialization failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // ========================================
  // LIFECYCLE HOOKS
  // ========================================

  onMount(() => {
    if (!browser || !container) return;
    
    log(LogLevel.INFO, '🎬 Component mounted, starting initialization...');
    lifecycleState = LifecycleState.INITIALIZING;
    
    const result = initThree();
    
    if (!result.success) {
      lifecycleState = LifecycleState.ERROR;
      lifecycleError = result.error || 'Unknown error';
      log(LogLevel.ERROR, '❌ Initialization failed:', lifecycleError);
      return;
    }
    
    updateThemeColors();
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);
    
    updateSubscription(tradeState.symbol);
    animate(0);
    
    lifecycleState = LifecycleState.READY;
    log(LogLevel.INFO, '✅ Component ready - State:', lifecycleState);
    
    return () => {
      log(LogLevel.INFO, '🧹 Component unmounting, cleanup triggered');
      cleanup();
    };
  });

  // Symbol change effect (only when READY)
  $effect(() => {
    if (lifecycleState === LifecycleState.READY) {
      log(LogLevel.INFO, '🔄 Symbol changed:', tradeState.symbol);
      updateSubscription(tradeState.symbol);
      // Reset state for new symbol
      hasReceivedRealTrades = false;
      startDemoMode(); // Restart demo mode until new trades arrive
    }
  });

  // Theme color effect (only when READY)
  $effect(() => {
    if (lifecycleState === LifecycleState.READY) {
      updateThemeColors();
    }
  });

  // ========================================
  // THEME & COLOR MANAGEMENT
  // ========================================

  function updateThemeColors() {
    if (typeof document === "undefined") return;
    const style = getComputedStyle(document.documentElement);
    const up = style.getPropertyValue("--color-up").trim() || "#00b894";
    const down = style.getPropertyValue("--color-down").trim() || "#d63031";
    colorUp.set(up);
    colorDown.set(down);
    log(LogLevel.DEBUG, '🎨 Theme colors updated:', { up, down });
  }

  function getTradeColors(side: string, price: number): THREE.Color {
    const mode = settings.colorMode;
    
    if (mode === "custom") {
      return side === "buy" 
        ? new THREE.Color(settings.customColorUp)
        : new THREE.Color(settings.customColorDown);
    }
    
    if (mode === "interactive") {
      const trend = price > avgPrice ? "up" : "down";
      return trend === "up" ? colorUp : colorDown;
    }
    
    return side === "buy" ? colorUp : colorDown;
  }

  // ========================================
  // TRADE SUBSCRIPTION & HANDLING
  // ========================================

  function updateSubscription(symbol: string) {
    if (!symbol) return;
    log(LogLevel.INFO, '📡 Subscribing to trades:', symbol);
    bitunixWs.subscribeTrade(symbol, onTrade);
  }

  let tradeCount = 0;
  
  function onTrade(trade: any) {
    // Flag real trade activity
    if (!hasReceivedRealTrades) {
        hasReceivedRealTrades = true;
        stopDemoMode();
    }
  
    const price = parseFloat(trade.p || trade.lastPrice || "0");
    const size = parseFloat(trade.v || trade.volume || "0");
    const side = trade.s === "buy" ? "buy" : "sell";

    if (!price) return;
    if (size < settings.minVolume) return;

    // Debug: Log first few trades
    if (tradeCount < 3) {
      log(LogLevel.DEBUG, '📊 Trade received:', { price, size, side });
      tradeCount++;
    }

    // Update Average
    runningSum += price;
    runningCount++;
    if (runningCount > 100) {
       avgPrice = runningSum / runningCount;
       runningSum = avgPrice * 10;
       runningCount = 10;
    } else {
       avgPrice = runningSum / runningCount;
    }

    if (runningCount === 1) avgPrice = price;

    addPoint(price, size, side);
  }

  // ========================================
  // PARTICLE MANAGEMENT
  // ========================================

  // ========================================
  // PARTICLE MANAGEMENT
  // ========================================

  function addPoint(price: number, size: number, side: string) {
    if (!resources.geometry) return;

    const idx = head;
    const baseIndex = idx * 3;

    // Layout-specific positioning
    if (settings.layout === "tunnel") {
      const deviation = avgPrice > 0 ? (price - avgPrice) / avgPrice * 1000 : (Math.random() - 0.5) * 2;
      const y = Math.max(Math.min(deviation, 3), -3);
      const x = (Math.random() - 0.5) * settings.spread;
      const z = -50;

      positions[baseIndex] = x;
      positions[baseIndex + 1] = y;
      positions[baseIndex + 2] = z;
    } else {
      const deviation = avgPrice > 0 ? (price - avgPrice) / avgPrice * 10 : (Math.random() - 0.5) * 2;
      const x = Math.max(Math.min(deviation, 5), -5);
      
      const gridPos = idx % (settings.gridWidth * settings.gridLength);
      const gridX = Math.floor(gridPos / settings.gridLength);
      const gridZ = gridPos % settings.gridLength;
      
      const z = (gridZ / settings.gridLength - 0.5) * 10;
      const xOffset = (gridX / settings.gridWidth - 0.5) * 10;
      const y = Math.log10(size + 1) * 0.5;

      positions[baseIndex] = x + xOffset;
      positions[baseIndex + 1] = y;
      positions[baseIndex + 2] = z;
    }

    // Color
    const color = getTradeColors(side, price);
    const intensity = Math.min(1.0, Math.log10(size + 1) * 0.5 + 0.5);

    colors[baseIndex] = color.r * intensity;
    colors[baseIndex + 1] = color.g * intensity;
    colors[baseIndex + 2] = color.b * intensity;

    metaData[idx] = { price, size, side };

    resources.geometry.attributes.position.needsUpdate = true;
    resources.geometry.attributes.color.needsUpdate = true;

    head = (head + 1) % settings.particleCount;
  }

  // ========================================
  // VISIBILITY STRATEGY (Ambient & Demo)
  // ========================================

  let demoModeInterval: number | null = null;
  let hasReceivedRealTrades = false;

  function setupAmbientParticles() {
    if (!resources.geometry) return;
    
    log(LogLevel.INFO, '✨ Generating ambient particles...');
    
    // Fill 10% of particles as ambient background noise
    const ambientCount = Math.floor(settings.particleCount * 0.1);
    
    for (let i = 0; i < ambientCount; i++) {
        const idx = i;
        const baseIndex = idx * 3;
        
        // Random spread position
        positions[baseIndex] = (Math.random() - 0.5) * 20; // x
        positions[baseIndex + 1] = (Math.random() - 0.5) * 10; // y
        positions[baseIndex + 2] = -Math.random() * 50; // z (depth)
        
        // Faint color
        const isUp = Math.random() > 0.5;
        const color = isUp ? colorUp : colorDown;
        const intensity = 0.3; // Low intensity for ambient
        
        colors[baseIndex] = color.r * intensity;
        colors[baseIndex + 1] = color.g * intensity;
        colors[baseIndex + 2] = color.b * intensity;
        
        // Dummy metadata
        metaData[idx] = { price: 0, size: 0, side: isUp ? "buy" : "sell" };
    }
    
    head = ambientCount; // Start ring buffer after ambient particles
    
    resources.geometry.attributes.position.needsUpdate = true;
    resources.geometry.attributes.color.needsUpdate = true;
  }

  function startDemoMode() {
      if (demoModeInterval || hasReceivedRealTrades) return;
      
      log(LogLevel.INFO, '🤖 Starting Demo Mode (waiting for real trades)...');
      
      demoModeInterval = window.setInterval(() => {
          if (hasReceivedRealTrades) {
              stopDemoMode();
              return;
          }
          
          // Generate fake trade
          const side = Math.random() > 0.5 ? "buy" : "sell";
          const basePrice = avgPrice > 0 ? avgPrice : 50000;
          const price = basePrice + (Math.random() - 0.5) * (basePrice * 0.001);
          const size = Math.random() * 2;
          
          addPoint(price, size, side);
          
      }, 100); // 10 trades per second
  }

  function stopDemoMode() {
      if (demoModeInterval) {
          clearInterval(demoModeInterval);
          demoModeInterval = null;
          log(LogLevel.INFO, '🤖 Demo Mode stopped (real trades active)');
      }
  }

  // ========================================
  // ANIMATION & RENDERING
  // ========================================

  function updateParticlePositions() {
    if (!resources.geometry) return;

    const speed = settings.speed * 0.5;
    const positionsArr = resources.geometry.attributes.position.array as Float32Array;
    let activePoints = 0;
    
    for (let i = 0; i < settings.particleCount; i++) {
      const zIdx = i * 3 + 2;
      if (positionsArr[zIdx] > -900) {
        positionsArr[zIdx] += speed;

        if (positionsArr[zIdx] > 10) {
          positionsArr[zIdx] = -1000;
        } else {
          activePoints++;
        }
      }
    }

    if (activePoints > 0) {
      resources.geometry.attributes.position.needsUpdate = true;
    }
  }

  function performRaycast() {
    if (!resources.raycaster || !resources.camera || !resources.points) return;
    
    resources.raycaster.setFromCamera(mouse, resources.camera);
    const intersects = resources.raycaster.intersectObject(resources.points);
    
    if (intersects.length > 0) {
      const index = intersects[0].index;
      if (index !== undefined && index !== hoveredIndex) {
        hoveredIndex = index;
        const p = intersects[0].point.clone();
        p.project(resources.camera);
        const x = (p.x * .5 + .5) * canvas.clientWidth;
        const y = (p.y * -.5 + .5) * canvas.clientHeight;

        hoveredPoint = { x, y, ...metaData[index] };
      }
    } else {
      hoveredIndex = -1;
      hoveredPoint = null;
    }
  }

  function animate(time: number) {
    rafId = requestAnimationFrame(animate);

    const delta = time - lastFrameTime;
    lastFrameTime = time;
    if (delta > 0) fps = 1000 / delta;

    if (!resources.scene || !resources.geometry || !resources.renderer || !resources.camera) {
      return;
    }

    updateParticlePositions();

    // Raycasting with throttling
    const now = performance.now();
    if (now - lastRaycastTime > RAYCAST_THROTTLE_MS && mouse.x !== -1) {
      performRaycast();
      lastRaycastTime = now;
    }

    resources.renderer.render(resources.scene, resources.camera);
  }

  // ========================================
  // EVENT HANDLERS
  // ========================================

  function onMouseMove(event: MouseEvent) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  function onResize() {
    if (!resources.camera || !resources.renderer) return;
    resources.camera.aspect = window.innerWidth / window.innerHeight;
    resources.camera.updateProjectionMatrix();
    resources.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ========================================
  // CLEANUP & DISPOSAL
  // ========================================

  function disposeGeometry() {
    if (resources.geometry) {
      resources.geometry.dispose();
      resources.geometry = null;
      log(LogLevel.DEBUG, '🗑️ Geometry disposed');
    }
  }

  function disposeMaterial() {
    if (resources.material) {
      resources.material.dispose();
      resources.material = null;
      log(LogLevel.DEBUG, '🗑️ Material disposed');
    }
  }

  function disposeRenderer() {
    if (resources.renderer) {
      resources.renderer.dispose();
      if (container && canvas) {
        container.removeChild(canvas);
      }
      resources.renderer = null;
      log(LogLevel.DEBUG, '🗑️ Renderer disposed');
    }
  }

  function disposeAll() {
    if (resources.points && resources.scene) {
      resources.scene.remove(resources.points);
    }
    
    disposeGeometry();
    disposeMaterial();
    disposeRenderer();
    
    resources.scene = null;
    resources.camera = null;
    resources.points = null;
    resources.raycaster = null;
  }

  function cleanup() {
    lifecycleState = LifecycleState.DISPOSED;
    
    // Stop animation
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    
    // Unsubscribe from trades
    if (tradeState.symbol) {
      bitunixWs.unsubscribeTrade(tradeState.symbol, onTrade);
    }
    
    // Stop Demo Mode
    stopDemoMode();
    
    // Remove event listeners
    window.removeEventListener('resize', onResize);
    window.removeEventListener('mousemove', onMouseMove);
    
    // Dispose all Three.js resources
    disposeAll();
    
    // Reset state
    hoveredPoint = null;
    hoveredIndex = -1;
    metaData = [];
    head = 0;
    hasReceivedRealTrades = false;
    
    log(LogLevel.INFO, '✅ Cleanup complete');
  }
</script>

<div class="tradeflow-container" bind:this={container}>
   <!-- Tooltip Overlay -->
   {#if hoveredPoint}
     <div class="tooltip" style="left: {hoveredPoint.x}px; top: {hoveredPoint.y}px">
        <div class="row">
             <span class="label">Price:</span>
             <span class="value">{hoveredPoint.price.toFixed(2)}</span>
        </div>
        <div class="row">
             <span class="label">Size:</span>
             <span class="value">{hoveredPoint.size.toFixed(4)}</span>
        </div>
        <div class="row">
             <span class="tag {hoveredPoint.side}">{hoveredPoint.side.toUpperCase()}</span>
        </div>
     </div>
   {/if}
</div>

<style>
  .tradeflow-container {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    z-index: 0;
    pointer-events: auto;
  }

  .tooltip {
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid var(--accent-color, #444);
      padding: 8px;
      border-radius: 4px;
      pointer-events: none;
      transform: translate(15px, -50%);
      color: white;
      font-size: 12px;
      font-family: var(--app-font-family, sans-serif);
      z-index: 100;
  }

  .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 2px;
  }

  .label {
      color: #888;
  }

  .tag {
      font-weight: bold;
      padding: 1px 4px;
      border-radius: 2px;
      font-size: 10px;
      width: 100%;
      text-align: center;
  }

  .tag.buy {
      background: rgba(0, 255, 0, 0.2);
      color: var(--color-up, #00b894);
  }

  .tag.sell {
      background: rgba(255, 0, 0, 0.2);
      color: var(--color-down, #d63031);
  }
</style>
