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
    import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
    import { settingsState } from "../../stores/settings.svelte";

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
        const prefix = '[Galaxy]';
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
      controls: OrbitControls | null;
      galaxyGeometry: THREE.BufferGeometry | null;
      galaxyMaterial: THREE.ShaderMaterial | null;
      galaxyPoints: THREE.Points | null;
      starDustGeometry: THREE.BufferGeometry | null;
      starDustMaterial: THREE.PointsMaterial | null;
      starDustPoints: THREE.Points | null;
    }

    let resources: ThreeResources = {
      scene: null,
      camera: null,
      renderer: null,
      controls: null,
      galaxyGeometry: null,
      galaxyMaterial: null,
      galaxyPoints: null,
      starDustGeometry: null,
      starDustMaterial: null,
      starDustPoints: null
    };

    // ========================================
    // COMPONENT STATE (Legacy - will be migrated to resources)
    // ========================================

    let container: HTMLDivElement;
    let animationId: number | null = null;
    let themeObserver: MutationObserver | null = null;

    // Legacy variables (kept for compatibility during migration)
    let galaxyMaterial: THREE.ShaderMaterial | null = null;
    let galaxyGeometry: THREE.BufferGeometry | null = null;
    let galaxyPoints: THREE.Points | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let controls: OrbitControls | null = null;
    let starDustPoints: THREE.Points | null = null;
    let starDustGeometry: THREE.BufferGeometry | null = null;
    let starDustMaterial: THREE.PointsMaterial | null = null;

    // Helper to resolve CSS variables (handles "var(--name)" references)
    // Helper to resolve CSS variables recursively without DOM layout thrashing
    const resolveColor = (
        varName: string,
        fallback: string = "#000000",
    ): string => {
        if (!browser) return fallback;

        const style = getComputedStyle(document.documentElement);

        const resolveRecursive = (value: string, depth: number): string => {
            if (depth > 5) return value; // Prevent infinite loops
            const trimmed = value.trim();

            // If it points to another variable like "var(--foo)"
            if (trimmed.startsWith("var(--")) {
                // Extract inner variable name: var(--foo) -> --foo
                // Regex handles basic "var(--name)" and "var(--name, fallback)"
                const match = trimmed.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
                if (match) {
                    const innerVar = match[1];
                    const innerFallback = match[2];
                    const resolvedValue = style
                        .getPropertyValue(innerVar)
                        .trim();

                    if (resolvedValue) {
                        return resolveRecursive(resolvedValue, depth + 1);
                    } else if (innerFallback) {
                        return resolveRecursive(innerFallback, depth + 1);
                    }
                }
            }

            return trimmed || fallback;
        };

        const initialValue = varName.startsWith("--")
            ? style.getPropertyValue(varName)
            : varName;
        const finalColor = resolveRecursive(initialValue, 0);

        // If result is empty or still a var (failed resolve), return fallback
        if (!finalColor || finalColor.startsWith("var(")) return fallback;

        return finalColor;
    };

    // Option D: CSS Variable Caching
    let colorCache: Record<string, string> = {};
    const getVar = (name: string) => {
        if (!colorCache[name]) {
            colorCache[name] = resolveColor(name);
        }
        return colorCache[name];
    };

    function updateColorCache() {
        colorCache = {}; // Explicitly clear cache to force re-resolve on next getVar
        updateScene();
    }

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
        return { 
          valid: false, 
          error: `Container has zero dimensions: ${rect.width}x${rect.height}` 
        };
      }
      
      return { valid: true };
    }

    // ========================================
    // RESOURCE CLEANUP
    // ========================================

    function disposeGeometry(geometry: THREE.BufferGeometry | null) {
      if (!geometry) return;
      geometry.dispose();
      log(LogLevel.DEBUG, '🗑️ Geometry disposed');
    }

    function disposeMaterial(material: THREE.Material | null) {
      if (!material) return;
      material.dispose();
      log(LogLevel.DEBUG, '🗑️ Material disposed');
    }

    function disposeRenderer() {
      if (!resources.renderer) return;
      resources.renderer.dispose();
      if (resources.renderer.domElement && container) {
        container.removeChild(resources.renderer.domElement);
      }
      log(LogLevel.DEBUG, '🗑️ Renderer disposed');
    }

    function disposeAll() {
      log(LogLevel.INFO, '🧹 Starting complete cleanup...');
      
      // Stop animation
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      
      // Dispose geometries
      disposeGeometry(resources.galaxyGeometry);
      disposeGeometry(resources.starDustGeometry);
      
      // Dispose materials
      disposeMaterial(resources.galaxyMaterial);
      disposeMaterial(resources.starDustMaterial);
      
      // Remove from scene
      if (resources.scene) {
        if (resources.galaxyPoints) resources.scene.remove(resources.galaxyPoints);
        if (resources.starDustPoints) resources.scene.remove(resources.starDustPoints);
      }
      
      // Dispose controls
      resources.controls?.dispose();
      
      // Dispose renderer
      disposeRenderer();
      
      // Clear resources
      resources = {
        scene: null,
        camera: null,
        renderer: null,
        controls: null,
        galaxyGeometry: null,
        galaxyMaterial: null,
        galaxyPoints: null,
        starDustGeometry: null,
        starDustMaterial: null,
        starDustPoints: null
      };
      
      // Clear legacy variables
      scene = null;
      camera = null;
      renderer = null;
      controls = null;
      galaxyGeometry = null;
      galaxyMaterial = null;
      galaxyPoints = null;
      starDustGeometry = null;
      starDustMaterial = null;
      starDustPoints = null;
      
      lifecycleState = LifecycleState.DISPOSED;
      log(LogLevel.INFO, '✅ Cleanup complete');
    }

    // ========================================
    // GALAXY GENERATION
    // ========================================


    function generateGalaxy() {
        if (!resources.scene) return;

        // Dispose old galaxy
        if (resources.galaxyPoints) {
            resources.galaxyGeometry?.dispose();
            resources.galaxyMaterial?.dispose();
            resources.scene.remove(resources.galaxyPoints);
        }

        const {
            particleCount,
            particleSize,
            radius,
            branches,
            spin,
            randomness,
            randomnessPower,
            concentrationPower,
            rotationSpeed,
        } = settingsState.galaxySettings;

        // Galaxy particle system
        const positions = new Float32Array(particleCount * 3);
        const randoms = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            randoms[i3] = (Math.random() - 0.5) * 2 * randomness;
            randoms[i3 + 1] = (Math.random() - 0.5) * 2 * randomness;
            randoms[i3 + 2] = (Math.random() - 0.5) * 2 * randomness;
            scales[i] = Math.random();
            positions[i3] = positions[i3 + 1] = positions[i3 + 2] = 0;
        }

        resources.galaxyGeometry = new THREE.BufferGeometry();
        resources.galaxyGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3),
        );
        resources.galaxyGeometry.setAttribute(
            "aRandom",
            new THREE.BufferAttribute(randoms, 3),
        );
        resources.galaxyGeometry.setAttribute(
            "aScale",
            new THREE.BufferAttribute(scales, 1),
        );

        // Color mixing attribute (determines which outside color to use)
        const colorMixs = new Float32Array(particleCount);
        for (let i = 0; i < particleCount; i++) {
            colorMixs[i] = Math.random();
        }
        resources.galaxyGeometry.setAttribute(
            "aColorMix",
            new THREE.BufferAttribute(colorMixs, 1),
        );

        // Colors from Theme
        // We use fallback to "white" for core if undefined to ensure visibility
        let colorInside = new THREE.Color(
            getVar("--galaxy-stars-core") || "#6366f1",
        );
        let colorOutside = new THREE.Color(
            getVar("--galaxy-stars-edge") || "#8b5cf6",
        );
        let colorOutside2 = new THREE.Color(
            getVar("--galaxy-stars-edge-2") || "#8b5cf6",
        );
        let colorOutside3 = new THREE.Color(
            getVar("--galaxy-stars-edge-3") || "#6366f1",
        );

        // Determine Blending Mode based on Background Brightness
        const bgStr = getVar("--galaxy-bg") || "#0a0e27";
        const bgCol = new THREE.Color(bgStr);
        const isLight = bgCol.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
        const blendingMode = isLight
            ? THREE.NormalBlending
            : THREE.AdditiveBlending;
        const alphaCutoff = isLight ? 0.6 : 0.2;

        // Shader material
        resources.galaxyMaterial = new THREE.ShaderMaterial({
            depthWrite: false,
            blending: blendingMode,
            vertexColors: true,
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: particleSize },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uColorInside: { value: colorInside },
                uColorOutside: { value: colorOutside },
                uColorOutside2: { value: colorOutside2 },
                uColorOutside3: { value: colorOutside3 },
                uRadius: { value: radius },
                uBranches: { value: branches },
                uSpinSpeed: { value: spin },
                uRandomnessPower: { value: randomnessPower },
                uConcentrationPower: { value: concentrationPower },
                uRotationSpeed: { value: rotationSpeed },
                uAlphaCutoff: { value: alphaCutoff },
            },
            vertexShader: `
                precision mediump float;
                uniform float uTime;
                uniform float uSize;
                uniform float uPixelRatio;
                uniform float uRadius;
                uniform float uBranches;
                uniform float uSpinSpeed;
                uniform float uRandomnessPower;
                uniform float uConcentrationPower;
                uniform float uRotationSpeed;
                uniform vec3 uColorOutside;
                uniform vec3 uColorOutside2;
                uniform vec3 uColorOutside3;

                attribute vec3 aRandom;
                attribute float aScale;
                attribute float aColorMix;

                varying float vRadiusRatio;
                varying vec3 vOutsideColor;

                #define PI 3.14159265359

                void main() {
                    float particleId = float(gl_VertexID);
                    float radiusRatio = fract(particleId / ${particleCount.toFixed(1)});
                    
                    // Dynamische Konzentration für den Kern-Look des Originals
                    float radius = pow(radiusRatio, uConcentrationPower) * uRadius;

                    float branchId = floor(mod(particleId, uBranches));
                    float branchAngle = branchId * (2.0 * PI / uBranches);
                     
                    // Korrekte Spiral-Verzerrung (Spin) basierend auf Radius und Animation Speed
                    float spinAngle = radius * uSpinSpeed + uTime * uRotationSpeed;
                    float angle = branchAngle + spinAngle;

                    vec3 particlePosition = vec3(cos(angle) * radius, 0.0, sin(angle) * radius);
                    
                    // Dynamische Streuung für scharfe Arme (Original-Look)
                    vec3 randomOffset = pow(abs(aRandom), vec3(uRandomnessPower)) * sign(aRandom) * radiusRatio;
                    particlePosition += randomOffset;

                    vec4 modelPosition = modelMatrix * vec4(particlePosition, 1.0);
                    vec4 viewPosition = viewMatrix * modelPosition;
                    gl_Position = projectionMatrix * viewPosition;

                    gl_PointSize = uSize * aScale * uPixelRatio * 100.0;
                    gl_PointSize *= (1.0 / -viewPosition.z);

                    vRadiusRatio = radiusRatio;

                    // Simplified color branch
                    vOutsideColor = uColorOutside;
                    if (aColorMix > 0.66) vOutsideColor = uColorOutside3;
                    else if (aColorMix > 0.33) vOutsideColor = uColorOutside2;
                }
            `,
            fragmentShader: `
                precision mediump float;
                uniform vec3 uColorInside;
                uniform float uAlphaCutoff;

                varying float vRadiusRatio;
                varying vec3 vOutsideColor;

                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float distanceToCenter = length(uv);
                    if (distanceToCenter > 0.5) discard;

                    // Option A: Simplified mixing
                    float mixStrength = (1.0 - vRadiusRatio) * (1.0 - vRadiusRatio);
                    vec3 color = mix(vOutsideColor, uColorInside, mixStrength);

                    float alpha = 0.1 / distanceToCenter - uAlphaCutoff;
                    alpha = clamp(alpha, 0.0, 1.0);
                    
                    // Alpha Clipping for better Performance (Point 3)
                    if (alpha < 0.01) discard;

                    gl_FragColor = vec4(color, alpha);
                }
            `,
        });

        resources.galaxyPoints = new THREE.Points(resources.galaxyGeometry, resources.galaxyMaterial);

        // Apply initial rotation
        const { galaxyRot } = settingsState.galaxySettings;
        resources.galaxyPoints.rotation.set(
            (galaxyRot?.x || 0) * (Math.PI / 180),
            (galaxyRot?.y || 0) * (Math.PI / 180),
            (galaxyRot?.z || 0) * (Math.PI / 180),
        );

        resources.scene.add(resources.galaxyPoints);
        log(LogLevel.DEBUG, '🌌 Galaxy generated');
    }

    function generateStarDust() {
        if (!resources.scene) return;

        // Dispose old dust
        if (resources.starDustPoints) {
            resources.starDustGeometry?.dispose();
            resources.starDustMaterial?.dispose();
            resources.scene.remove(resources.starDustPoints);
        }

        const count = 3000;
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            // Larger radius than galaxy for background depth
            const radius = 10 + Math.random() * 40;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);

            sizes[i] = Math.random() * 2;
        }

        resources.starDustGeometry = new THREE.BufferGeometry();
        resources.starDustGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3),
        );

        resources.starDustMaterial = new THREE.PointsMaterial({
            size: 0.1,
            color: "#ffffff",
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        resources.starDustPoints = new THREE.Points(resources.starDustGeometry, resources.starDustMaterial);
        resources.scene.add(resources.starDustPoints);
    }

    function updateScene() {
        const s = settingsState.galaxySettings;

        // Update Galaxy Rotation (convert degrees to radians)
        if (resources.galaxyPoints) {
            resources.galaxyPoints.rotation.set(
                (s.galaxyRot?.x || 0) * (Math.PI / 180),
                (s.galaxyRot?.y || 0) * (Math.PI / 180),
                (s.galaxyRot?.z || 0) * (Math.PI / 180),
            );
        }

        // Update Camera Position
        if (resources.camera && s.camPos) {
            resources.camera.position.set(s.camPos.x, s.camPos.y, s.camPos.z);
        }

        // Force transparency so CSS gradient shows through
        if (resources.scene) resources.scene.background = null;

        if (!resources.galaxyMaterial) return;
        resources.galaxyMaterial.uniforms.uSize.value = s.particleSize;
        resources.galaxyMaterial.uniforms.uRadius.value = s.radius;
        resources.galaxyMaterial.uniforms.uBranches.value = s.branches;
        resources.galaxyMaterial.uniforms.uSpinSpeed.value = s.spin;
        resources.galaxyMaterial.uniforms.uRandomnessPower.value = s.randomnessPower;
        resources.galaxyMaterial.uniforms.uConcentrationPower.value =
            s.concentrationPower;
        resources.galaxyMaterial.uniforms.uRotationSpeed.value = s.rotationSpeed;

        // Update colors with resolution
        const accent = resolveColor("--galaxy-stars-core") || "#6366f1";
        const highlight = resolveColor("--galaxy-stars-edge") || "#8b5cf6";
        const highlight2 = resolveColor("--galaxy-stars-edge-2") || "#8b5cf6";
        const highlight3 = resolveColor("--galaxy-stars-edge-3") || "#6366f1";

        resources.galaxyMaterial.uniforms.uColorInside.value.set(accent);
        resources.galaxyMaterial.uniforms.uColorOutside.value.set(highlight);
        resources.galaxyMaterial.uniforms.uColorOutside2.value.set(highlight2);
        resources.galaxyMaterial.uniforms.uColorOutside3.value.set(highlight3);

        // Update Blending & Background
        const bgStr = resolveColor("--galaxy-bg") || "#0a0e27";
        // scene.background removed to allow CSS gradient to show
        // if (scene) scene.background = new THREE.Color(bgStr);

        const bgCol = new THREE.Color(bgStr);
        const isLight = bgCol.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
        const newBlending = isLight
            ? THREE.NormalBlending
            : THREE.AdditiveBlending;
        const newCutoff = isLight ? 0.6 : 0.2;

        if (resources.galaxyMaterial.blending !== newBlending) {
            resources.galaxyMaterial.blending = newBlending;
            resources.galaxyMaterial.needsUpdate = true;
        }

        if (resources.galaxyMaterial.uniforms.uAlphaCutoff) {
            resources.galaxyMaterial.uniforms.uAlphaCutoff.value = newCutoff;
        }
        if (resources.galaxyMaterial.uniforms.uAlphaCutoff) {
            resources.galaxyMaterial.uniforms.uAlphaCutoff.value = newCutoff;
        }
    }

    // ========================================
    // INITIALIZATION & ANIMATION
    // ========================================

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
        
        // Camera Setup
        resources.camera = new THREE.PerspectiveCamera(
          50,
          window.innerWidth / window.innerHeight,
          0.1,
          100
        );
        const { camPos } = settingsState.galaxySettings;
        resources.camera.position.set(camPos?.x || 4, camPos?.y || 2, camPos?.z || 5);
        
        // Renderer Setup
        resources.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        resources.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        resources.renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(resources.renderer.domElement);
        
        // Controls
        resources.controls = new OrbitControls(resources.camera, resources.renderer.domElement);
        resources.controls.enableDamping = true;
        resources.controls.enableZoom = false;
        resources.controls.minDistance = 0.1;
        resources.controls.maxDistance = 50;
        
        // Generate Galaxy & StarDust
        generateGalaxy();
        generateStarDust();
        
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

    function animate() {
        if (!resources.renderer || !resources.scene || !resources.camera || !resources.galaxyMaterial) return;

        // Use standard timing if needed, or simple increment
        resources.galaxyMaterial.uniforms.uTime.value += 0.01;

        if (resources.controls) {
            resources.controls.update();
        }

        resources.renderer.render(resources.scene, resources.camera);
        animationId = requestAnimationFrame(animate);
    }

    function onWindowResize() {
        if (!resources.camera || !resources.renderer) return;

        resources.camera.aspect = window.innerWidth / window.innerHeight;
        resources.camera.updateProjectionMatrix();

        resources.renderer.setSize(window.innerWidth, window.innerHeight);
        resources.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        if (resources.galaxyMaterial) {
            resources.galaxyMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
        }
    }

    // ========================================
    // COMPONENT LIFECYCLE
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

        // Event Listeners
        window.addEventListener("resize", onWindowResize);

        // Start Animation
        animate();

        // Theme Observer
        themeObserver = new MutationObserver(() => {
            updateColorCache();
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "data-mode", "style"],
        });

        lifecycleState = LifecycleState.READY;
        log(LogLevel.INFO, '✅ Component ready - State:', lifecycleState);

        // Cleanup
        return () => {
            log(LogLevel.INFO, '🧹 Component unmounting, cleanup triggered');
            if (themeObserver) themeObserver.disconnect();
            window.removeEventListener("resize", onWindowResize);
            disposeAll();
        };
    });

    // Reactivity to settings changes
    let previousStructureKey = "";
    $effect(() => {
        const s = settingsState.galaxySettings;
        // Define a key for properties that require geometry regeneration
        // Only particleCount and randomness need a full regeneration
        const structureKey = `${s.particleCount}_${s.randomness}`;

        if (structureKey !== previousStructureKey) {
            generateGalaxy();
            previousStructureKey = structureKey;
        }

        // Always update transforms and uniforms
        updateScene();
    });

    // Gyroscope Logic
    let initialOrientation: {
        alpha: number;
        beta: number;
        gamma: number;
    } | null = null;

    function onDeviceOrientation(event: DeviceOrientationEvent) {
        if (!camera || !settingsState.galaxySettings.enableGyroscope) return;

        const alpha = event.alpha || 0;
        const beta = event.beta || 0;
        const gamma = event.gamma || 0;

        if (!initialOrientation) {
            initialOrientation = { alpha, beta, gamma };
            return;
        }

        // Calculate deltas
        let dAlpha = alpha - initialOrientation.alpha;
        let dBeta = beta - initialOrientation.beta;

        // Handle wrap-around for alpha
        if (dAlpha > 180) dAlpha -= 360;
        if (dAlpha < -180) dAlpha += 360;

        const basePos = settingsState.galaxySettings.camPos;
        const r =
            Math.sqrt(basePos.x ** 2 + basePos.y ** 2 + basePos.z ** 2) || 6;

        // Azimuth (around Y)
        // dAlpha controls rotation around Y axis
        const theta =
            THREE.MathUtils.degToRad(dAlpha) + Math.atan2(basePos.x, basePos.z);

        // Polar (up/down)
        // dBeta controls elevation
        const phi = THREE.MathUtils.degToRad(dBeta) + Math.acos(basePos.y / r);
        const clampedPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

        const x = r * Math.sin(clampedPhi) * Math.sin(theta);
        const y = r * Math.cos(clampedPhi);
        const z = r * Math.sin(clampedPhi) * Math.cos(theta);

        camera.position.set(x, y, z);
        camera.lookAt(0, 0, 0);
    }

    $effect(() => {
        if (settingsState.galaxySettings.enableGyroscope) {
            if (controls) controls.enabled = false;
            initialOrientation = null;
            // i18n-ignore
            window.addEventListener("deviceorientation", onDeviceOrientation);
        } else {
            if (controls) controls.enabled = true;
            // i18n-ignore
            window.removeEventListener(
                "deviceorientation", // i18n-ignore
                onDeviceOrientation,
            );
        }

        return () => {
            // i18n-ignore
            window.removeEventListener(
                "deviceorientation", // i18n-ignore
                onDeviceOrientation,
            );
        };
    });
</script>

<div
    bind:this={container}
    class="w-full h-full absolute inset-0"
    aria-hidden="true"
    tabindex="-1"
></div>

<style>
    div {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
    }
    div :global(canvas) {
        cursor: grab;
    }
    div :global(canvas:active) {
        cursor: grabbing;
    }
</style>
