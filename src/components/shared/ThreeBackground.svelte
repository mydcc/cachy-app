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

  // Galaxy Parameters from settings
  // We use a derived or effect to react to changes?
  // Since we are inside a component, we can access settingsState directly.

  let container: HTMLDivElement;
  let galaxyMaterial: THREE.ShaderMaterial | null = null;
  let galaxyGeometry: THREE.BufferGeometry | null = null;
  let galaxyPoints: THREE.Points | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let animationId: number | null = null;
  let themeObserver: MutationObserver | null = null;

  // Helper to resolve CSS variables (handles "var(--name)" references)
  // Helper to resolve CSS variables recursively without DOM layout thrashing
  const resolveColor = (varName: string, fallback: string = "#000000"): string => {
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
          const resolvedValue = style.getPropertyValue(innerVar).trim();
          
          if (resolvedValue) {
              return resolveRecursive(resolvedValue, depth + 1);
          } else if (innerFallback) {
              return resolveRecursive(innerFallback, depth + 1);
          }
        }
      }
      
      return trimmed || fallback;
    };

    const initialValue = varName.startsWith("--") ? style.getPropertyValue(varName) : varName;
    const finalColor = resolveRecursive(initialValue, 0);

    // If result is empty or still a var (failed resolve), return fallback
    if (!finalColor || finalColor.startsWith("var(")) return fallback;
    
    return finalColor;
  };

  const getVar = (name: string) => {
      return resolveColor(name);
  };

  function generateGalaxy() {
    if (!scene) return;

    // Dispose old galaxy
    if (galaxyPoints) {
      galaxyGeometry?.dispose();
      galaxyMaterial?.dispose();
      scene.remove(galaxyPoints);
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

    galaxyGeometry = new THREE.BufferGeometry();
    galaxyGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    galaxyGeometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 3));
    galaxyGeometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));

    // Color mixing attribute (determines which outside color to use)
    const colorMixs = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
        colorMixs[i] = Math.random();
    }
    galaxyGeometry.setAttribute("aColorMix", new THREE.BufferAttribute(colorMixs, 1));

    // Colors from Theme
    // We use fallback to "white" for core if undefined to ensure visibility
    let colorInside = new THREE.Color(getVar("--galaxy-stars-core") || "#6366f1");
    let colorOutside = new THREE.Color(getVar("--galaxy-stars-edge") || "#8b5cf6");
    let colorOutside2 = new THREE.Color(getVar("--galaxy-stars-edge-2") || "#8b5cf6");
    let colorOutside3 = new THREE.Color(getVar("--galaxy-stars-edge-3") || "#6366f1");

    // Determine Blending Mode based on Background Brightness
    const bgStr = getVar("--galaxy-bg") || "#0a0e27";
    const bgCol = new THREE.Color(bgStr);
    const isLight = bgCol.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
    const blendingMode = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
    const alphaCutoff = isLight ? 0.6 : 0.2;

    // Shader material
    galaxyMaterial = new THREE.ShaderMaterial({
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
        uAlphaCutoff: { value: alphaCutoff },
      },
      vertexShader: `
                uniform float uTime;
                uniform float uSize;
                uniform float uPixelRatio;
                uniform float uRadius;
                uniform float uBranches;
                uniform float uSpinSpeed;
                uniform float uRandomnessPower;
                uniform float uConcentrationPower;
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
                    float radius = pow(radiusRatio, uConcentrationPower) * uRadius;

                    float branchId = floor(mod(particleId, uBranches));
                    float branchAngle = branchId * (2.0 * PI / uBranches);
                    float spinAngle = uTime * (1.0 - radiusRatio) * uSpinSpeed;
                    float angle = branchAngle + spinAngle;

                    vec3 particlePosition = vec3(cos(angle) * radius, 0.0, sin(angle) * radius);
                    vec3 randomOffset = aRandom * pow(radiusRatio + 0.2, uRandomnessPower);
                    particlePosition += randomOffset;

                    vec4 modelPosition = modelMatrix * vec4(particlePosition, 1.0);
                    vec4 viewPosition = viewMatrix * modelPosition;
                    gl_Position = projectionMatrix * viewPosition;

                    gl_PointSize = uSize * aScale * uPixelRatio * 100.0;
                    gl_PointSize *= (1.0 / -viewPosition.z);

                    vRadiusRatio = radiusRatio;

                    if (aColorMix > 0.66) {
                        vOutsideColor = uColorOutside3;
                    } else if (aColorMix > 0.33) {
                        vOutsideColor = uColorOutside2;
                    } else {
                        vOutsideColor = uColorOutside;
                    }
                }
            `,
      fragmentShader: `
                uniform vec3 uColorInside;
                uniform float uAlphaCutoff;

                varying float vRadiusRatio;
                varying vec3 vOutsideColor;

                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float distanceToCenter = length(uv);
                    if (distanceToCenter > 0.5) discard;

                    float mixStrength = pow(1.0 - vRadiusRatio, 2.0);
                    vec3 color = mix(vOutsideColor, uColorInside, mixStrength);

                    float alpha = 0.1 / distanceToCenter - uAlphaCutoff;
                    alpha = clamp(alpha, 0.0, 1.0);

                    gl_FragColor = vec4(color, alpha);
                }
            `,
    });

    galaxyPoints = new THREE.Points(galaxyGeometry, galaxyMaterial);

    // Apply initial rotation
    const { galaxyRot } = settingsState.galaxySettings;
    galaxyPoints.rotation.set(
        (galaxyRot?.x || 0) * (Math.PI / 180),
        (galaxyRot?.y || 0) * (Math.PI / 180),
        (galaxyRot?.z || 0) * (Math.PI / 180)
    );

    scene.add(galaxyPoints);
  }

  function updateScene() {
      const s = settingsState.galaxySettings;

      // Update Galaxy Rotation (convert degrees to radians)
      if (galaxyPoints) {
          galaxyPoints.rotation.set(
              (s.galaxyRot?.x || 0) * (Math.PI / 180),
              (s.galaxyRot?.y || 0) * (Math.PI / 180),
              (s.galaxyRot?.z || 0) * (Math.PI / 180)
          );
      }

      // Update Camera Position
      if (camera && s.camPos) {
          camera.position.set(s.camPos.x, s.camPos.y, s.camPos.z);
      }

      if (!galaxyMaterial) return;
      galaxyMaterial.uniforms.uSize.value = s.particleSize;
      galaxyMaterial.uniforms.uRadius.value = s.radius;
      galaxyMaterial.uniforms.uBranches.value = s.branches;
      galaxyMaterial.uniforms.uSpinSpeed.value = s.spin;
      galaxyMaterial.uniforms.uRandomnessPower.value = s.randomnessPower;
      galaxyMaterial.uniforms.uConcentrationPower.value = s.concentrationPower;

      // Update colors with resolution
      const accent = resolveColor("--galaxy-stars-core") || "#6366f1";
      const highlight = resolveColor("--galaxy-stars-edge") || "#8b5cf6";
      const highlight2 = resolveColor("--galaxy-stars-edge-2") || "#8b5cf6";
      const highlight3 = resolveColor("--galaxy-stars-edge-3") || "#6366f1";

      galaxyMaterial.uniforms.uColorInside.value.set(accent);
      galaxyMaterial.uniforms.uColorOutside.value.set(highlight);
      galaxyMaterial.uniforms.uColorOutside2.value.set(highlight2);
      galaxyMaterial.uniforms.uColorOutside3.value.set(highlight3);

      // Update Blending & Background
      const bgStr = resolveColor("--galaxy-bg") || "#0a0e27";
      if (scene) scene.background = new THREE.Color(bgStr);

      const bgCol = new THREE.Color(bgStr);
      const isLight = bgCol.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
      const newBlending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
      const newCutoff = isLight ? 0.6 : 0.2;

      if (galaxyMaterial.blending !== newBlending) {
          galaxyMaterial.blending = newBlending;
          galaxyMaterial.needsUpdate = true;
      }

      if (galaxyMaterial.uniforms.uAlphaCutoff) {
          galaxyMaterial.uniforms.uAlphaCutoff.value = newCutoff;
      }
  }

  onMount(() => {
    if (!browser || !container) return;

    // Scene
    scene = new THREE.Scene();
    const bg = resolveColor("--galaxy-bg") || "#0a0e27";
    scene.background = new THREE.Color(bg);

    // Camera
    camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    // Initial position from settings
    const { camPos } = settingsState.galaxySettings;
    camera.position.set(camPos?.x || 4, camPos?.y || 2, camPos?.z || 5);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = false;
    controls.minDistance = 0.1;
    controls.maxDistance = 50;

    // Initial Generation
    generateGalaxy();

    // Animation Loop
    const clock = new THREE.Clock();
    function animate() {
      if (!renderer || !scene || !camera || !controls) return;

      const elapsedTime = clock.getElapsedTime();

      if (galaxyMaterial) {
        galaxyMaterial.uniforms.uTime.value = elapsedTime;
      }

      if (!settingsState.galaxySettings.enableGyroscope) {
          controls.update();
      }
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    }
    animate();

    // Resize Handler
    function onWindowResize() {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (galaxyMaterial) {
            galaxyMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
        }
    }
    window.addEventListener("resize", onWindowResize);

    // Theme Observer
    themeObserver = new MutationObserver(() => {
        updateScene();
    });
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-mode", "style"],
    });

    return () => {
        if (animationId) cancelAnimationFrame(animationId);
        window.removeEventListener("resize", onWindowResize);
        themeObserver?.disconnect();
        controls?.dispose();
        renderer?.dispose();
        galaxyGeometry?.dispose();
        galaxyMaterial?.dispose();
        if (renderer && renderer.domElement && container) {
            container.removeChild(renderer.domElement);
        }
    };
  });

  // Reactivity to settings changes
  let previousStructureKey = "";
  $effect(() => {
      const s = settingsState.galaxySettings;
      // Define a key for properties that require geometry regeneration
      const structureKey = `${s.particleCount}_${s.radius}_${s.branches}_${s.randomness}_${s.randomnessPower}_${s.concentrationPower}`;

      if (structureKey !== previousStructureKey) {
          generateGalaxy();
          previousStructureKey = structureKey;
      }

      // Always update transforms and uniforms
      updateScene();
  });

  // Gyroscope Logic
  let initialOrientation: { alpha: number; beta: number; gamma: number } | null = null;

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
      const r = Math.sqrt(basePos.x ** 2 + basePos.y ** 2 + basePos.z ** 2) || 6;

      // Azimuth (around Y)
      // dAlpha controls rotation around Y axis
      const theta = THREE.MathUtils.degToRad(dAlpha) + Math.atan2(basePos.x, basePos.z);

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
          window.addEventListener("deviceorientation", onDeviceOrientation);
      } else {
          if (controls) controls.enabled = true;
          window.removeEventListener("deviceorientation", onDeviceOrientation);
      }

      return () => {
          window.removeEventListener("deviceorientation", onDeviceOrientation);
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
