<script lang="ts">
  import * as THREE from "three";
  import { settingsState } from "../../../stores/settings.svelte";
  import { tradeState } from "../../../stores/trade.svelte";
  import { bitunixWs } from "../../../services/bitunixWs";
  import { browser } from "$app/environment";

  // Configuration
  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  // Three.js State
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let geometry: THREE.BufferGeometry;
  let points: THREE.Points;
  let raycaster: THREE.Raycaster;
  let rafId: number;

  // Data State
  const MAX_POINTS = 5000;
  let positions: Float32Array;
  let colors: Float32Array;
  let sizes: Float32Array;
  let metaData: { price: number; size: number; side: string }[] = []; // for raycasting

  let head = 0; // Ring buffer pointer
  let runningSum = 0;
  let runningCount = 0;
  let avgPrice = 0;

  // Interactive State
  let mouse = new THREE.Vector2(-1, -1);
  let hoveredIndex = -1;
  let hoveredPoint: { x: number; y: number; price: number; size: number; side: string } | null = $state(null);

  // Colors (from Theme)
  let colorUp = new THREE.Color(0x00ff00);
  let colorDown = new THREE.Color(0xff0000);

  // Performance
  let lastFrameTime = 0;
  let frameCount = 0;
  let fps = 60;

  // Settings Shortcuts
  const settings = $derived(settingsState.tradeFlowSettings);

  // Initialize with $effect - wait for container to be bound
  let initialized = $state(false);
  
  $effect(() => {
    if (!browser || initialized || !container) return;
    
    console.log("[TradeFlow] Initializing...", { container, settings });
    
    initThree();
    updateThemeColors();
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);

    // Subscribe to trades
    updateSubscription(tradeState.symbol);

    animate(0);
    initialized = true;
    
    console.log("[TradeFlow] Initialized successfully");

    return () => {
      console.log("[TradeFlow] Cleanup");
      cleanup();
    };
  });

  $effect(() => {
    if (initialized) {
      console.log("[TradeFlow] Symbol changed:", tradeState.symbol);
      updateSubscription(tradeState.symbol);
    }
  });

  $effect(() => {
    updateThemeColors();
  });

  function updateThemeColors() {
    if (typeof document === "undefined") return;
    const style = getComputedStyle(document.documentElement);
    // Parse CSS vars or fallback
    const up = style.getPropertyValue("--color-up").trim() || "#00b894";
    const down = style.getPropertyValue("--color-down").trim() || "#d63031";
    colorUp.set(up);
    colorDown.set(down);
  }

  function getTradeColors(side: string, price: number): THREE.Color {
    const mode = settings.colorMode;
    
    if (mode === "custom") {
      return side === "buy" 
        ? new THREE.Color(settings.customColorUp)
        : new THREE.Color(settings.customColorDown);
    }
    
    if (mode === "interactive") {
      // Interactive mode: all particles same color based on price trend
      const trend = price > avgPrice ? "up" : "down";
      return trend === "up" ? colorUp : colorDown;
    }
    
    // Default: theme mode
    return side === "buy" ? colorUp : colorDown;
  }

  function initThree() {
    if (!container) return;

    // Scene
    scene = new THREE.Scene();
    // Fog to hide pop-in/out
    scene.fog = new THREE.FogExp2(0x000000, 0.02);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // Renderer
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    canvas = renderer.domElement;

    // Raycaster
    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.2;

    // Geometry (Pre-allocated)
    geometry = new THREE.BufferGeometry();
    positions = new Float32Array(MAX_POINTS * 3);
    colors = new Float32Array(MAX_POINTS * 3);
    sizes = new Float32Array(MAX_POINTS);

    // Fill with invisible points initially (behind camera)
    for (let i = 0; i < MAX_POINTS; i++) {
      positions[i * 3 + 2] = -1000; // Far behind
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1)); // We can use this in shader if needed, but here standard material

    // Material
    const material = new THREE.PointsMaterial({
      size: settings.size,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });

    points = new THREE.Points(geometry, material);
    scene.add(points);

    // Initialize MetaData
    metaData = new Array(MAX_POINTS).fill(null).map(() => ({ price: 0, size: 0, side: "" }));
  }

  function updateSubscription(symbol: string) {
    if (!symbol) return;

    console.log("[TradeFlow] Subscribing to trades:", symbol);
    bitunixWs.subscribeTrade(symbol, onTrade);
  }

  let tradeCount = 0;
  
  function onTrade(trade: any) {
    // trade: { p: price, v: vol, s: side, ... }
    const price = parseFloat(trade.p || trade.lastPrice || "0");
    const size = parseFloat(trade.v || trade.volume || "0");
    const side = trade.s === "buy" ? "buy" : "sell"; // simplified

    if (!price) return;
    
    // Volume filter
    if (size < settings.minVolume) return;

    // Debug: Log first few trades
    if (tradeCount < 5) {
      console.log("[TradeFlow] Trade received:", { price, size, side, minVolume: settings.minVolume });
      tradeCount++;
    }

    // Update Average
    runningSum += price;
    runningCount++;
    // Simple moving average of last 50 trades (reset occasionally to avoid overflow)
    if (runningCount > 100) {
       avgPrice = runningSum / runningCount;
       // Decay
       runningSum = avgPrice * 10;
       runningCount = 10;
    } else {
       avgPrice = runningSum / runningCount;
    }

    if (runningCount === 1) avgPrice = price;

    // Add Point
    addPoint(price, size, side);
  }

  function addPoint(price: number, size: number, side: string) {
    const idx = head;
    const baseIndex = idx * 3;

    // Layout-specific positioning
    if (settings.layout === "tunnel") {
      // Y Position: Deviation from avg
      const deviation = (price - avgPrice) / avgPrice * 1000; // Scale up
      // Clamp Y to avoid flying off screen too far
      const y = Math.max(Math.min(deviation, 3), -3);

      // X Position: Random within spread, creating a "tunnel" width
      const x = (Math.random() - 0.5) * settings.spread;

      // Z Position: Start far away
      const z = -50;

      positions[baseIndex] = x;
      positions[baseIndex + 1] = y;
      positions[baseIndex + 2] = z;
    } else {
      // Grid layout: position on 2D grid
      // X = price deviation, Z = time (sequential), Y = volume
      const deviation = (price - avgPrice) / avgPrice * 10;
      const x = Math.max(Math.min(deviation, 5), -5);
      
      // Z cycles through grid depth
      const gridPos = idx % (settings.gridWidth * settings.gridLength);
      const gridX = Math.floor(gridPos / settings.gridLength);
      const gridZ = gridPos % settings.gridLength;
      
      const z = (gridZ / settings.gridLength - 0.5) * 10;
      const xOffset = (gridX / settings.gridWidth - 0.5) * 10;
      
      // Y based on volume (log scale)
      const y = Math.log10(size + 1) * 0.5;

      positions[baseIndex] = x + xOffset;
      positions[baseIndex + 1] = y;
      positions[baseIndex + 2] = z;
    }

    // Color using new color mode logic
    const color = getTradeColors(side, price);
    // Brightness based on size (log scale)
    const intensity = Math.min(1.0, Math.log10(size + 1) * 0.5 + 0.5);

    colors[baseIndex] = color.r * intensity;
    colors[baseIndex + 1] = color.g * intensity;
    colors[baseIndex + 2] = color.b * intensity;

    metaData[idx] = { price, size, side };

    // Mark update
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;

    // Advance head
    head = (head + 1) % settings.particleCount;
  }

  function animate(time: number) {
    rafId = requestAnimationFrame(animate);

    // FPS Calc
    const delta = time - lastFrameTime;
    lastFrameTime = time;
    if (delta > 0) fps = 1000 / delta;

    if (!scene || !geometry) return;

    // Animation: Move Points forward
    const speed = settings.speed * 0.5; // Base speed factor
    const positionsArr = geometry.attributes.position.array as Float32Array;

    let activePoints = 0;

    for (let i = 0; i < MAX_POINTS; i++) {
        const zIdx = i * 3 + 2;
        if (positionsArr[zIdx] > -900) { // If active (not hidden far away)
            positionsArr[zIdx] += speed;

            // If passes camera, recycle/hide
            if (positionsArr[zIdx] > 10) {
                positionsArr[zIdx] = -1000;
            } else {
                activePoints++;
            }
        }
    }

    if (activePoints > 0) {
        geometry.attributes.position.needsUpdate = true;
    }

    // Interactive Raycasting
    // Throttling: If FPS < 55, skip every other frame or completely
    if (fps > 55 && mouse.x !== -1) {
       raycaster.setFromCamera(mouse, camera);
       const intersects = raycaster.intersectObject(points);

       if (intersects.length > 0) {
           const index = intersects[0].index;
           if (index !== undefined && index !== hoveredIndex) {
               hoveredIndex = index;
               // Get screen position of the point
               const p = intersects[0].point.clone();
               p.project(camera);
               const x = (p.x * .5 + .5) * canvas.clientWidth;
               const y = (p.y * -.5 + .5) * canvas.clientHeight;

               hoveredPoint = {
                   x,
                   y,
                   ...metaData[index]
               };

               // Highlight effect? We could scale it up but that requires attribute size update.
               // Just the hover logic is enough for now.
           }
       } else {
           hoveredIndex = -1;
           hoveredPoint = null;
       }
    }

    renderer.render(scene, camera);
  }

  function onMouseMove(event: MouseEvent) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function cleanup() {
    cancelAnimationFrame(rafId);
    if (tradeState.symbol) {
        bitunixWs.unsubscribeTrade(tradeState.symbol, onTrade);
    }
    window.removeEventListener("resize", onResize);
    window.removeEventListener("mousemove", onMouseMove);

    if (geometry) geometry.dispose();
    if (renderer) renderer.dispose();
    if (container && canvas) container.removeChild(canvas);
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
