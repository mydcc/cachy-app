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

  const LOG_LEVEL = LogLevel.INFO;

  function log(level: LogLevelType, message: string, ...args: any[]) {
    if (level <= LOG_LEVEL) {
      const prefix = '[TradeFlow]';
      switch (level) {
        case LogLevel.ERROR: console.error(prefix, message, ...args); break;
        case LogLevel.WARN: console.warn(prefix, message, ...args); break;
        case LogLevel.INFO: console.info(prefix, message, ...args); break;
        case LogLevel.DEBUG: console.log(prefix, message, ...args); break;
      }
    }
  }

  let lifecycleState = $state<LifecycleStateType>(LifecycleState.IDLE);
  let lifecycleError = $state<string | null>(null);

  // Performance
  let performanceMonitor: PerformanceMonitor;
  let rafId: number = 0;
  
  let isVisible = true;
  let observer: IntersectionObserver | null = null;

  function startAnimationLoop() {
      if (!rafId && lifecycleState === LifecycleState.READY) {
          animate();
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

  // ========================================
  // COMPONENT STATE
  // ========================================

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  
  // THREE Objects
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  
  let pointclouds: THREE.Points[] = [];
  let materials: THREE.ShaderMaterial[] = [];

  // Data Management
  
  // Shared State Arrays
  let equalizerBars: Float32Array; // Shared for Equalizer and City (amplitude)
  
  // Raindrops State
  type Ripple = { x: number, z: number, age: number, intensity: number };
  let activeRipples: Ripple[] = [];
  
  // Sonar State
  let sonarBlips: { x: number, z: number, life: number }[] = [];
  let sonarAngle = 0;

  // Theme & Atmosphere
  let colorUp = new THREE.Color(0x00b894);
  let colorDown = new THREE.Color(0xd63031);
  let colorWarning = new THREE.Color(0xfdcb6e);
  
  // Rolling Window for Atmosphere
  const tradeHistorySize = 100;
  let tradeHistory: string[] = []; // 'buy' or 'sell'
  let buyCount = 0;
  let sellCount = 0;
  
  // Current Atmosphere Color (interpolated)
  let currentAtmosphere = new THREE.Color(0x000000);
  let targetAtmosphere = new THREE.Color(0x000000);

  const settings = $derived(settingsState.tradeFlowSettings);
  let lastFlowMode = $state(settings.flowMode);

  // ========================================
  // SHADERS
  // ========================================

  const vertexShader = `
    uniform float uSize;
    uniform float uTime;
    uniform float uMode; // 1=Equalizer, 2=Raindrops, 3=City, 4=Sonar
    
    attribute float amplitude; // Used for Equalizer height, Raindrops time, City height
    varying vec3 vColor;
    
    void main() {
      vColor = color;
      vec3 pos = position; // Base grid position
      float pSize = uSize;

      if (uMode == 1.0) { // Equalizer
          // Bar height based on amplitude
          pos.y = position.y + (amplitude * 5.0); 
      }
      else if (uMode == 2.0) { // Raindrops
          // Amplitude here holds "Height" calculated in CPU
          pos.y = amplitude * 2.0; 
      }
      else if (uMode == 3.0) { // City
          // Similar to Equalizer but blocked/stepped
          // Amplitude is height of building
          pos.y = amplitude * 5.0; 
      }
      else if (uMode == 4.0) { // Sonar
          // Points are stationary.
          pos.y = 0.0;
      }

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = pSize * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = `
    uniform vec3 uAtmosphere;
    uniform float uOpacity;
    uniform float uMode;
    uniform float uTime;
    
    varying vec3 vColor;
    
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      
      float alpha = 1.0;
      
      if (uMode == 3.0) { // City: Square particles
          if (abs(coord.x) > 0.45 || abs(coord.y) > 0.45) discard; 
          alpha = 1.0;
      } else {
          // Circle shape
          float dist = length(coord);
          if (dist > 0.5) discard;
          // Soft edge
          alpha = 1.0 - smoothstep(0.4, 0.5, dist);
      }
      
      vec3 finalColor = vColor;
      
      // Mix Atmosphere
      finalColor = finalColor + uAtmosphere * 0.3; 
      alpha *= uOpacity;
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  // ========================================
  // GEOMETRY GENERATION
  // ========================================

  function createShaderMaterial() {
      return new THREE.ShaderMaterial({
          uniforms: {
              uSize: { value: settings.size * 100.0 }, // Scale for display
              uTime: { value: 0.0 },
              uMode: { value: getModeId(settings.flowMode) }, 
              uAtmosphere: { value: new THREE.Color(0x000000) },
              uOpacity: { value: 1.0 }
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
          vertexColors: true,
          transparent: true,
          depthWrite: false, 
          blending: THREE.AdditiveBlending
      });
  }

  function getModeId(mode: string): number {
      switch (mode) {
          case 'equalizer': return 1.0;
          case 'raindrops': return 2.0;
          case 'city': return 3.0;
          case 'sonar': return 4.0;
          default: return 1.0; // Default to Equalizer (Tunnel removed)
      }
  }

  function generatePointCloudGeometry( color: THREE.Color, width: number, length: number, mode: string ) {
      const geometry = new THREE.BufferGeometry();
      const numPoints = width * length;

      const positions = new Float32Array( numPoints * 3 );
      const colors = new Float32Array( numPoints * 3 );
      const amplitudes = new Float32Array( numPoints ); 

      let k = 0;

      for ( let i = 0; i < width; i ++ ) {
          for ( let j = 0; j < length; j ++ ) {
              const u = i / width;
              const v = j / length;
              
              let x = 0, y = 0, z = 0;

              // Grid layouts (Equalizer, Raindrops, City, Sonar)
              x = (u - 0.5) * 2.0; 
              z = (v - 0.5) * 2.0;
              y = 0; 

              positions[ 3 * k ] = x;
              positions[ 3 * k + 1 ] = y;
              positions[ 3 * k + 2 ] = z;

              // Initial Colors
              // For City/Sonar we might want darker base
              const baseIntensity = mode === 'city' ? 0.05 : 0.1;
              const intensity = (Math.random() * 0.1) + baseIntensity; 
              
              colors[ 3 * k ] = color.r * intensity;
              colors[ 3 * k + 1 ] = color.g * intensity;
              colors[ 3 * k + 2 ] = color.b * intensity;
              
              amplitudes[k] = 0.0; 

              k ++;
          }
      }

      geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
      geometry.setAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );
      geometry.setAttribute( 'amplitude', new THREE.BufferAttribute( amplitudes, 1 ) );
      geometry.computeBoundingBox();

      return geometry;
  }

  function initSceneObjects() {
      if (!scene) return;
      
      while(scene.children.length > 0){ 
          scene.remove(scene.children[0]); 
      }
      pointclouds = [];
      materials = [];

      const width = settings.gridWidth || 80;
      const length = settings.gridLength || 160;
      
      // Initialize shared data arrays
      const numPoints = width * length;
      if (!equalizerBars || equalizerBars.length !== numPoints) {
          equalizerBars = new Float32Array(numPoints).fill(0);
      }
      
      // Always single layer now (Tunnel layers removed)
      const c = new THREE.Color(0x00b894); 

      const geometry = generatePointCloudGeometry(c, width, length, settings.flowMode);
      const material = createShaderMaterial();
       
      const pc = new THREE.Points(geometry, material);
       
      // Unified scaling for grid modes
      pc.scale.set(10, 10, 10); 
      pc.position.set(0, -2, 0); 
       
      scene.add(pc);
      pointclouds.push(pc);
      materials.push(material);
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  function initThree(): { success: boolean; error?: string } {
    try {
      log(LogLevel.INFO, '🚀 Starting Three.js initialization (Unified Shader Mode)...');
      
      const width = container.clientWidth;
      const height = container.clientHeight;

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera( 45, width / height, 1, 10000 );
      updateCameraPosition();
      camera.updateMatrix();

      renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
      renderer.setPixelRatio( window.devicePixelRatio );
      renderer.setSize( width, height );
      container.appendChild( renderer.domElement );
      canvas = renderer.domElement;
      
      initSceneObjects();

      log(LogLevel.INFO, '✅ Three.js initialization complete');
      return { success: true };
    } catch (error) {
      log(LogLevel.ERROR, '❌ Initialization failed:', error);
      return { 
        success: false, 
            error: error instanceof Error ? error.message : 'apiErrors.generic'
      };
    }
  }
  
  function updateCameraPosition() {
      if (!camera) return;
      
      // Sonar has unique top-down view
      if (settings.flowMode === 'sonar') {
          camera.position.set( 0, 30, 0.1 ); // Top down view
          camera.lookAt( 0, 0, 0 );
      } else {
          // Standard perspective for Eq, City, Raindrops
          camera.position.set( 0, 15, 25 ); 
          if(scene) camera.lookAt( 0, 0, 0 );
      }
  }

  // ========================================
  // ANIMATION & INTERACTION
  // ========================================

  function onResize() {
      if (!camera || !renderer || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize( w, h );
  }

  function animate() {
      if (!scene || !camera || !renderer) return;

      rafId = requestAnimationFrame(animate);

      const time = performance.now() * 0.001;

      // Update Uniforms
      materials.forEach(mat => {
          mat.uniforms.uTime.value = time;
          mat.uniforms.uAtmosphere.value.copy(currentAtmosphere);
      });

      // Mode Specific Animation
      if (settings.flowMode === 'equalizer' || settings.flowMode === 'city') {
          animateDecay(); // Shared logic: things go up, then decay down
      } else if (settings.flowMode === 'raindrops') {
          animateRaindrops(time);
      } else if (settings.flowMode === 'sonar') {
          animateSonar(time);
      } else {
          // Fallback (should typically be covered above)
          animateDecay();
      }

      renderer.render( scene, camera );
      if (performanceMonitor) performanceMonitor.update();
  }
  
  function animateDecay() {
      const decay = settings.decaySpeed || 0.95; 
      const width = settings.gridWidth || 80;
      const length = settings.gridLength || 160;
      const numPoints = width * length;
      
      pointclouds.forEach(pc => {
          const attr = pc.geometry.getAttribute('amplitude') as THREE.BufferAttribute;
          if (!attr) return;
          
          let needsUpdate = false;
          
          for(let i=0; i<numPoints; i++) {
              if (equalizerBars[i] > 0.001) {
                  equalizerBars[i] *= decay;
                  attr.setX(i, equalizerBars[i]);
                  needsUpdate = true;
              } else if (equalizerBars[i] !== 0) {
                   equalizerBars[i] = 0;
                   attr.setX(i, 0);
                   needsUpdate = true;
              }
          }
          if (needsUpdate) attr.needsUpdate = true;
      });
  }
  
  function animateRaindrops(time: number) {
      // 1. Update ripples
      const width = settings.gridWidth || 80;
      const length = settings.gridLength || 160;
      
      // Remove old
      activeRipples = activeRipples.filter(r => r.age < 5.0).map(r => ({...r, age: r.age + 0.05}));
      
      pointclouds.forEach(pc => {
          const attr = pc.geometry.getAttribute('amplitude') as THREE.BufferAttribute;
          
          for(let i=0; i<width; i++) {
              for(let j=0; j<length; j++) {
                   const idx = i*length + j;
                   let h = 0;
                   
                   for(const r of activeRipples) {
                       const dx = i - r.x;
                       const dz = j - r.z;
                       const dist = Math.sqrt(dx*dx + dz*dz);
                       
                       const radius = r.age * 10.0; 
                       const distFromWave = Math.abs(dist - radius);
                       
                       if (distFromWave < 2.0) { 
                           const wave = Math.cos(distFromWave * 1.5) * Math.exp(-r.age * 0.5);
                           h += wave * r.intensity;
                       }
                   }
                   
                   attr.setX(idx, h);
              }
          }
          attr.needsUpdate = true;
      });
  }
  
  function animateSonar(time: number) {
      // Use settings.speed for sonar sweep speed. Default ~0.5 rad/s if settings.speed is ~1.0?
      // settings.speed normally 0.1 to 2.0.
      const sweepSpeed = (settings.speed || 1.0) * 0.5;
      sonarAngle = (time * sweepSpeed) % (Math.PI * 2);
      
      // Decay blips
      sonarBlips = sonarBlips.filter(b => b.life > 0);
      sonarBlips.forEach(b => b.life -= 0.01);
      
      const width = settings.gridWidth || 80;
      const length = settings.gridLength || 160;
      const centerX = width / 2;
      const centerZ = length / 2;
      
      pointclouds.forEach(pc => {
          const attr = pc.geometry.getAttribute('color') as THREE.BufferAttribute;
          
          for(let i=0; i<width; i++) {
              for(let j=0; j<length; j++) {
                  const idx = i*length + j;
                  
                  const dx = i - centerX;
                  const dz = j - centerZ;
                  let angle = Math.atan2(dz, dx); 
                  if (angle < 0) angle += Math.PI * 2;
                  
                  let angleDiff = Math.abs(angle - sonarAngle);
                  if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
                  
                  let intensity = 0.05; 
                  
                  if (angleDiff < 0.2) {
                      intensity += (1.0 - angleDiff/0.2) * 0.5;
                  }
                  
                  for(const b of sonarBlips) {
                      const bdx = i - b.x;
                      const bdz = j - b.z;
                      if (bdx*bdx + bdz*bdz < 4.0) { 
                           intensity += b.life; 
                      }
                  }
                  
                  attr.setXYZ(idx, 
                      colorUp.r * intensity, 
                      colorUp.g * intensity, 
                      colorUp.b * intensity
                  );
              }
          }
          attr.needsUpdate = true;
      });
  }


  // ========================================
  // TRADE HANDLING
  // ========================================

  function updateSubscription(symbol: string) {
    if (!symbol) return;
    log(LogLevel.INFO, '📡 Subscribing to trades:', symbol);
    bitunixWs.subscribeTrade(symbol, onTrade);
  }

  let hasReceivedRealTrades = false; 
  
  function onTrade(trade: any) {
      if (!hasReceivedRealTrades) hasReceivedRealTrades = true;

      const price = parseFloat(trade.p || trade.lastPrice || "0");
      const size = parseFloat(trade.v || trade.volume || "0");
      const side = trade.s === "buy" ? "buy" : "sell";

      if (!price) return;
      if (settings.minVolume && size < settings.minVolume) return;

      const mode = settings.flowMode;
      if (mode === 'equalizer' || mode === 'city') {
          processTradeEqualizer(side, price, size);
      } else if (mode === 'raindrops') {
          processTradeRaindrops(side, price, size);
      } else if (mode === 'sonar') {
          processTradeSonar(side, price, size);
      } else {
          // Fallback to Equalizer
          processTradeEqualizer(side, price, size);
      }
      
      updateAtmosphere(side);
  }
  
  function processTradeEqualizer(side: string, price: number, size: number) {
      const width = settings.gridWidth || 80;
      const length = settings.gridLength || 160;
      
      const volScale = settings.volumeScale || 1.0;
      let intensity = Math.min(volScale * (0.5 + Math.log10(size + 1)), 5.0);
      const splashCount = Math.max(1, Math.floor(Math.log10(size+1) * 3));
      
      for(let k=0; k<splashCount; k++) {
          const rx = Math.floor(Math.random() * width);
          const rz = Math.floor(Math.random() * length);
          const idx = rx * length + rz; 
          
          if (idx < equalizerBars.length) {
              equalizerBars[idx] = Math.max(equalizerBars[idx], intensity);
              
              if (pointclouds.length > 0) {
                  const color = getTradeColors(side, price);
                  const attr = pointclouds[0].geometry.getAttribute('color') as THREE.BufferAttribute;
                  if (attr) {
                      attr.setXYZ(idx, color.r, color.g, color.b);
                      attr.needsUpdate = true;
                  }
              }
          }
      }
  }
  
  function processTradeRaindrops(side: string, price: number, size: number) {
      const width = settings.gridWidth || 80;
      const length = settings.gridLength || 160;
      
      const rx = Math.floor(Math.random() * width);
      const rz = Math.floor(Math.random() * length);
      
      const volScale = settings.volumeScale || 1.0;

      activeRipples.push({
          x: rx, z: rz, age: 0, 
          intensity: Math.min(size * 0.01 * volScale, 2.0) 
      });
  }
  
  function processTradeSonar(side: string, price: number, size: number) {
      const width = settings.gridWidth || 80;
      const length = settings.gridLength || 160;
      
      const rx = Math.floor(Math.random() * width);
      const rz = Math.floor(Math.random() * length);
      
      const volScale = settings.volumeScale || 1.0;
      // Scale life/intensity by volume
      const intensity = Math.min(1.0 + Math.log10(size+1) * 0.2 * volScale, 2.0);

      sonarBlips.push({x: rx, z: rz, life: intensity});
  }
  
  function updateAtmosphere(side: string) {
      // Add to history
      tradeHistory.push(side);
      if (side === 'buy') buyCount++; else sellCount++;
      
      if (tradeHistory.length > tradeHistorySize) {
          const removed = tradeHistory.shift();
          if (removed === 'buy') buyCount--; else sellCount--;
      }
      
      // Calculate Ratio (-1.0 to 1.0)
      const total = buyCount + sellCount;
      if (total === 0) return;
      
      const ratio = (buyCount - sellCount) / total; 
      
      if (settings.enableAtmosphere) {
          if (ratio > 0.1) {
              targetAtmosphere.copy(colorUp).multiplyScalar(0.3 * ratio); 
          } else if (ratio < -0.1) {
              targetAtmosphere.copy(colorDown).multiplyScalar(0.3 * Math.abs(ratio));
          } else {
               targetAtmosphere.setHex(0x000000);
          }
      } else {
          targetAtmosphere.setHex(0x000000);
      }
  }
  
  let avgPrice = 0; 

  function getTradeColors(side: string, price: number): THREE.Color {
    const mode = settings.colorMode;
    
    if (mode === "custom") {
      return side === "buy" 
        ? new THREE.Color(settings.customColorUp)
        : new THREE.Color(settings.customColorDown);
    }
    
    if (mode === "interactive") {
      if (avgPrice === 0) avgPrice = price;
      avgPrice = avgPrice * 0.99 + price * 0.01;
      
      const trend = price > avgPrice ? "up" : "down";
      return trend === "up" ? colorUp : colorDown;
    }
    
    return side === "buy" ? colorUp : colorDown;
  }

  // ========================================
  // LIFECYCLE HOOKS
  // ========================================

  onMount(() => {
    if (!browser || !container) return;
    
    log(LogLevel.INFO, '🎬 Component mounted, starting initialization...');
    lifecycleState = LifecycleState.INITIALIZING;
    
    const result = initThree();
    performanceMonitor = new PerformanceMonitor("TradeFlowWave");
    performanceMonitor.start(renderer || undefined);
    
    if (!result.success) {
      lifecycleState = LifecycleState.ERROR;
      lifecycleError = result.error || 'apiErrors.generic';
      log(LogLevel.ERROR, '❌ Initialization failed:', lifecycleError);
      return;
    }
    
    updateThemeColors();
    window.addEventListener('resize', onResize);
    
    updateSubscription(tradeState.symbol);
    animate();
    
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
    
    // Initialize lastFlowMode
    lastFlowMode = settings.flowMode;
    
    return () => {
      log(LogLevel.INFO, '🧹 Component unmounting, cleanup triggered');
      cleanup();
    };
  });

  // Re-initialization effect when flow settings change drastically
  $effect(() => {
     if (lifecycleState === LifecycleState.READY && settings.flowMode !== lastFlowMode) {
         log(LogLevel.INFO, `🔄 Flow mode changed: ${lastFlowMode} -> ${settings.flowMode}`);
         lastFlowMode = settings.flowMode;
         
         // Safely update mode uniform
         materials.forEach(m => {
             m.uniforms.uMode.value = getModeId(settings.flowMode);
             m.uniforms.uSize.value = settings.size * 100.0;
         });
         
         // Full reset of scene objects to match new geometry requirements
         initSceneObjects();
         updateCameraPosition();
     }
  });
  
  // Re-init on Grid Size change (expensive, but necessary)
  let lastGridWidth = $state(settings.gridWidth);
  let lastGridLength = $state(settings.gridLength);
  
  $effect(() => {
      if (lifecycleState === LifecycleState.READY && (settings.gridWidth !== lastGridWidth || settings.gridLength !== lastGridLength)) {
          lastGridWidth = settings.gridWidth;
          lastGridLength = settings.gridLength;
          initSceneObjects();
      }
  });

  // Symbol change effect
  $effect(() => {
    if (lifecycleState === LifecycleState.READY && tradeState.symbol) {
      updateSubscription(tradeState.symbol);
      // Reset Atmosphere on symbol change
      tradeHistory = [];
      buyCount = 0;
      sellCount = 0;
      targetAtmosphere.setHex(0x000000);
    }
  });

  // Theme color effect
  $effect(() => {
    if (lifecycleState === LifecycleState.READY) {
      updateThemeColors();
    }
  });

  function updateThemeColors() {
    const style = getComputedStyle(document.body);
    // Use theme colors or fallbacks
    const up = style.getPropertyValue("--color-up").trim() || "#00b894";
    const down = style.getPropertyValue("--color-down").trim() || "#d63031";
    const warn = style.getPropertyValue("--color-warning").trim() || "#fdcb6e";
    
    colorUp.set(up);
    colorDown.set(down);
    colorWarning.set(warn);
  }

  function cleanup() {
    lifecycleState = LifecycleState.DISPOSED;
    stopAnimationLoop();
    
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener('resize', onResize);
    
    if (performanceMonitor) performanceMonitor.stop();
    if (bitunixWs) bitunixWs.unsubscribeTrade(tradeState.symbol);

    if (scene) {
      scene.children.forEach(child => {
        if (child instanceof THREE.Points) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
      });
    }

    if (renderer) {
      renderer.dispose();
      if (container && canvas && container.contains(canvas)) {
        container.removeChild(canvas);
      }
    }
  }
</script>

<div bind:this={container} class="w-full h-full absolute inset-0 -z-10 overflow-hidden pointer-events-none">
    {#if lifecycleState === LifecycleState.ERROR}
        <div class="absolute inset-0 flex items-center justify-center text-red-500 bg-black/50 p-4">
            <p>Background Error: {lifecycleError}</p>
        </div>
    {/if}
</div>

<style>
  div {
    contain: strict; /* Optimization hint */
  }
</style>
