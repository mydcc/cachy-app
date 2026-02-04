<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  import { settingsState } from "../../../stores/settings.svelte";
  import { tradeState } from "../../../stores/trade.svelte";
  import { bitunixWs } from "../../../services/bitunixWs";
  import { browser } from "/environment";

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

  // Initialize
  onMount(() => {
    if (!browser) return;

    initThree();
    updateThemeColors();
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);

    // Subscribe to trades
    updateSubscription(tradeState.symbol);

    animate(0);

    return () => {
      cleanup();
    };
  });

  $effect(() => {
    updateSubscription(tradeState.symbol);
  });

  $effect(() => {
    // Watch for theme changes implicitly via re-render or explicit observation if needed
    // Assuming theme might change, we can poll or listen.
    // Ideally we subscribe to a store, but here we can just update in loop or check occasionally.
    // For now, we update once.
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

    // Unsub old (if we tracked it, but bitunixWs handles logic)
    // We just subscribe to new. The component logic is stateless regarding symbol transition
    // except we might want to clear points?
    // Let's keep points for visual continuity (tunnel effect).

    bitunixWs.subscribeTrade(symbol, onTrade);
  }

  function onTrade(trade: any) {
    // trade: { p: price, v: vol, s: side, ... }
    const price = parseFloat(trade.p || trade.lastPrice || "0");
    const size = parseFloat(trade.v || trade.volume || "0");
    const side = trade.s === "buy" ? "buy" : "sell"; // simplified

    if (!price) return;

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

    // Y Position: Deviation from avg
    const deviation = (price - avgPrice) / avgPrice * 1000; // Scale up
    // Clamp Y to avoid flying off screen too far
    const y = Math.max(Math.min(deviation, 3), -3);

    // X Position: Random within spread, creating a "tunnel" width
    // Or spiral? Let's do random spread.
    const x = (Math.random() - 0.5) * settings.spread;

    // Z Position: Start far away
    const z = -50;

    // Color
    const color = side === "buy" ? colorUp : colorDown;
    // Brightness based on size (log scale)
    const intensity = Math.min(1.0, Math.log10(size + 1) * 0.5 + 0.5);

    positions[baseIndex] = x;
    positions[baseIndex + 1] = y;
    positions[baseIndex + 2] = z;

    colors[baseIndex] = color.r * intensity;
    colors[baseIndex + 1] = color.g * intensity;
    colors[baseIndex + 2] = color.b * intensity;

    metaData[idx] = { price, size, side };

    // Mark update
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    // We update the range optimization if possible, but strict "needsUpdate=true" is safest for ring buffer
    // geometry.attributes.position.updateRange = { offset: baseIndex, count: 3 };
    // Actually full update is fine for 5k points.

    // Advance head
    head = (head + 1) % settings.particleCount; // Respect max count from settings if dynamic?
    // Note: If buffer is MAX_POINTS=5000, and settings.particleCount < 5000, we just wrap earlier?
    // For simplicity, we stick to MAX_POINTS buffer size, but only render effective count if we wanted to hide rest.
    // But simplest is just use MAX_POINTS constant as capacity.
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
