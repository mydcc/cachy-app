<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import * as THREE from "three";
  import { settingsState } from "../../../stores/settings.svelte";
  import { tradeState } from "../../../stores/trade.svelte";
  import { bitunixWs } from "../../../services/bitunixWs";
  import { PerformanceMonitor } from "../../../utils/performanceMonitor";

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

  // FPS Throttling & Performance
  let performanceMonitor: PerformanceMonitor;
  let fpsInterval = 1000 / 30; // 30 FPS default
  let lastDrawTime = 0;
  let isHighPerformance = false;
  let highPerfTimeout: ReturnType<typeof setTimeout> | null = null;

  let isVisible = true;
  let observer: IntersectionObserver | null = null;

  function startAnimationLoop() {
      if (!rafId && lifecycleState === LifecycleState.READY) {
          animate(performance.now());
      }
  }

  function stopAnimationLoop() {
      if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
      }
  }

  function handleVisibilityChange() {
      if (document.hidden) {
          stopAnimationLoop();
      } else if (isVisible) {
          startAnimationLoop();
      }
  }

  function onInteraction() {
      if (!isHighPerformance) {
          isHighPerformance = true;
          fpsInterval = 1000 / 60;
      }

      if (highPerfTimeout) clearTimeout(highPerfTimeout);
      highPerfTimeout = setTimeout(() => {
          isHighPerformance = false;
          fpsInterval = 1000 / 30;
      }, 1000);
  }


  // ========================================
  // RESOURCE MANAGEMENT
  // ========================================

  interface ThreeResources {
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    geometry: THREE.BufferGeometry | null;
    material: THREE.ShaderMaterial | null; // Changed to ShaderMaterial
    points: THREE.Points | null;
  }

  let resources: ThreeResources = {
    scene: null,
    camera: null,
    renderer: null,
    geometry: null,
    material: null,
    points: null,
  };

  // ========================================
  // COMPONENT STATE
  // ========================================

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let rafId: number = 0;
  let mouse = new THREE.Vector2(-1, -1);

  // Particle Data Arrays
  // Warning: We update these infrequently now!
  let positions: Float32Array;
  let colors: Float32Array;
  let sizes: Float32Array;
  let speeds: Float32Array;      // [GPU] Speed attribute
  let birthTimes: Float32Array;  // [GPU] Birth timestamp for shader animation

  // Metadata for tooltips (CPU side sync)
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
  const RAYCAST_THROTTLE_MS = 32; // ~30fps raycast is enough

  // Theme Colors
  let colorUp = new THREE.Color(0x00b894);
  let colorDown = new THREE.Color(0xd63031);

  // Settings Shortcuts
  const settings = $derived(settingsState.tradeFlowSettings);

  // ========================================
  // SHADER DEFINITIONS
  // ========================================

  const vertexShader = `
    uniform float uTime;
    uniform float uSize;
    
    attribute float aSize;
    attribute float aSpeed;
    attribute float aBirthTime;
    
    varying vec3 vColor;
    
    void main() {
      vColor = color;
      
      // Calculate time delta since birth
      float age = (uTime - aBirthTime); // Time in seconds
      
      // If age < 0 (future birth), keeping it hidden behind camera
      if (age < 0.0) age = 0.0; 
      
      vec3 pos = position;
      
      // Z movement logic:
      // Move from back (-100 or wherever) towards camera (+Z)
      // pos.z += aSpeed * age;
      // BUT our CPU logic was: spawn at random X/Y/Z, move +Z until +10, then reset.
      // Shader logic:
      // currentZ = initialZ + speed * age
      
      pos.z = position.z + aSpeed * age;
      
      // Reset logic (Modulo-ish or Dissolve)
      // Simplification: If Z > 10.0, we can clip it or let it fly.
      // For now, let it fly. 
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      
      // Size attenuation
      gl_PointSize = uSize * aSize * (300.0 / -mvPosition.z);
      
      // Hide if behind camera or too close
      if (mvPosition.z > -1.0) {
          gl_PointSize = 0.0;
      }

      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = `
    varying vec3 vColor;
    
    void main() {
      // Circular particle
      vec2 coord = gl_PointCoord - vec2(0.5);
      if (length(coord) > 0.5) discard;
      
      gl_FragColor = vec4(vColor, 1.0); // opacity managed via color mixing or uniform
    }
  `;

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
    speeds = new Float32Array(particleCount);
    birthTimes = new Float32Array(particleCount);

    // Initial fill
    const now = performance.now() / 1000;
    for (let i = 0; i < particleCount; i++) {
        // Initialize way behind camera so they aren't seen until officially "spawned"
      positions[i * 3 + 2] = -5000; 
      birthTimes[i] = now + 999999; // Future birth = inactive
    }

    resources.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    resources.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    resources.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    resources.geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    resources.geometry.setAttribute("aBirthTime", new THREE.BufferAttribute(birthTimes, 1));

    // Shader Material
    resources.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: settings.size }
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      depthWrite: false, // For better transparency if needed
      blending: THREE.AdditiveBlending
    });

    resources.points = new THREE.Points(resources.geometry, resources.material);
    // Important: Prevent frustum culling because particles move in shader!
    resources.points.frustumCulled = false; 
    resources.scene.add(resources.points);

    // Initialize MetaData
    metaData = new Array(particleCount).fill(null).map(() => ({ price: 0, size: 0, side: "" }));
    
    // Explicitly set references for resource manager
    resources.points = resources.points;
    resources.material = resources.material;
    
    log(LogLevel.DEBUG, '✅ GPU Particle system setup complete');
  }

  function initThree(): { success: boolean; error?: string } {
    try {
      log(LogLevel.INFO, '🚀 Starting Three.js initialization (GPU Mode)...');

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
      // Fog is tricky with ShaderMaterial, skipping for now or handle in shader
      // resources.scene.fog = new THREE.FogExp2(0x000000, 0.02); 

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

      // Setup Particle System
      setupParticleSystem();
      setupAmbientParticles();

      // Start Demo Mode
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
        error: error instanceof Error ? error.message : 'Unknown error' // i18n-ignore
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
        performanceMonitor = new PerformanceMonitor("TradeFlow");
        performanceMonitor.start(resources.renderer || undefined);

    
    if (!result.success) {
      lifecycleState = LifecycleState.ERROR;
      lifecycleError = result.error || 'Unknown error' // i18n-ignore;
      log(LogLevel.ERROR, '❌ Initialization failed:', lifecycleError);
      return;
    }
    
    updateThemeColors();
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);
    
    updateSubscription(tradeState.symbol);
    animate(0);
    

        // Visibility Culling
        observer = new IntersectionObserver(([entry]) => {
            isVisible = entry.isIntersecting;
            if (isVisible && !document.hidden) {
                startAnimationLoop();
            } else {
                stopAnimationLoop();
            }
        });
        observer.observe(container);

        document.addEventListener("visibilitychange", handleVisibilityChange);

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
      hasReceivedRealTrades = false;
      startDemoMode(); 
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
    if (!hasReceivedRealTrades) {
        hasReceivedRealTrades = true;
        stopDemoMode();
    }

    const price = parseFloat(trade.p || trade.lastPrice || "0");
    const size = parseFloat(trade.v || trade.volume || "0");
    const side = trade.s === "buy" ? "buy" : "sell";

    if (!price) return;
    if (size < settings.minVolume) return;

    if (tradeCount < 3) {
      log(LogLevel.DEBUG, '📊 Trade received:', { price, size, side });
      tradeCount++;
    }

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

  function addPoint(price: number, size: number, side: string) {
    if (!resources.geometry) return;

    const idx = head;
    const baseIndex = idx * 3;
    
    // Set Birth Time (NOW)
    const now = performance.now() / 1000;
    
    // Set Speed (Constant + Layout factor)
    const speed = settings.speed * 0.5;

    // Layout-specific positioning (Start Position)
    // IMPORTANT: The shader will apply "z += speed * age"
    // So we spawn them deep in Z (-50 or -100) and they fly towards camera (+5)
    
    const startZ = -100;

    if (settings.layout === "tunnel") {
      const deviation = avgPrice > 0 ? (price - avgPrice) / avgPrice * 1000 : (Math.random() - 0.5) * 2;
      const y = Math.max(Math.min(deviation, 3), -3);
      const x = (Math.random() - 0.5) * settings.spread;

      positions[baseIndex] = x;
      positions[baseIndex + 1] = y;
      positions[baseIndex + 2] = startZ;
    } else {
      const deviation = avgPrice > 0 ? (price - avgPrice) / avgPrice * 10 : (Math.random() - 0.5) * 2;
      const x = Math.max(Math.min(deviation, 5), -5);
      
      const gridPos = idx % (settings.gridWidth * settings.gridLength);
      const gridX = Math.floor(gridPos / settings.gridLength);
      const gridZ = gridPos % settings.gridLength;
      
      const zOffset = (gridZ / settings.gridLength - 0.5) * 10;
      const xOffset = (gridX / settings.gridWidth - 0.5) * 10;
      const y = Math.log10(size + 1) * 0.5;

      positions[baseIndex] = x + xOffset;
      positions[baseIndex + 1] = y;
      // We add some variation to startZ based on grid
      positions[baseIndex + 2] = startZ + zOffset; 
    }

    // Color
    const color = getTradeColors(side, price);
    const intensity = Math.min(1.0, Math.log10(size + 1) * 0.5 + 0.5);

    colors[baseIndex] = color.r * intensity;
    colors[baseIndex + 1] = color.g * intensity;
    colors[baseIndex + 2] = color.b * intensity;

    // Size
    sizes[idx] = Math.max(0.5, Math.log10(size + 1));
    
    // Speed
    speeds[idx] = speed;
    
    // Birth Time
    birthTimes[idx] = now;

    // Metadata
    metaData[idx] = { price, size, side };

    // Update GPU (Only ranges that changed)
    // Since we are using a ring buffer, we technically only change 1 index.
    // Three.js BufferAttribute updateRange can optimize this.
    
    const geom = resources.geometry;
    
    geom.attributes.position.setXYZ(idx, positions[baseIndex], positions[baseIndex+1], positions[baseIndex+2]);
    (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.position as any).updateRange = { offset: baseIndex, count: 3 };

    geom.attributes.color.setXYZ(idx, colors[baseIndex], colors[baseIndex+1], colors[baseIndex+2]);
    (geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.color as any).updateRange = { offset: baseIndex, count: 3 };

    geom.attributes.aSize.setX(idx, sizes[idx]);
    (geom.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.aSize as any).updateRange = { offset: idx, count: 1 };
    
    geom.attributes.aSpeed.setX(idx, speeds[idx]);
    (geom.attributes.aSpeed as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.aSpeed as any).updateRange = { offset: idx, count: 1 };
    
    geom.attributes.aBirthTime.setX(idx, birthTimes[idx]);
    (geom.attributes.aBirthTime as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.aBirthTime as any).updateRange = { offset: idx, count: 1 };

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
    
    const ambientCount = Math.floor(settings.particleCount * 0.1);
    const now = performance.now() / 1000;
    const geom = resources.geometry;
    
    for (let i = 0; i < ambientCount; i++) {
        const idx = i;
        const baseIndex = idx * 3;
        
        // Random spread
        positions[baseIndex] = (Math.random() - 0.5) * 20; 
        positions[baseIndex + 1] = (Math.random() - 0.5) * 10; 
        // Random start Z deep in tunnel
        positions[baseIndex + 2] = -50 - Math.random() * 50; 
        
        // Faint color
        const isUp = Math.random() > 0.5;
        const color = isUp ? colorUp : colorDown;
        const intensity = 0.3; 
        
        colors[baseIndex] = color.r * intensity;
        colors[baseIndex + 1] = color.g * intensity;
        colors[baseIndex + 2] = color.b * intensity;
        
        sizes[idx] = 0.5 + Math.random();
        speeds[idx] = settings.speed * 0.5 * 0.5; // Slower ambient
        birthTimes[idx] = now - Math.random() * 100; // Past birth = already moving
        
        metaData[idx] = { price: 0, size: 0, side: isUp ? "buy" : "sell" };
    }
    
    // Bulk update for init
    (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.aSpeed as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.aBirthTime as THREE.BufferAttribute).needsUpdate = true;

    head = ambientCount;
  }

  function startDemoMode() {
      if (demoModeInterval || hasReceivedRealTrades) return;
      log(LogLevel.INFO, '🤖 Starting Demo Mode...');
      demoModeInterval = window.setInterval(() => {
          if (hasReceivedRealTrades) { stopDemoMode(); return; }
          
          const side = Math.random() > 0.5 ? "buy" : "sell";
          const basePrice = avgPrice > 0 ? avgPrice : 50000;
          const price = basePrice + (Math.random() - 0.5) * (basePrice * 0.001);
          const size = Math.random() * 2;
          addPoint(price, size, side);
      }, 100); 
  }

  function stopDemoMode() {
      if (demoModeInterval) {
          clearInterval(demoModeInterval);
          demoModeInterval = null;
          log(LogLevel.INFO, '🤖 Demo Mode stopped');
      }
  }

  // ========================================
  // ANIMATION & RENDERING
  // ========================================

  function animate(time: number) {
    if (!resources.material || !resources.renderer || !resources.scene || !resources.camera) {
      return;
    }

    rafId = requestAnimationFrame(animate);

    // Throttling
    const now = performance.now();
    const elapsed = now - lastDrawTime;
    const targetInterval = isHighPerformance ? (1000 / 60) : (1000 / 30);

    if (elapsed > targetInterval) {
        lastDrawTime = now - (elapsed % targetInterval);

        // GPU TIME UPDATE
        resources.material.uniforms.uTime.value = now / 1000;

        // Raycasting Throttled
        if (now - lastRaycastTime > RAYCAST_THROTTLE_MS && mouse.x !== -1) {
          performOptimizedRaycast(now / 1000);
          lastRaycastTime = now;
        }

        resources.renderer.render(resources.scene, resources.camera);
        if (performanceMonitor) performanceMonitor.update();
    }
  }

  function performOptimizedRaycast(currentTime: number) {
      // CUSTOM RAYCASTING FOR SHADER ANIMATED PARTICLES
      // The geometry.position is STATIC (Start Position).
      // The visual position is dynamic.
      // We must check: ProjectedPosition( StartPos + Speed * Age ) vs Mouse
      
      if (!resources.camera || !canvas) return;
      
      const count = settings.particleCount;
      let foundIndex = -1;
      let foundPoint: THREE.Vector3 | null = null;
      
      const p = new THREE.Vector3();
      
      for (let i=0; i<count; i++) {
          // Check if active
          const bTime = birthTimes[i];
          const age = currentTime - bTime;
          if (age < 0) continue; // Future
          
          // Get Start Pos
          const sx = positions[i*3];
          const sy = positions[i*3+1];
          const sz = positions[i*3+2];
          const spd = speeds[i];
          
          // Current Z
          const cz = sz + spd * age;
          
          // Frustum Check Z
          if (cz > 5) continue; // Past camera (Camera at Z=5)
          if (cz < -200) continue; // Too far
          
          // Project to Screen
          p.set(sx, sy, cz);
          p.project(resources.camera);
          
          // Distance to Mouse (NDC space: -1 to 1)
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const distSq = dx*dx + dy*dy;
          
          // Threshold (e.g. 0.05 in NDC is roughly 20-50 pixels)
          if (distSq < 0.002) { 
              foundIndex = i;
              foundPoint = new THREE.Vector3(sx, sy, cz); // Real world pos
              break; 
          }
      }
      
      if (foundIndex !== -1 && foundIndex !== hoveredIndex) {
          hoveredIndex = foundIndex;
          if (foundPoint) {
              // Calculate screen coordinates for tooltip
              foundPoint.project(resources.camera);
              const x = (foundPoint.x * .5 + .5) * canvas.clientWidth;
              const y = (foundPoint.y * -.5 + .5) * canvas.clientHeight;
              hoveredPoint = { x, y, ...metaData[foundIndex] };
          }
      } else if (foundIndex === -1 && hoveredIndex !== -1) {
          hoveredIndex = -1;
          hoveredPoint = null;
      }
  }

  // ========================================
  // EVENT HANDLERS
  // ========================================

  function onMouseMove(event: MouseEvent) {
    onInteraction();
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
    log(LogLevel.INFO, '🧹 Starting complete cleanup...');

    if (resources.scene) {
        resources.scene.traverse((object) => {
            if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(m => m.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            }
        });
    }

    disposeGeometry();
    disposeMaterial();

    if (resources.renderer) {
        // @ts-ignore
    }

    disposeRenderer();
    
    resources.scene = null;
    resources.camera = null;
    resources.points = null;
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
    
    stopDemoMode();
    
    // Remove event listeners
    window.removeEventListener('resize', onResize);
    window.removeEventListener('mousemove', onMouseMove);

    if (observer) observer.disconnect();
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    
    // Dispose all Three.js resources
    disposeAll();
    
    // Reset state
    hoveredPoint = null;
    hoveredIndex = -1;
    metaData = [];
    head = 0;
    hasReceivedRealTrades = false;
    

    if (performanceMonitor) performanceMonitor.stop();
    log(LogLevel.INFO, '✅ Cleanup complete');
  }
</script>

<div
  bind:this={container}
  class="tradeflow-container"
  role="img"
  aria-label="3D Trade Flow Visualization"
></div>

{#if lifecycleError}
  <div class="error-overlay">
    <p>⚠️ {lifecycleError}</p>
    <button onclick={() => window.location.reload()}>Reload</button>
  </div>
{/if}

{#if hoveredPoint}
  <div 
    class="tooltip"
    style="left: {hoveredPoint.x}px; top: {hoveredPoint.y}px;"
  >
    <div class="tooltip-content {hoveredPoint.side}">
      <span class="price">{hoveredPoint.price.toFixed(2)}</span>
      <span class="size">{hoveredPoint.size.toFixed(4)}</span>
    </div>
  </div>
{/if}

<style>
  .tradeflow-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    z-index: 0;
    pointer-events: none; /* Let clicks pass through to UI */
  }

  .error-overlay {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: rgba(200, 0, 0, 0.8);
    color: white;
    padding: 10px;
    border-radius: 4px;
    z-index: 1000;
  }

  .tooltip {
    position: absolute;
    pointer-events: none;
    transform: translate(-50%, -100%);
    z-index: 10;
  }

  .tooltip-content {
    background: rgba(0, 0, 0, 0.8);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    display: flex;
    gap: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .tooltip-content.buy {
    border-color: var(--color-up, #00b894);
  }

  .tooltip-content.sell {
    border-color: var(--color-down, #d63031);
  }

  .price {
    font-weight: bold;
    color: white;
  }

  .size {
    opacity: 0.7;
    color: white;
  }
</style>
