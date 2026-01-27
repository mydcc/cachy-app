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
  const resolveColor = (varName: string, fallback: string = "#000000") => {
    if (!browser) return fallback;

    // 1. Get the raw value (might be "var(--other)")
    let val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!val) return fallback;

    // 2. If it's a direct color (hex, rgb, etc) and not a variable reference, return it
    if (!val.startsWith("var(") && !val.includes("var(")) {
        return val;
    }

    // 3. If it is a variable reference, we need the browser to resolve it.
    // We create a temp element, apply the variable as a background, and read the computed rgb.
    try {
        const temp = document.createElement("div");
        temp.style.display = "none";
        temp.style.backgroundColor = `var(${varName})`;
        document.body.appendChild(temp);
        const resolved = getComputedStyle(temp).backgroundColor;
        document.body.removeChild(temp);
        // resolved is usually "rgb(r, g, b)" or "rgba(...)" which Three.js handles
        return resolved || fallback;
    } catch (e) {
        console.warn("[Galaxy] Failed to resolve color:", varName, e);
        return fallback;
    }
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

    // Colors from Theme
    // We use fallback to "white" for core if undefined to ensure visibility
    let colorInside = new THREE.Color(getVar("--galaxy-stars-core") || "#6366f1");
    let colorOutside = new THREE.Color(getVar("--galaxy-stars-edge") || "#8b5cf6");

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

                attribute vec3 aRandom;
                attribute float aScale;
                varying float vRadiusRatio;

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
                }
            `,
      fragmentShader: `
                uniform vec3 uColorInside;
                uniform vec3 uColorOutside;
                uniform float uAlphaCutoff;
                varying float vRadiusRatio;

                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float distanceToCenter = length(uv);
                    if (distanceToCenter > 0.5) discard;

                    float mixStrength = pow(1.0 - vRadiusRatio, 2.0);
                    vec3 color = mix(uColorOutside, uColorInside, mixStrength);

                    float alpha = 0.1 / distanceToCenter - uAlphaCutoff;
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

      // Update colors with resolution
      const accent = resolveColor("--galaxy-stars-core") || "#6366f1";
      const highlight = resolveColor("--galaxy-stars-edge") || "#8b5cf6";

      galaxyMaterial.uniforms.uColorInside.value.set(accent);
      galaxyMaterial.uniforms.uColorOutside.value.set(highlight);

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
    const cameraConfigs = {
        compact: { fov: 50, position: [2, 1, 3] as [number, number, number] },
        medium: { fov: 55, position: [3, 1.5, 4] as [number, number, number] },
        full: { fov: 50, position: [4, 2, 5] as [number, number, number] },
    };
    const config = cameraConfigs.full;

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
  $effect(() => {
      // Accessing settings to trigger updates
      const s = settingsState.galaxySettings;
      // We regenerate on structure changes
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
