<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import * as THREE from "three";
  import { settingsState } from "../../../stores/settings.svelte";
  import { tradeState } from "../../../stores/trade.svelte";
  import { bitunixWs } from "../../../services/bitunixWs";
  import { uiState } from "../../../stores/ui.svelte";
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

  // InstancedMesh for City Mode
  let cityMesh: THREE.InstancedMesh | null = null;
  let cityMaterial: THREE.ShaderMaterial | null = null;

  // Data Management
  
  // Persistence State (Equalizer)
  // Key: Grid Index, Value: List of active splashes
  let activeSplashes = new Map<number, { amount: number, expiresAt: number, colorVaue: number }[]>();
  
  // Persistence State (City Mode)
  // Key: Grid Index, Value: Volume
  let cityBuildings = new Map<number, { height: number, targetHeight: number }>();
  
  // Theme & Atmosphere
  let colorUp = new THREE.Color(0x00b894);
  let colorDown = new THREE.Color(0xd63031);
  let colorWarning = new THREE.Color(0xfdcb6e);
  let colorBase = new THREE.Color(0x2d3436); // Neutral Base for City
  
  // Rolling Window for Atmosphere
  const tradeHistorySize = 100;
  let tradeHistory: string[] = []; // 'buy' or 'sell'
  let buyCount = 0;
  let sellCount = 0;
  
  // Current Atmosphere Color (interpolated)
  let currentAtmosphere = new THREE.Color(0x000000);
  let targetAtmosphere = new THREE.Color(0x000000);

  // DIRECT ACCESS: Removed local derived 'settings' to prevent stale state issues.
  // Access settingsState.tradeFlowSettings directly.

  let lastFlowMode = $state(settingsState.tradeFlowSettings.flowMode);

  // Helper Objects for Animation to avoid GC
  const dummy = new THREE.Object3D();
  const _tempColor = new THREE.Color();

  // Golden Block State
  const MAX_BLOCK_POINTS = 5000;
  let blockGeometry: THREE.BufferGeometry | null = null;
  let blockMesh: THREE.InstancedMesh | null = null; 
  let fibonacciPlanes: THREE.Group | null = null;
  let priceSpine: THREE.Mesh | null = null; // Central vertical beam
  let nextBlockIdx = 0;
  let blockMinPrice = Infinity;
  let blockMaxPrice = -Infinity;
  let blockPrices = new Float32Array(MAX_BLOCK_POINTS);
  let blockTimestamps = new Float32Array(MAX_BLOCK_POINTS);
  let blockX = new Float32Array(MAX_BLOCK_POINTS);
  let blockZ = new Float32Array(MAX_BLOCK_POINTS);
  let blockRot = new Float32Array(MAX_BLOCK_POINTS);
  let blockScales = new Float32Array(MAX_BLOCK_POINTS);
  let smoothMin = $state(0);
  let smoothMax = $state(100);
  const fibLevels = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]; // More levels

  // ========================================
  // SHADERS
  // ========================================

  const vertexShader = `
     uniform float uSize;
     uniform float uTime;
     uniform float uMode; // 1=Equalizer, 2=Raindrops, 3=City, 4=Sonar
     uniform float uSpread; // Control grid spacing dynamically
     
     // Grid Params
     uniform float uGridWidth;
     uniform float uGridLength;

     // Raindrops Data (GPU Offloading)
     // x, z, startTime, type (positive=buy, negative=sell, magnitude=intensity)
     uniform vec4 uRipples[50]; 
     uniform float uRippleIntensities[50]; // Still used for base intensity scaling if needed
     
     // Sonar Data
     uniform vec4 uSonarBlips[50]; // x, z, time, intensity (signed for color)
     uniform float uSonarAngle;
     
     // Colors
     uniform vec3 uColorUp;
     uniform vec3 uColorDown;
     
     attribute float amplitude; // Used for Equalizer height
     varying vec3 vColor;
     varying float vHeight; // NEW: Vertical position for gradient
     varying float vExtra; // General purpose varying (used for Sonar intensity/time)
     
     void main() {
       vColor = color;
       vec3 pos = position; // Base grid position
       float pSize = uSize;

       // Apply dynamic spread to X/Z plane to control gap size
       pos.x *= uSpread;
       pos.z *= uSpread;
       
       float h = 0.0;

       // Shared Grid Coordinates
       float rawX = (position.x / 2.0) + (uGridWidth / 2.0);
       float rawZ = (position.z / 2.0) + (uGridLength / 2.0);

       if (uMode == 1.0) { // Equalizer
           // Bar height based on CPU-calculated amplitude attribute
           h = amplitude * 5.0; 
       }
       else if (uMode == 2.0) { // Raindrops V2 (GPU Calculation)
           // Grid Indices logic
           // rawX, rawZ already calculated
           
           vec3 mixedColor = vec3(0.0);
           float totalInfluence = 0.0;
           
           for(int i=0; i<50; i++) {
               // uRipples[i].w holds type (+/-) and encoded intensity
               float typeInfo = uRipples[i].w;
               
               if (abs(typeInfo) > 0.001) {
                   float age = uTime - uRipples[i].z;
                   // Larger volume trades (higher w) last longer? 
                   // Let's keep age fixed but amplitude variable
                   if (age > 0.0 && age < 5.0) {
                       float dx = rawX - uRipples[i].x;
                       float dz = rawZ - uRipples[i].y; // vec3/4 y stores Z for grid
                       float dist = sqrt(dx*dx + dz*dz);
                       
                       float radius = age * 10.0;
                       float distFromWave = abs(dist - radius);
                       
                       if (distFromWave < 3.0) {
                           // Wave Physics
                           // 4.0 is base amplitude, typeInfo scales it
                           float waveAmp = abs(typeInfo); 
                           float decay = exp(-age * 0.8);
                           
                           float wave = cos(distFromWave * 1.0) * decay * waveAmp;
                           
                           // Constructive Interference
                           h += wave;
                           
                           // Color Mixing
                           // Determine color based on sign of w (+ Buy, - Sell)
                           vec3 waveColor = typeInfo > 0.0 ? uColorUp : uColorDown;
                           
                           // Influence drops with distance from wave peak
                           float influence = (1.0 - smoothstep(0.0, 3.0, distFromWave)) * decay;
                           
                           mixedColor += waveColor * influence;
                           totalInfluence += influence;
                           
                           // Shockwave Distortion (Horizontal Displacement)
                           // Move points away from center if near wave front
                           if (distFromWave < 1.0) {
                               vec2 dir = normalize(vec2(dx, dz));
                               float push = (1.0 - distFromWave) * decay * 0.5;
                               pos.x += dir.x * push;
                               pos.z += dir.y * push;
                           }
                       }
                   }
               }
           }
           
           // Apply Color Mixing
           if (totalInfluence > 0.1) {
               vColor = mix(vColor, mixedColor / totalInfluence, min(totalInfluence, 1.0));
               // Sparkle effect for interference
               if (h > 6.0) vColor += vec3(0.2); 
           }
       }
       else if (uMode == 4.0) { // Sonar (GPU) - "Digital Terrain"
           // Iterate blips to find if this point is part of a trade
           
           float maxInt = 0.0;
           float isActive = 0.0;
           float totalInfluence = 0.0;
           
           for(int i=0; i<50; i++) {
               // uSonarBlips: x, z, time, intensity
               float intensity = uSonarBlips[i].w;
               if (abs(intensity) > 0.001) {
                   float dx = rawX - uSonarBlips[i].x;
                   float dz = rawZ - uSonarBlips[i].y; 
                   float dist = sqrt(dx*dx + dz*dz);
                   
                   // Digital Terrain: Gaussian Hill instead of Cone
                   // Width increases slightly with intensity
                   float widthFactor = 0.5 + abs(intensity) * 0.1;
                   float amp = abs(intensity);
                   
                   // Gaussian: exp( -dist^2 / (2*sigma^2) )
                   float hill = exp(-(dist*dist) / (2.0 * widthFactor * widthFactor)) * amp * 3.0; // *3.0 height boost
                   
                   // Only influence if perceptible
                   if (hill > 0.1) {
                        h += hill;
                        
                        // Check if revealed by sonar (Ghost Trail Logic)
                        float cx = uGridWidth / 2.0;
                        float cz = uGridLength / 2.0;
                        float bx = uSonarBlips[i].x - cx;
                        float bz = uSonarBlips[i].y - cz;
                        float blipAngle = atan(bz, bx);
                        if (blipAngle < 0.0) blipAngle += 6.28318; // 2*PI
                        
                        float scanAngle = uSonarAngle;
                        
                        // Calculate Angular Distance BACKWARDS (how long ago scan passed)
                        float angleDiff = scanAngle - blipAngle;
                        // Handle wrapping
                        if (angleDiff < 0.0) angleDiff += 6.28318;
                        if (angleDiff > 6.28318) angleDiff -= 6.28318;
                        
                        // angleDiff is now strictly 0..2PI representing "time since scan"
                        // 0 = Just Scanned (HOT)
                        // PI = Scanned long ago (COLD)
                        
                        // Fade over 1/4 rotation (90 degrees)
                        float fade = exp(-angleDiff * 2.0); 
                        
                        // Base visibility: 0.2 (always visible dim)
                        // Scan boost: up to 1.0 (bright flash)
                        float visibility = 0.1 + fade * 0.9;
                        
                        // Accumulate max intensity for color
                        // We take the "hottest" blip affecting this point
                        float currentInt = intensity * visibility;
                        if (abs(currentInt) > abs(maxInt)) {
                             maxInt = intensity; // Keep sign for color
                             isActive = visibility; // Vis factor
                        }
                   }
               }
           }
           
           if (abs(maxInt) > 0.001) {
                // Set color based on signed intensity
                vColor = maxInt > 0.0 ? uColorUp : uColorDown;
                vExtra = isActive; // Pass visibility trail factor (0.1 to 1.0)
           } else {
                vExtra = 0.0; // Inactive background
           }
       }
 
       pos.y += h; 
       vHeight = pos.y; // Capture height after modification 

       vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
       gl_PointSize = pSize * (300.0 / -mvPosition.z);
       if (uMode == 4.0) gl_PointSize *= 2.0; // Larger points for Sonar
       gl_Position = projectionMatrix * mvPosition;
     }
  `;

  const fragmentShader = `
    uniform vec3 uAtmosphere;
    uniform float uOpacity;
    uniform float uMode;
    uniform float uTime;
    uniform float uSentiment; // NEW: -1.0 to 1.0
    
    // Sonar Params
     uniform vec4 uSonarBlips[50];
     uniform float uSonarAngle;
     uniform float uGridWidth;
     uniform float uGridLength;
    uniform vec3 uColorUp;
    uniform vec3 uColorDown; // Make sure to expose uColorDown
    
    varying vec3 vColor;
    varying float vHeight; // NEW
    varying float vExtra; // General purpose varying (used for Sonar intensity/time)
    
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float alpha = 1.0;
      vec3 finalColor = vColor;

      // Circle shape
      float dist = length(coord);
      if (dist > 0.5) discard;
      alpha = 1.0 - smoothstep(0.4, 0.5, dist);
      
       // --- SONAR LOGIC (PING & REVEAL) ---
       if (uMode == 4.0) {
           // We use vExtra from Vertex Shader to determine if this point is 
           // part of an active blip. 
           // vExtra = 1.0 means active blip, 0.0 means background.
           
           // Background points - faint radar grid (handled in Override section below)
           // This block is just for any pre-processing if needed.
       }
      
      // --- NEW ATMOSPHERE LOGIC ---
      // Directional Lighting + Pulsing
      
      float sentimentIntensity = abs(uSentiment);
      // Heartbeat: 1.0 default, larger amplitude with higher sentiment
      float pulse = 1.0 + sin(uTime * (2.0 + sentimentIntensity * 4.0)) * 0.3 * sentimentIntensity;
      
      vec3 atmos = vec3(0.0);
      
      if (uSentiment > 0.05) {
         // Bullish: Top-Down Light (Green)
         // Gradient from top (y=15) fading down
         float hFactor = smoothstep(-2.0, 15.0, vHeight); 
         atmos = uColorUp * sentimentIntensity * hFactor * 0.6;
      } else if (uSentiment < -0.05) {
         // Bearish: Bottom-Up Light (Red / Magma)
         // Gradient from bottom (y=-2) fading up
         float hFactor = 1.0 - smoothstep(-2.0, 8.0, vHeight);
         atmos = uColorDown * sentimentIntensity * hFactor * 0.6;
      }
      
      // Apply Pulse
      atmos *= pulse;
            // --- SONAR FRAGMENT OVERRIDE ---
       if (uMode == 4.0) {
           // Digital Terrain Logic (Ghost Trails)
           // vExtra is visibility factor passed from Vertex shader
           // 0.0 = Background
           // 0.1 - 0.2 = Inactive/Base Visibility (Dim Ghost)
           // 0.2 - 1.0 = Active Trail / Fresh Scan (Bright)
           
           if (vExtra > 0.05) {
               // Active or Ghost Blip
               
               // Intensity Factor: how "hot" is the scan?
               // Normalize 0.1..1.0 range
               float intensity = smoothstep(0.1, 1.0, vExtra);
               
               // Base Color (vColor from vertex is correct Buy/Sell color)
               vec3 baseColor = vColor;
               
               // Hot Color (White Flash)
               vec3 hotColor = vec3(1.0, 1.0, 1.0);
               
               // Mix based on intensity + extra boost
               finalColor = mix(baseColor, hotColor, intensity * 0.7);
               
               // Brightness boost for fresh scans
               finalColor *= (1.0 + intensity * 2.0);
               
               // Alpha also fades slightly for old ghosts
               alpha = 0.6 + intensity * 0.4;
               
           } else {
               // Background points - faint radar grid
               finalColor = vec3(0.1, 0.15, 0.2) * 0.3; // Very dim teal/grey
               alpha = 0.2;
           }
       } else {
           // Add to base color (additive) for other modes
           finalColor += atmos; 
           alpha *= uOpacity;
       }
       
       gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  // Shader for City Instanced Mesh (V2: Hologram Scanner)
  const cityVertexShader = `
      varying vec3 vColor;
      varying vec3 vPos;
      
      uniform float uTime;
      
      void main() {
          vColor = instanceColor;
          
          // instanceMatrix handles position and scaling (height)
          vec4 worldPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vPos = worldPosition.xyz;
          
          gl_Position = projectionMatrix * worldPosition;
      }
  `;
  
  const cityFragmentShader = `
      ... // (unchanged)
  `;

  const blockVertexShader = `
      varying vec3 vColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vAge;
      
      attribute float aAge;

      void main() {
          vColor = instanceColor;
          vUv = uv;
          vAge = aAge;
          
          // Compute normal in view space
          // For InstancedMesh, we need to apply instanceMatrix to normal
          vNormal = normalize(normalMatrix * (instanceMatrix * vec4(normal, 0.0)).xyz);
          
          vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
          vec4 mvPosition = modelViewMatrix * worldPosition;
          vViewPosition = -mvPosition.xyz;
          
          gl_Position = projectionMatrix * mvPosition;
      }
  `;

  const blockFragmentShader = `
      varying vec3 vColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vAge;
      
      uniform float uTime;
      
      void main() {
          // Circle/Slab Shape - subtle rounding
          vec2 centeredUv = vUv * 2.0 - 1.0;
          float dist = max(abs(centeredUv.x), abs(centeredUv.y));
          
          // Fresnel (Glow Edges)
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 1.5);
          
          // Digital Grid
          vec2 gridUv = vUv * 5.0;
          vec2 grid = abs(fract(gridUv - 0.5) - 0.5) / fwidth(gridUv);
          float gridLine = 1.0 - smoothstep(0.0, 0.08, min(grid.x, grid.y));
          
          // Scannline effect
          float scanline = sin(vUv.y * 100.0 + uTime * 5.0) * 0.1 + 0.9;
          
          vec3 finalColor = vColor;
          
          // Edge Highlights
          finalColor += vColor * fresnel * 2.0;
          
          // Grid & Scanlines
          finalColor *= (0.8 + gridLine * 0.4);
          finalColor *= scanline;
          
          // Additive glow on edges
          finalColor += vec3(0.5, 0.5, 0.5) * gridLine * fresnel;
          
          // Opacity logic:
          // Base opacity 0.4
          // Fresnel boost up to +0.4
          // vAge fade out (vAge is 0..1, where >0.8 starts fading)
          float alpha = (0.4 + fresnel * 0.4);
          
          if (vAge > 0.8) {
              alpha *= (1.0 - (vAge - 0.8) / 0.2);
          }
          
          gl_FragColor = vec4(finalColor, alpha);
      }
  `;

  // ... (createShaderMaterial, createCityMaterial, etc. unchanged) ...

   function animateCity(time: number, s: any) {
       if (!cityMesh) return;
       
       let needsUpdate = false;
       const width = s.gridWidth || 80;
       const length = s.gridLength || 160;
       
       const duration = s.persistenceDuration || 60; 
       // Calculate decay to reach ~1% height after duration at 60fps
       // decay^frames = 0.01  =>  decay = 0.01^(1/frames)
       const frames = duration * 60;
       const decaySpeed = Math.pow(0.01, 1 / frames);
       
       for (const [idx, building] of cityBuildings) {
            // Decay Logic
            if (building.height > 0.1) {
                building.height *= decaySpeed; 
                
                // Color Decay: Lerp back to colorBase
                // Also slower lerp to match height decay
                if (building.targetHeight > 0) {
                     cityMesh.getColorAt(idx, _tempColor);
                     // Very subtle fade back to grey
                     _tempColor.lerp(colorBase, 0.02); 
                     cityMesh.setColorAt(idx, _tempColor);
                }
                
            } else {
                building.height = 0;
                cityBuildings.delete(idx);
                // Reset to pure base color
                cityMesh.setColorAt(idx, colorBase);
            }
            needsUpdate = true;
            
            // ... (Matrix update unchanged) ...
            const rz = idx % length;
            const rx = Math.floor(idx / length);
            
            const px = (rx / width - 0.5) * width * 2.0; 
            const pz = (rz / length - 0.5) * length * 2.0;

            dummy.position.set(px, building.height / 2, pz); 
            dummy.scale.set(1, Math.max(0.1, building.height), 1);
            dummy.updateMatrix();
            
            cityMesh.setMatrixAt(idx, dummy.matrix);
       }
       
       if (needsUpdate) {
           cityMesh.instanceMatrix.needsUpdate = true;
           if (cityMesh.instanceColor) cityMesh.instanceColor.needsUpdate = true;
       }
   }

  // ========================================
  // GEOMETRY GENERATION
  // ========================================

  function createShaderMaterial() {
      return new THREE.ShaderMaterial({
          uniforms: {
              uSize: { value: settingsState.tradeFlowSettings.size * 15.0 },
              uTime: { value: 0.0 },
              uMode: { value: getModeId(settingsState.tradeFlowSettings.flowMode) }, 
              uAtmosphere: { value: new THREE.Color(0x000000) },
              uSentiment: { value: 0.0 }, // NEW
              uOpacity: { value: 1.0 },
              uSpread: { value: 1.0 },
              uGridWidth: { value: settingsState.tradeFlowSettings.gridWidth },
              uGridLength: { value: settingsState.tradeFlowSettings.gridLength },
              // Raindrops (Vector4 for V2)
              uRipples: { value: rippleData }, // Array of vec4
              // Sonar
              uSonarBlips: { value: sonarData },
              uSonarAngle: { value: 0.0 },
              uColorUp: { value: colorUp },
              uColorDown: { value: colorDown }
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
          vertexColors: true,
          transparent: true,
          depthWrite: false, 
          blending: THREE.AdditiveBlending
      });
  }
  
  function createCityMaterial() {
      return new THREE.ShaderMaterial({
          uniforms: {
              uTime: { value: 0.0 },
              uAtmosphere: { value: new THREE.Color(0x000000) },
              uSentiment: { value: 0.0 }, // NEW
              uColorUp: { value: colorUp },
              uColorDown: { value: colorDown }
          },
          vertexShader: cityVertexShader,
          fragmentShader: cityFragmentShader,
          vertexColors: true
      });
  }

  function getModeId(mode: string): number {
      switch (mode) {
          case 'equalizer': return 1.0;
          case 'raindrops': return 2.0;
          case 'city': return 3.0; // Handled by dual-system now
          case 'sonar': return 4.0;
          default: return 1.0;
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

              // Grid layouts
              x = (u - 0.5) * width * 2.0; 
              z = (v - 0.5) * length * 2.0;
              y = 0; 
              
              // Only simple grid for Points.
              // We rely on Shader for Spread.

              positions[ 3 * k ] = x;
              positions[ 3 * k + 1 ] = y;
              positions[ 3 * k + 2 ] = z;

              // Initial Colors
              const baseIntensity = 0.1;
              const intensity = (Math.random() * 0.1) + baseIntensity; 
              
              // Base color - shader will mix on top
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

  // GPU Uniform Data (Raindrops V2)
  const MAX_RIPPLES = 50;
  // Vector4: x, z, startTime, type (signed magnitude)
  let rippleData: THREE.Vector4[] = new Array(MAX_RIPPLES).fill(null).map(() => new THREE.Vector4()); 
  let rippleIntensities = new Float32Array(MAX_RIPPLES); // intensity (Optional now, mostly in w)
  let nextRippleIdx = 0;
  // GPU Uniform Data  // Sonar Data
  const MAX_SONAR_BLIPS = 50; // Increased
  let sonarData = new Float32Array(MAX_SONAR_BLIPS * 4); // x, z, time, intensity
  let nextSonarIdx = 0;
  let sonarAngle = 0;
  
  function initSceneObjects() {
      if (!scene) return;
      
      while(scene.children.length > 0){ 
          scene.remove(scene.children[0]); 
      }
      pointclouds = [];
      materials = [];
      activeSplashes.clear();
      cityBuildings.clear();
      cityMesh = null;
      blockMesh = null;
      priceSpine = null;
      fibonacciPlanes = null;

      // Reset GPU Data Arrays (Vector4 for Ripples)
      rippleData = new Array(MAX_RIPPLES).fill(null).map(() => new THREE.Vector4(0,0,0,0));
      rippleIntensities.fill(0);
      nextRippleIdx = 0;
      
      sonarData = new Float32Array(MAX_SONAR_BLIPS * 4);
      nextSonarIdx = 0;

      const width = settingsState.tradeFlowSettings.gridWidth || 80;
      const length = settingsState.tradeFlowSettings.gridLength || 160;
      const c = colorUp; // Base color

      // 1. Point Cloud (Default for Equalizer, Raindrops, Sonar)
      if (settingsState.tradeFlowSettings.flowMode !== 'city' && settingsState.tradeFlowSettings.flowMode !== 'block') {
          const geometry = generatePointCloudGeometry(c, width, length, settingsState.tradeFlowSettings.flowMode);
          const material = createShaderMaterial();
          const pc = new THREE.Points(geometry, material);
          pc.scale.set(1, 1, 1); 
          pc.position.set(0, -2, 0); 
          scene.add(pc);
          pointclouds.push(pc);
          materials.push(material);
      } 
      
      // 3. Golden Block Mode (New Particle System)
      if (settingsState.tradeFlowSettings.flowMode === 'block') {
          initBlock();
      }
      
      // 2. City Mode (InstancedMesh) - Only if selected
      if (settingsState.tradeFlowSettings.flowMode === 'city') {
          const count = width * length;
          const boxGeo = new THREE.BoxGeometry(1.5, 1, 1.5); // Slightly smaller than grid 2.0 to have gaps
          const boxMat = createCityMaterial();
          
          cityMesh = new THREE.InstancedMesh(boxGeo, boxMat, count);
          cityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          
          const dummy = new THREE.Object3D();
          const color = new THREE.Color();
          
          let i = 0; 
          for (let x = 0; x < width; x++) {
              for (let z = 0; z < length; z++) {
                   const px = (x / width - 0.5) * width * 2.0; 
                   const pz = (z / length - 0.5) * length * 2.0;
                   
                   dummy.position.set(px, 0, pz);
                   dummy.scale.set(1, 0.1, 1); // Flat initially
                   dummy.updateMatrix();
                   cityMesh.setMatrixAt(i, dummy.matrix);
                   
                   // Base Color = Neutral Base (colorBase)
                   // Slightly vary it for texture
                   const intensity = Math.random() * 0.1 + 0.9;
                   color.copy(colorBase).multiplyScalar(intensity); 
                   cityMesh.setColorAt(i, color);
                   
                   i++;
              }
          }
          
          cityMesh.position.set(0, -2, 0);
          scene.add(cityMesh);
      }
  }

  function initBlock() {
      if (!scene) return;

      const s = settingsState.tradeFlowSettings;
      
      // 1. InstancedMesh "Glass Slabs"
      const slabGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0); 
      
      const slabMat = new THREE.ShaderMaterial({
          uniforms: {
              uTime: { value: 0.0 }
          },
          vertexShader: blockVertexShader,
          fragmentShader: blockFragmentShader,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexColors: true,
          extensions: { derivatives: true }
      });
      
      const count = MAX_BLOCK_POINTS;
      const mesh = new THREE.InstancedMesh(slabGeo, slabMat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      
      // Initialize Attributes
      const ages = new Float32Array(count);
      mesh.geometry.setAttribute('aAge', new THREE.InstancedBufferAttribute(ages, 1));
      
      const dummyObj = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
          dummyObj.position.set(0, -9999, 0); 
          dummyObj.updateMatrix();
          mesh.setMatrixAt(i, dummyObj.matrix);
          mesh.setColorAt(i, new THREE.Color(0x000000));
      }
      
      blockMesh = mesh;
      scene.add(blockMesh);
      
      // 2. Central Price Spine (The Core)
      const spineGeo = new THREE.CylinderGeometry(0.2, 0.2, 100, 32);
      const spineMat = new THREE.MeshBasicMaterial({
          color: colorWarning,
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending
      });
      priceSpine = new THREE.Mesh(spineGeo, spineMat);
      scene.add(priceSpine);

      // 3. Fibonacci Laser Planes (Compact)
      const group = new THREE.Group();
      const planeGeo = new THREE.PlaneGeometry(1, 1); 
      
      const planeMat = new THREE.MeshBasicMaterial({
          color: colorWarning, 
          transparent: true,
          opacity: 0.1, 
          side: THREE.DoubleSide,
          depthWrite: false, 
          blending: THREE.AdditiveBlending
      });
      
      fibLevels.forEach(level => {
          const plane = new THREE.Mesh(planeGeo, planeMat.clone());
          plane.rotation.x = -Math.PI / 2;
          plane.userData = { ratio: level }; 
          
          // Rectangular Laser Border
          const borderGeo = new THREE.PlaneGeometry(1, 1);
          const borderMat = new THREE.MeshBasicMaterial({
              color: colorWarning,
              transparent: true,
              opacity: 0.8,
              blending: THREE.AdditiveBlending,
              side: THREE.DoubleSide,
              wireframe: true // Looks like a wireframe/laser frame
          });
          const border = new THREE.Mesh(borderGeo, borderMat);
          // Slightly larger to avoid Z-fighting
          border.position.z = 0.01; 
          plane.add(border);

          group.add(plane);
      });
      
      fibonacciPlanes = group;
      if (scene) scene.add(fibonacciPlanes);
      
      // Reset State
      nextBlockIdx = 0;
      blockMinPrice = Infinity;
      blockMaxPrice = -Infinity;
      blockPrices.fill(0);
      blockTimestamps.fill(0);
      blockX.fill(0);
      blockZ.fill(0);
      blockRot.fill(0);
      blockScales.fill(1);
      smoothMin = 0;
      smoothMax = 100;
      
      log(LogLevel.INFO, '🏗️ Block Mode Initialized');
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  function initThree(): { success: boolean; error?: string } {
    try {
      log(LogLevel.INFO, '🚀 Starting Three.js initialization (GPU Mode)...');
      
      const width = container.clientWidth;
      const height = container.clientHeight;

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera( 45, width / height, 1, 10000 );
      updateCameraPosition();
      camera.updateMatrix();

      renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
      renderer.setPixelRatio( window.devicePixelRatio );
      renderer.setSize( width, height );
      renderer.domElement.style.pointerEvents = 'none'; 
      container.appendChild( renderer.domElement );
      canvas = renderer.domElement;
      
      initSceneObjects();

      // Add Basic Lighting for 3D Modes (Monolith/City)
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);
      
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
      dirLight.position.set(100, 100, 100);
      scene.add(dirLight);

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
  
  function updateCameraPosition() {
      if (!camera) return;
      const s = settingsState.tradeFlowSettings;
      
      if (s.flowMode === 'sonar' && (!s.cameraHeight || s.cameraHeight === 80)) {
          camera.position.set( 0, 30, 0.1 ); 
          camera.lookAt( 0, 0, 0 );
      } else {
          const width = s.gridWidth || 80;
          const length = s.gridLength || 160;
          
          const y = s.cameraHeight || (Math.max(width, length) * 0.4);
          const z = s.cameraDistance || (Math.max(width, length) * 0.5);
          const x = s.cameraPositionX || 0;
          
          camera.position.set( x, y, z ); 
          
          const hasManualRot = (s.cameraRotationX || 0) !== 0 || (s.cameraRotationY || 0) !== 0 || (s.cameraRotationZ || 0) !== 0;

          if (hasManualRot) {
              camera.rotation.set(
                  (s.cameraRotationX || 0) * Math.PI / 180,
                  (s.cameraRotationY || 0) * Math.PI / 180,
                  (s.cameraRotationZ || 0) * Math.PI / 180
              );
          } else {
              if(scene) camera.lookAt( 0, 0, 0 );
          }
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

  let lastFrameTime = 0;
  const targetFPS = 60; // Upgraded to 60 for GPU smoothness
  const frameInterval = 1000 / targetFPS;

  function animate() {
      if (!scene || !camera || !renderer) return;

      rafId = requestAnimationFrame(animate);

      const now = performance.now();
      const elapsed = now - lastFrameTime;

      if (elapsed < frameInterval) return;

      lastFrameTime = now - (elapsed % frameInterval);

      const time = now * 0.001;
      const s = settingsState.tradeFlowSettings; // ... inside animate() loop ...
      // Update Uniforms
      materials.forEach(mat => {
          mat.uniforms.uTime.value = time;
          mat.uniforms.uAtmosphere.value.copy(currentAtmosphere);
          mat.uniforms.uSentiment.value = currentSentiment; // NEW
          mat.uniforms.uSize.value = s.size * 15.0; 
          if (mat.uniforms.uSpread) mat.uniforms.uSpread.value = s.spread || 1.0;
          
          // FORCE UPDATE OF ARRAYS
          // Three.js uniforms need explicit reassignment or flagged updates for arrays sometimes
          if (s.flowMode === 'raindrops') {
              mat.uniforms.uRipples.value = rippleData;
              // mat.uniforms.uRippleIntensities.value = rippleIntensities; // No longer needed for V2
          }
           if (s.flowMode === 'sonar') {
               mat.uniforms.uSonarBlips.value = sonarData; // Vec4 array
               // mat.uniforms.uSonarIntensities.value = sonarIntensities; // Removed
                const sweepSpeed = (s.speed || 1.0) * 0.5;
                mat.uniforms.uSonarAngle.value = (time * sweepSpeed) % (Math.PI * 2);
           }
      });
      
      // Update Block Material Uniforms
      if (blockMesh && blockMesh.material && (blockMesh.material as THREE.ShaderMaterial).uniforms) {
          (blockMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
      }

      // Update City Material Uniforms
      if (cityMesh && cityMesh.material && (cityMesh.material as THREE.ShaderMaterial).uniforms) {
          (cityMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
          (cityMesh.material as THREE.ShaderMaterial).uniforms.uAtmosphere.value.copy(currentAtmosphere);
          (cityMesh.material as THREE.ShaderMaterial).uniforms.uSentiment.value = currentSentiment; // NEW
      }

      // Update Dynamic Atmosphere Logic (Smooth Transition)
      if (s.enableAtmosphere) {
          currentSentiment = currentSentiment + (targetSentiment - currentSentiment) * 0.05;
      } else {
          currentSentiment = 0.0;
      }

      // CPU-Side Animations
      if (s.flowMode === 'equalizer') {
          animatePersistence(time, s);
      } else if (s.flowMode === 'city') {
          animateCity(time, s); 
      } else if (s.flowMode === 'block') {
          animateBlock(time, s);
      }
      // Sonar is now fully GPU


      renderer.render( scene, camera );
      if (performanceMonitor) performanceMonitor.update();
  }
  
  function animateBlock(time: number, s: any) {
      if (!blockMesh || !fibonacciPlanes || !priceSpine) return;
      
      const now = performance.now() * 0.001;
      const duration = s.persistenceDuration || 60;
      
      // Rotate for architecture feeling
      const rot = time * 0.05;
      blockMesh.rotation.y = rot;
      priceSpine.rotation.y = rot;
      fibonacciPlanes.rotation.y = rot;

      // 1. Recalculate Range from ACTIVE trades only
      let activeMin = Infinity;
      let activeMax = -Infinity;
      
      for (let i = 0; i < MAX_BLOCK_POINTS; i++) {
          const rawPrice = blockPrices[i];
          const age = now - blockTimestamps[i];
          
          if (rawPrice > 0 && age < duration) {
              if (rawPrice < activeMin) activeMin = rawPrice;
              if (rawPrice > activeMax) activeMax = rawPrice;
          }
      }
      
      if (activeMin === Infinity || activeMax === -Infinity) { 
          activeMin = smoothMin || (blockMinPrice !== Infinity ? blockMinPrice : 0); 
          activeMax = smoothMax || (blockMaxPrice !== -Infinity ? blockMaxPrice : 100); 
      }
      
      // Dynamic Range PADDING
      let range = activeMax - activeMin;
      if (range < 0.1) range = 0.1;
      activeMin -= range * 0.05;
      activeMax += range * 0.05;
      range = activeMax - activeMin;

      // SMOOTHING (Interpolation)
      const lerpFactor = 0.05; 
      if (smoothMin === 0 && smoothMax === 100) {
          smoothMin = activeMin;
          smoothMax = activeMax;
      } else {
          smoothMin = smoothMin + (activeMin - smoothMin) * lerpFactor;
          smoothMax = smoothMax + (activeMax - smoothMax) * lerpFactor;
      }
      
      const worldHeight = 60.0;
      const heightScale = worldHeight / (smoothMax - smoothMin);
      
      const sizeBase = (s.size || 0.08) * 20.0;
      const slabH = sizeBase * 0.15;

      const ageAttr = blockMesh.geometry.getAttribute('aAge') as THREE.BufferAttribute;
      
      // 2. Update Instance Positions (Y-Axis) - Optimized loop
      for(let i=0; i<MAX_BLOCK_POINTS; i++) {
          const rawPrice = blockPrices[i];
          const timestamp = blockTimestamps[i];
          const age = now - timestamp;
          
          if (rawPrice > 0 && age < duration) {
              const targetY = (rawPrice - smoothMin) * heightScale - (worldHeight / 2.0);
              
              const x = blockX[i];
              const z = blockZ[i];
              const angle = blockRot[i];
              const scaleMag = blockScales[i];
              
              dummy.position.set(x, targetY, z);
              dummy.rotation.y = angle;
              
              const lifePercent = age / duration;
              let currentScale = scaleMag;
              
              // Scale fade (extra visual cue)
              if (lifePercent > 0.8) {
                  const fade = (1.0 - lifePercent) / 0.2;
                  currentScale *= fade;
              }
              
              const slabW = sizeBase * currentScale;
              dummy.scale.set(slabW, slabH, slabW);
              
              dummy.updateMatrix();
              blockMesh.setMatrixAt(i, dummy.matrix);
              
              if (ageAttr) ageAttr.setX(i, lifePercent);
          } else if (rawPrice > 0) {
              // Mark as expired and hide
              dummy.position.set(0, -9999, 0);
              dummy.updateMatrix();
              blockMesh.setMatrixAt(i, dummy.matrix);
              blockPrices[i] = 0; 
              if (ageAttr) ageAttr.setX(i, 0);
          }
      }
      blockMesh.instanceMatrix.needsUpdate = true;
      if (ageAttr) ageAttr.needsUpdate = true;
      
      // 3. Update Fibonacci Planes
      const foundationW = (s.gridWidth || 80) * 0.6; 
      const foundationD = (s.gridLength || 160) * 0.6;
      
      fibonacciPlanes.children.forEach(child => {
          const plane = child as THREE.Mesh;
          const ratio = plane.userData.ratio;
          // Use smooth range
          const targetY = (smoothMin + (smoothMax - smoothMin) * ratio - smoothMin) * heightScale - (worldHeight / 2.0);

          plane.position.y = targetY;
          plane.scale.set(foundationW, foundationD, 1.0);
          
          const mat = plane.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.1 + Math.sin(time * 2.5 + ratio * 5.0) * 0.05;
          mat.color.copy(colorWarning); 
          
          if (plane.children.length > 0) {
              const border = plane.children[0] as THREE.Mesh;
              if (border && border.material) {
                   (border.material as THREE.MeshBasicMaterial).color.copy(colorWarning);
              }
          }
      });

      // 4. Update Spine & Atmosphere
      priceSpine.scale.y = worldHeight / 100.0; 
      priceSpine.position.y = 0; 
      
      const sentimentFactor = (currentSentiment + 1.0) * 0.5;
      _tempColor.copy(colorDown).lerp(colorUp, sentimentFactor);
      
      (priceSpine.material as THREE.MeshBasicMaterial).color.copy(_tempColor);
      (priceSpine.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.abs(currentSentiment) * 0.3; 

      fibonacciPlanes.children.forEach(child => {
          const plane = child as THREE.Mesh;
          const mat = plane.material as THREE.MeshBasicMaterial;
          mat.color.copy(_tempColor);
          if (plane.children.length > 0) {
              const border = plane.children[0] as THREE.Mesh;
              if (border && border.material) {
                   (border.material as THREE.MeshBasicMaterial).color.copy(_tempColor);
              }
          }
      });
  }
  
  function animatePersistence(time: number, s: any) {
      pointclouds.forEach(pc => {
          const attr = pc.geometry.getAttribute('amplitude') as THREE.BufferAttribute;
          if (!attr) return;
          
          let needsUpdate = false;
          
          for (const [idx, splashes] of activeSplashes) {
               const validSplashes = splashes.filter(sp => sp.expiresAt > time);
               
               if (validSplashes.length < splashes.length) {
                   if (validSplashes.length === 0) {
                       activeSplashes.delete(idx);
                       attr.setX(idx, 0); 
                   } else {
                       activeSplashes.set(idx, validSplashes);
                   }
                   needsUpdate = true;
               }
               
               if (validSplashes.length > 0) {
                   let total = 0;
                   for (const sp of validSplashes) {
                      total += sp.amount;
                   }
                   attr.setX(idx, Math.min(total, 15.0));
               }
          }
          
          if (needsUpdate) attr.needsUpdate = true;
      });
  }
  
  

  // animateSonarCPU removed - fully GPU



  // ========================================
  // TRADE HANDLING
  // ========================================

  let hasReceivedRealTrades = false; 
  
  function onTrade(trade: any) {
      if (!hasReceivedRealTrades) {
          hasReceivedRealTrades = true;
          log(LogLevel.INFO, '⚡ First Real Trade Received!', trade);
      }

      const price = parseFloat(trade.p || trade.lastPrice || "0");
      const size = parseFloat(trade.v || trade.volume || "0");
      const side = trade.s === "buy" ? "buy" : "sell";

      if (!price) return;
      
      const s = settingsState.tradeFlowSettings;
      const tradeValue = price * size;

      // Debug Log for skipped trades if needed (comment out for production)
      // if (Math.random() < 0.01) log(LogLevel.DEBUG, 'Trade:', tradeValue);

      if (s.minVolume && tradeValue < s.minVolume) {
          return;
      }

      const mode = s.flowMode;
      if (mode === 'equalizer') {
          processTradeEqualizer(side, price, size, s);
      } else if (mode === 'city') {
          processTradeCity(side, price, size, s);
      } else if (mode === 'raindrops') {
          processTradeRaindrops(side, price, size, s);
      } else if (mode === 'sonar') {
          processTradeSonar(side, price, size, s);
      } else if (mode === 'block') {
          processTradeBlock(side, price, size);
      } else {
          processTradeEqualizer(side, price, size, s);
      }
      
      updateAtmosphere(side);
  }
  
  function processTradeEqualizer(side: string, price: number, size: number, s: any) {
      const width = s.gridWidth || 80;
      const length = s.gridLength || 160;
      
      const tradeValue = price * size; 
      const volScale = s.volumeScale || 1.0;
      
      let intensity = Math.min(volScale * (0.5 + Math.log10(tradeValue + 1)), 5.0);
      const splashCount = Math.max(1, Math.floor(Math.log10(tradeValue+1) * 3));
      
      const now = performance.now() * 0.001;
      const duration = s.persistenceDuration || 60;
      const expiresAt = now + duration;
      
      for(let k=0; k<splashCount; k++) {
          const rx = Math.floor(Math.random() * width);
          const rz = Math.floor(Math.random() * length);
          const idx = rx * length + rz; 
          
          if (idx < (width * length)) {
              const current = activeSplashes.get(idx) || [];
              current.push({ amount: intensity, expiresAt, colorVaue: side === 'buy' ? 1 : 0 });
              activeSplashes.set(idx, current);
              
              if (pointclouds.length > 0 && pointclouds[0].geometry.attributes.color) {
                  const color = getTradeColors(side, price);
                  const attrColor = pointclouds[0].geometry.getAttribute('color') as THREE.BufferAttribute;
                  const attrAmp = pointclouds[0].geometry.getAttribute('amplitude') as THREE.BufferAttribute;
                  
                  if (attrColor && attrAmp) {
                      attrColor.setXYZ(idx, color.r, color.g, color.b);
                      attrColor.needsUpdate = true;
                      
                      let total = 0;
                      for(const sp of current) total += sp.amount;
                      attrAmp.setX(idx, Math.min(total, 15.0));
                      attrAmp.needsUpdate = true;
                  }
              }
          }
      }
  }
  
  function processTradeCity(side: string, price: number, size: number, s: any) {
      if (!cityMesh) return;
      const width = s.gridWidth || 80;
      const length = s.gridLength || 160;
      
      const rx = Math.floor(Math.random() * width);
      const rz = Math.floor(Math.random() * length);
      const idx = rx * length + rz;
      
      const volScale = s.volumeScale || 1.0;
      const tradeValue = price * size; 
      
      // Building grows with volume
      const growth = Math.log10(tradeValue + 1) * volScale * 2.0;

      // Update City Data
      const current = cityBuildings.get(idx);
      const newHeight = Math.min((current ? current.height : 0) + growth, 20.0);
      
      cityBuildings.set(idx, { height: newHeight, targetHeight: 0 }); // Target logic simplified
      
      // Flash Color
      const color = getTradeColors(side, price);
      // Brighten it up
      const flashColor = color.clone().multiplyScalar(2.0); 
      cityMesh.setColorAt(idx, flashColor);
      if (cityMesh.instanceColor) cityMesh.instanceColor.needsUpdate = true;
  }
  
  function processTradeRaindrops(side: string, price: number, size: number, s: any) {
      const width = s.gridWidth || 80;
      const length = s.gridLength || 160;
      
      const rx = Math.floor(Math.random() * width);
      // In Three.js grid, Z is the depth.
      const rz = Math.floor(Math.random() * length);
      
      const volScale = s.volumeScale || 1.0;
      const tradeValue = price * size; 
      
      // Calculate Wave Magnitude
      // 1.0 = Base trade, goes up to 5.0 for whales
      const magnitude = Math.min(Math.max(Math.log10(tradeValue + 1) * volScale, 1.0), 8.0);
      
      // Sign determines color in shader:
      // Positive = Buy (Green)
      // Negative = Sell (Red)
      const signedMagnitude = side === 'buy' ? magnitude : -magnitude;
      
      // Update Vector4 Array
      const idx = nextRippleIdx;
      const ripple = rippleData[idx]; // Vector4
      if (ripple) {
          ripple.set(rx, rz, performance.now() * 0.001, signedMagnitude); 
      }
      
      // Only for legacy fallback if shader uses it, but logic moved to W component
      rippleIntensities[idx] = Math.abs(magnitude);

      nextRippleIdx = (nextRippleIdx + 1) % MAX_RIPPLES;
  }
  
  function processTradeSonar(side: string, price: number, size: number, s: any) {
      const width = s.gridWidth || 80;
      const length = s.gridLength || 160;
      
      const rx = Math.floor(Math.random() * width);
      const rz = Math.floor(Math.random() * length);
      
      const volScale = s.volumeScale || 1.0;
      const tradeValue = price * size; 
      // Intensity: Log scale 1..5
      const absIntensity = Math.min(1.0 + Math.log10(tradeValue+1) * 0.5 * volScale, 5.0);
      
      // Encode Side in Sign: Buy (+), Sell (-)
      const signedIntensity = side === 'buy' ? absIntensity : -absIntensity;

      // Update Vector4 Array
      // x, z, time (not currently used for fading but could be), intensity
      const idx = nextSonarIdx;
      // Stride is 4 for vec4
      const ptr = idx * 4;
      
      sonarData[ptr] = rx;
      sonarData[ptr+1] = rz;
      sonarData[ptr+2] = performance.now() * 0.001; // Timestamp
      sonarData[ptr+3] = signedIntensity;
      
      nextSonarIdx = (nextSonarIdx + 1) % MAX_SONAR_BLIPS;
  }

  function processTradeBlock(side: string, price: number, size: number) {
      if (!blockMesh) return;
      
      const idx = nextBlockIdx;
      const s = settingsState.tradeFlowSettings;
      
      // 1. Calculate Rectangular Foundation (Linked to Grid X/Z)
      const volScale = s.volumeScale || 1.0;
      
      const boundX = (s.gridWidth || 80) * 0.5;
      const boundZ = (s.gridLength || 160) * 0.5;
      const spread = (s.spread || 1.0);
      
      const x = (Math.random() - 0.5) * boundX * spread;
      const z = (Math.random() - 0.5) * boundZ * spread;
      const angle = Math.atan2(z, x); 
      
      // Update Price Range
      if (price < blockMinPrice) blockMinPrice = price;
      if (price > blockMaxPrice) blockMaxPrice = price;
      
      // Store in Metadata Arrays
      blockPrices[idx] = price; 
      blockTimestamps[idx] = performance.now() * 0.001; 
      blockX[idx] = x;
      blockZ[idx] = z;
      blockRot[idx] = angle;
      
      // 2. Calculate Scale
      const tradeValue = price * size;
      const sizeBase = (s.size || 0.08) * 20.0;
      
      const volFactor = Math.pow(size, 0.4) * (s.volumeScale || 1.0);
      const scaleMag = Math.max(volFactor, 1.0);
      blockScales[idx] = scaleMag; // Store relative scale
      
      // We don't update matrix here anymore; animateBlock will do it for all active ones.
      
      // 3. Color
      const color = getTradeColors(side, price);
      blockMesh.setColorAt(idx, color);
      
      if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
      
      nextBlockIdx = (nextBlockIdx + 1) % MAX_BLOCK_POINTS;
  }
  
  // Sentiment State
  let currentSentiment = 0.0;
  let targetSentiment = 0.0;
  
  function updateAtmosphere(side: string) {
      tradeHistory.push(side);
      if (side === 'buy') buyCount++; else sellCount++;
      
      if (tradeHistory.length > tradeHistorySize) {
          const removed = tradeHistory.shift();
          if (removed === 'buy') buyCount--; else sellCount--;
      }
      
      const total = buyCount + sellCount;
      if (total === 0) return;
      
      const ratio = (buyCount - sellCount) / total; 
      
      const s = settingsState.tradeFlowSettings;

      if (s.enableAtmosphere) {
          targetSentiment = ratio;
      } else {
          targetSentiment = 0.0;
          currentSentiment = 0.0;
      }
  }
  
  function getTradeColors(side: string, price: number): THREE.Color {
    const s = settingsState.tradeFlowSettings;
    const mode = s.colorMode;
    if (mode === "custom") {
      return side === "buy" 
        ? new THREE.Color(s.customColorUp)
        : new THREE.Color(s.customColorDown);
    }
    return side === "buy" ? colorUp : colorDown;
  }

  // ========================================
  // LIFECYCLE HOOKS
  // ========================================

  let currentSubscriptionSymbol: string | null = null;

  function updateSubscription(newSymbol: string) {
      if (!newSymbol || newSymbol === currentSubscriptionSymbol) return;
      
      // Unsubscribe previous
      if (currentSubscriptionSymbol) {
          log(LogLevel.INFO, '🔌 Unsubscribing trades for:', currentSubscriptionSymbol);
          if (settingsState.apiProvider === 'bitunix') {
              bitunixWs.unsubscribeTrade(currentSubscriptionSymbol, onTrade);
          }
      }
      
      // Subscribe new
      currentSubscriptionSymbol = newSymbol;
      log(LogLevel.INFO, '📡 Subscribing trades for:', newSymbol);
      if (settingsState.apiProvider === 'bitunix') {
          bitunixWs.subscribeTrade(newSymbol, onTrade);
      }
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
      lifecycleError = result.error || 'Unknown error';
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
          if (mat.uniforms.uColorDown) mat.uniforms.uColorDown.value.copy(colorDown);
      });
      
      if (cityMesh && cityMesh.material) {
          const m = cityMesh.material as THREE.ShaderMaterial;
          if (m.uniforms.uColorUp) m.uniforms.uColorUp.value.copy(colorUp);
          if (m.uniforms.uColorDown) m.uniforms.uColorDown.value.copy(colorDown);
      }
  }

  onDestroy(() => {
    log(LogLevel.INFO, '🛑 Cleanup...');
    stopAnimationLoop();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    
    // Unsubscribe from trades
    if (currentSubscriptionSymbol) {
        if (settingsState.apiProvider === 'bitunix') {
            bitunixWs.unsubscribeTrade(currentSubscriptionSymbol, onTrade);
        }
    }
    
    if (scene) {
        scene.traverse((obj) => {
            if (obj instanceof THREE.Points || obj instanceof THREE.InstancedMesh || obj instanceof THREE.Mesh) {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            }
        });
    }
    
    if (renderer) {
        renderer.dispose();
    }
    
    lifecycleState = LifecycleState.DISPOSED;
  });

</script>

<div 
  bind:this={container} 
  class="absolute inset-0 w-full h-full pointer-events-none"
  role="img"
  aria-label="TradeFlow Background Visualization"
></div>

<style>
  /* No styles needed, pure canvas */
</style>
