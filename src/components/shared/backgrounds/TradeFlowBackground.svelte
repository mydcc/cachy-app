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
     uniform vec3 uSonarBlips[20]; // x, z, startTime
     uniform float uSonarIntensities[20];
     uniform float uSonarAngle;
     
     // Colors
     uniform vec3 uColorUp;
     uniform vec3 uColorDown;
     
     attribute float amplitude; // Used for Equalizer height
     varying vec3 vColor;
     
     void main() {
       vColor = color;
       vec3 pos = position; // Base grid position
       float pSize = uSize;

       // Apply dynamic spread to X/Z plane to control gap size
       pos.x *= uSpread;
       pos.z *= uSpread;
       
       float h = 0.0;

       if (uMode == 1.0) { // Equalizer
           // Bar height based on CPU-calculated amplitude attribute
           h = amplitude * 5.0; 
       }
       else if (uMode == 2.0) { // Raindrops V2 (GPU Calculation)
           // Grid Indices logic
           float rawX = (position.x / 2.0) + (uGridWidth / 2.0);
           float rawZ = (position.z / 2.0) + (uGridLength / 2.0);
           
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
       else if (uMode == 4.0) { // Sonar (GPU)
           h = 0.0;
       }

       pos.y += h; 

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
    
    // Sonar Params
    uniform vec3 uSonarBlips[20];
    uniform float uSonarIntensities[20];
    uniform float uSonarAngle;
    uniform float uGridWidth;
    uniform float uGridLength;
    uniform vec3 uColorUp;
    
    varying vec3 vColor;
    
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float alpha = 1.0;
      vec3 finalColor = vColor;

      // Circle shape
      float dist = length(coord);
      if (dist > 0.5) discard;
      alpha = 1.0 - smoothstep(0.4, 0.5, dist);
      
      // Mix Atmosphere
      finalColor = finalColor + uAtmosphere * 0.3; 
      alpha *= uOpacity;
      
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
      varying vec3 vColor;
      varying vec3 vPos;
      
      uniform vec3 uAtmosphere;
      uniform float uTime;
      
      void main() {
          vec3 finalColor = vColor;
          
          // Hologram Scanner Effect
          // A light bar moving Up/Down
          float scanSpeed = 2.0; // Slightly faster
          float scanHeight = -2.0 + mod(uTime * scanSpeed, 12.0); // Tighter range
          
          // Distance from scan line
          float dist = abs(vPos.y - scanHeight);
          // Sharp scan line
          float scanIntensity = smoothstep(0.3, 0.0, dist);
          
          // Add scan line additively - brighter cyan
          finalColor += vec3(0.0, 0.8, 1.0) * scanIntensity * 0.8;
          
          // Scanlines (horizontal stripes)
          // Finer lines
          float stripes = sin(vPos.y * 30.0) * 0.5 + 0.5;
          finalColor *= (0.7 + stripes * 0.3); // More contrast
          
          // Atmosphere blend
          finalColor = finalColor + uAtmosphere * 0.2;
          
          gl_FragColor = vec4(finalColor, 1.0);
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
              uOpacity: { value: 1.0 },
              uSpread: { value: 1.0 },
              uGridWidth: { value: settingsState.tradeFlowSettings.gridWidth },
              uGridLength: { value: settingsState.tradeFlowSettings.gridLength },
              // Raindrops (Vector4 for V2)
              uRipples: { value: rippleData }, // Array of vec4
              // Sonar
              uSonarBlips: { value: sonarData },
              uSonarIntensities: { value: sonarIntensities },
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
              uAtmosphere: { value: new THREE.Color(0x000000) }
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

  // GPU Uniform Data (Sonar)
  const MAX_SONAR_BLIPS = 20;
  let sonarData: THREE.Vector3[] = new Array(MAX_SONAR_BLIPS).fill(null).map(() => new THREE.Vector3()); 
  let sonarIntensities = new Float32Array(MAX_SONAR_BLIPS); // Max intensity
  let sonarAngle = 0;
  let nextSonarIdx = 0;
  
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

      // Reset GPU Data Arrays (Vector4 for Ripples)
      rippleData = new Array(MAX_RIPPLES).fill(null).map(() => new THREE.Vector4(0,0,0,0));
      rippleIntensities.fill(0);
      nextRippleIdx = 0;
      
      sonarData = new Array(MAX_SONAR_BLIPS).fill(null).map(() => new THREE.Vector3(0,0,0));
      sonarIntensities.fill(0);
      nextSonarIdx = 0;

      const width = settingsState.tradeFlowSettings.gridWidth || 80;
      const length = settingsState.tradeFlowSettings.gridLength || 160;
      const c = colorUp; // Base color

      // 1. Point Cloud (Default for Equalizer, Raindrops, Sonar)
      if (settingsState.tradeFlowSettings.flowMode !== 'city') {
          const geometry = generatePointCloudGeometry(c, width, length, settingsState.tradeFlowSettings.flowMode);
          const material = createShaderMaterial();
          const pc = new THREE.Points(geometry, material);
          pc.scale.set(1, 1, 1); 
          pc.position.set(0, -2, 0); 
          scene.add(pc);
          pointclouds.push(pc);
          materials.push(material);
      } 
      
      // 2. City Mode (InstancedMesh)
      // V2: Initialize with Neutral Base Color
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
          
          camera.position.set( 0, y, z ); 
          
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
          mat.uniforms.uSize.value = s.size * 15.0; 
          if (mat.uniforms.uSpread) mat.uniforms.uSpread.value = s.spread || 1.0;
          
          // FORCE UPDATE OF ARRAYS
          // Three.js uniforms need explicit reassignment or flagged updates for arrays sometimes
          if (s.flowMode === 'raindrops') {
              mat.uniforms.uRipples.value = rippleData;
              // mat.uniforms.uRippleIntensities.value = rippleIntensities; // No longer needed for V2
          }
          if (s.flowMode === 'sonar') {
              mat.uniforms.uSonarBlips.value = sonarData;
              mat.uniforms.uSonarIntensities.value = sonarIntensities;
               const sweepSpeed = (s.speed || 1.0) * 0.5;
               mat.uniforms.uSonarAngle.value = (time * sweepSpeed) % (Math.PI * 2);
          }
      });
      
      // Update City Material Uniforms
      if (cityMesh && cityMesh.material) {
          (cityMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
          (cityMesh.material as THREE.ShaderMaterial).uniforms.uAtmosphere.value.copy(currentAtmosphere);
      }

      // CPU-Side Animations
      if (s.flowMode === 'equalizer') {
          animatePersistence(time, s);
      } else if (s.flowMode === 'city') {
          animateCity(time, s); 
      } else if (s.flowMode === 'sonar') {
          // Sonar colors still on CPU for now (simple fading)
          animateSonarCPU(time, s); 
      }

      renderer.render( scene, camera );
      if (performanceMonitor) performanceMonitor.update();
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
  
  

  function animateSonarCPU(time: number, s: any) {
      const sweepSpeed = (s.speed || 1.0) * 0.5;
      sonarAngle = (time * sweepSpeed) % (Math.PI * 2);
      
      const width = s.gridWidth || 80;
      const length = s.gridLength || 160;
      const centerX = width / 2;
      const centerZ = length / 2;
      
      pointclouds.forEach(pc => {
          const attr = pc.geometry.getAttribute('color') as THREE.BufferAttribute;
          
          // Optimization: Skip loop if Sonar not active or throttle?
          // Keeping standard loop for visual consistency with legacy
          
          for(let i=0; i<width; i+=2) { 
              for(let j=0; j<length; j+=2) {
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
      const intensity = Math.min(1.0 + Math.log10(tradeValue+1) * 0.2 * volScale, 2.0);

      // Update Vector3 Array
      const idx = nextSonarIdx;
      const blip = sonarData[idx];
      if (blip) {
          blip.set(rx, rz, performance.now() * 0.001);
      }
      
      sonarIntensities[idx] = intensity;
      
      nextSonarIdx = (nextSonarIdx + 1) % MAX_SONAR_BLIPS;
  }
  
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
      });
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
            if (obj instanceof THREE.Points || obj instanceof THREE.InstancedMesh) {
                obj.geometry.dispose();
                (obj.material as THREE.Material).dispose();
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
