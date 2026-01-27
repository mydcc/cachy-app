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

  const getVar = (name: string) => {
    if (typeof getComputedStyle === "undefined") return "#000000";
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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

    // Colors from Theme
    let colorInside = new THREE.Color(getVar("--galaxy-stars-core") || getVar("--color-accent") || "#6366f1");
    let colorOutside = new THREE.Color(getVar("--galaxy-stars-edge") || getVar("--color-text-secondary") || "#8b5cf6");

    // Determine Blending Mode based on Background Brightness
    const bgStr = getVar("--galaxy-bg") || getVar("--color-bg-primary") || "#0a0e27";
    const bgCol = new THREE.Color(bgStr);
    const isLight = bgCol.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
    const blendingMode = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;

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
        uRadius: { value: radius },
        uBranches: { value: branches },
        uSpinSpeed: { value: spin },
        uRandomnessPower: { value: randomnessPower },
        uConcentrationPower: { value: concentrationPower },
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

                attribute vec3 aRandom;
                attribute float aScale;
                varying float vRadiusRatio;

                #define PI 3.14159265359

                void main() {
                    float particleId = float(gl_VertexID);
                    // Use a more stable random input than vertexID if possible, but vertexID is standard here
                    // Passing particleCount as uniform might be needed if we want exact ratio, but fract(id/count) is fine

                    // We need to pass the count or use a large number to avoid patterns?
                    // The original code used JS-injected literal: fract(particleId / ${particleCount}.0)
                    // We can pass it as a uniform or keep injecting it. Injecting is easier for the shader string.

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
                }
            `,
      fragmentShader: `
                uniform vec3 uColorInside;
                uniform vec3 uColorOutside;
                varying float vRadiusRatio;

                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float distanceToCenter = length(uv);
                    if (distanceToCenter > 0.5) discard;

                    float mixStrength = pow(1.0 - vRadiusRatio, 2.0);
                    vec3 color = mix(uColorOutside, uColorInside, mixStrength);

                    float alpha = 0.1 / distanceToCenter - 0.2;
                    alpha = clamp(alpha, 0.0, 1.0);

                    gl_FragColor = vec4(color, alpha);
                }
            `,
    });

    galaxyPoints = new THREE.Points(galaxyGeometry, galaxyMaterial);
    scene.add(galaxyPoints);
  }

  function updateUniforms() {
      if (!galaxyMaterial) return;
      const s = settingsState.galaxySettings;
      galaxyMaterial.uniforms.uSize.value = s.particleSize;
      galaxyMaterial.uniforms.uRadius.value = s.radius;
      galaxyMaterial.uniforms.uBranches.value = s.branches;
      galaxyMaterial.uniforms.uSpinSpeed.value = s.spin;
      galaxyMaterial.uniforms.uRandomnessPower.value = s.randomnessPower;
      galaxyMaterial.uniforms.uConcentrationPower.value = s.concentrationPower;

      // Update colors
      const accent = getVar("--galaxy-stars-core") || getVar("--color-accent") || "#6366f1";
      const highlight = getVar("--galaxy-stars-edge") || getVar("--color-text-secondary") || "#8b5cf6";
      galaxyMaterial.uniforms.uColorInside.value.set(accent);
      galaxyMaterial.uniforms.uColorOutside.value.set(highlight);

      // Update Blending & Background
      const bgStr = getVar("--galaxy-bg") || getVar("--color-bg-primary") || "#0a0e27";
      if (scene) scene.background = new THREE.Color(bgStr);

      const bgCol = new THREE.Color(bgStr);
      const isLight = bgCol.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
      const newBlending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;

      if (galaxyMaterial.blending !== newBlending) {
          galaxyMaterial.blending = newBlending;
          galaxyMaterial.needsUpdate = true;
      }
  }

  onMount(() => {
    if (!browser || !container) return;

    // Scene
    scene = new THREE.Scene();
    const bg = getVar("--galaxy-bg") || getVar("--color-bg-primary") || "#0a0e27";
    scene.background = new THREE.Color(bg);

    // Camera
    // Configs from user code
    const cameraConfigs = {
        compact: { fov: 50, position: [2, 1, 3] as [number, number, number] },
        medium: { fov: 55, position: [3, 1.5, 4] as [number, number, number] },
        full: { fov: 50, position: [4, 2, 5] as [number, number, number] },
    };
    const config = cameraConfigs.full; // Default to full

    camera = new THREE.PerspectiveCamera(
      config.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(...config.position);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = false; // Disable zoom for background by default? User code allowed it (min/max distance).
    // I will keep it enabled but maybe restrict it?
    // "cursor: grab" in styles implies interaction.
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

      controls.update();
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
        updateUniforms();
    });
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-mode", "style"], // style for dynamic changes
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
  $effect(() => {
      // Monitor specific structural changes that require regeneration
      const { particleCount, randomness } = settingsState.galaxySettings;
      // We need to verify if these changed significantly or just pass dependencies?
      // Since this is $effect, it runs when dependencies change.
      // But we want to avoid re-generating on just color/speed changes if handled by updateUniforms.
      // However, `generateGalaxy` uses all props.

      // Let's be simple: Re-generate only if count/randomness change?
      // But `generateGalaxy` injects `particleCount` into shader string.
      // So if `particleCount` changes, we MUST regenerate shader (so regenerate material).

      // If we separate the logic:
      // 1. Structural/Shader-baked params -> generateGalaxy()
      // 2. Uniforms -> updateUniforms()

      // For now, let's just use untrack or check changes?
      // Actually, calling generateGalaxy() is safe enough, it disposes old ones.
      // But we don't want to reset `uTime`.

      // Let's try to optimize:
      // We can check if `particleCount` changed?
      // But we don't have "previous" state easily here without extra vars.

      // Just re-generating is fine for settings tweaks.
      // But wait, `uTime` reset means the galaxy jumps.
      // We should preserve `uTime` or pass it in?
      // The `clock` is external to `galaxyMaterial`.
      // `animate` sets `galaxyMaterial.uniforms.uTime.value = clock.getElapsedTime()`.
      // So if we recreate material, the next frame will set the correct time. No jump (except maybe spin phase).

      // One issue: `generateGalaxy` reads ALL settings.
      // So if I change `spin`, `generateGalaxy` runs?
      // Yes, if I put `settingsState.galaxySettings` in the dependency.
      // To avoid full regen on `spin` change, we can do:

      const s = settingsState.galaxySettings;

      // We can use a tracked state for structural params?
      // or just re-run. The user is in settings, performance is okay.
      // But flashing might occur.

      // Better approach:
      // Use `key` block in parent? No.

      // Let's just call `generateGalaxy()` when structural things change
      // And `updateUniforms()` when others change.

      // But `settingsState.galaxySettings` is a proxy object.
      // Accessing properties creates subscriptions.

      // Let's allow full regeneration for now. It's robust.
      generateGalaxy();
  });

</script>

<div bind:this={container} class="w-full h-full absolute inset-0"></div>

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
