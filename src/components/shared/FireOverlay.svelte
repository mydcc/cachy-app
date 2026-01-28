<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import * as THREE from "three";
    import { fireStore } from "../../stores/fireStore.svelte";
    import { settingsState } from "../../stores/settings.svelte";
    import { fireVertexShader, fireFragmentShader } from "./FireShader";
    import { browser } from "$app/environment";

    let container: HTMLDivElement;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene;
    let camera: THREE.OrthographicCamera;
    let material: THREE.ShaderMaterial;

    const MAX_INSTANCES = 100;
    let mesh: THREE.InstancedMesh;
    const dummy = new THREE.Object3D();

    // Reactive state to hide the whole thing when not needed
    let isActive = $derived(
        settingsState.enableBurningBorders && fireStore.elements.size > 0,
    );

    onMount(() => {
        if (!browser) return;

        // Initialize Three.js
        scene = new THREE.Scene();
        scene.background = null;

        const width = window.innerWidth;
        const height = window.innerHeight;
        camera = new THREE.OrthographicCamera(
            width / -2,
            width / 2,
            height / 2,
            height / -2,
            1,
            1000,
        );
        camera.position.z = 10;

        try {
            renderer = new THREE.WebGLRenderer({
                alpha: true,
                antialias: false,
                premultipliedAlpha: false, // Prevents some "black halo" issues
                stencil: false,
                depth: false,
            });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setClearColor(0x000000, 0);

            // Style the canvas directly
            const canvas = renderer.domElement;
            canvas.style.position = "absolute";
            canvas.style.top = "0";
            canvas.style.left = "0";
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            canvas.style.pointerEvents = "none";
            canvas.style.background = "transparent";

            container.appendChild(canvas);
        } catch (e) {
            console.error("Failed to initialize WebGL for FireOverlay", e);
            return;
        }

        const geometry = new THREE.PlaneGeometry(1, 1);

        // Remove aSize as we now calculate it from modelViewMatrix in the shader
        // This is more robust against attribute sync issues

        material = new THREE.ShaderMaterial({
            vertexShader: fireVertexShader,
            fragmentShader: fireFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uIntensity: { value: 1.0 },
                uThickness: { value: 20.0 },
                uSpeed: { value: 1.0 },
                uTurbulence: { value: 1.0 },
                uScale: { value: 1.1 },
                uMode: { value: 0 }, // 0=Fire, 1=Glow
                uResolution: {
                    value: new THREE.Vector2(
                        window.innerWidth,
                        window.innerHeight,
                    ),
                },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false, // Don't write depth, allows overlap
            depthTest: false,
        });

        mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; // Important for moving instances
        scene.add(mesh);

        // Z-Index -1 to be behind content, or 40 to be above content but below modals
        // User requested "Lower Z-Index" (which might mean behind) or "Below popups".
        // 40 is below popups (50). -1 would be behind card background IF card has partial transparency.
        // Let's stick to 40 for now, but handle overlap via blending.

        const clock = new THREE.Clock();
        let frameId: number;

        const animate = () => {
            frameId = requestAnimationFrame(animate);
            if (!renderer) return;

            // If not active, just clear and skip (or we could stop the loop)
            if (!isActive) {
                renderer.clear();
                return;
            }

            const time = clock.getElapsedTime();
            material.uniforms.uTime.value = time;

            // Settings Mapping
            let baseIntensity = 0.5;
            let baseThickness = 10.0;
            let baseSpeed = 0.5;
            let baseTurbulence = 0.5;
            // The user requested exactly +10% canvas size
            const scaleFactor = 1.1;

            // Mode Switch
            const isGlow = settingsState.borderEffect === "glow";
            const currentMode = isGlow ? 1 : 0;

            // Map settings to shader params
            if (settingsState.burningBordersIntensity === "low") {
                baseIntensity = 0.8;
                baseThickness = 6.0;
            }
            if (settingsState.burningBordersIntensity === "high") {
                baseIntensity = 2.5;
                baseThickness = 14.0;
            }

            // Speed adjustments
            if (settingsState.burningBordersIntensity === "high") {
                baseSpeed = 1.0;
                baseTurbulence = 0.8;
            }

            // Override for Glow Mode
            if (isGlow) {
                baseSpeed *= 0.5; // Slower, smoother pulse
                baseIntensity *= 2.0; // Needs higher base for bloom look
            }

            material.uniforms.uIntensity.value = baseIntensity;
            material.uniforms.uThickness.value = baseThickness;
            material.uniforms.uSpeed.value = baseSpeed;
            material.uniforms.uTurbulence.value = baseTurbulence;
            material.uniforms.uScale.value = scaleFactor;
            material.uniforms.uMode.value = currentMode;

            let i = 0;
            const width = window.innerWidth;
            const height = window.innerHeight;

            const tempColor = new THREE.Color();

            for (const [id, data] of fireStore.elements) {
                if (i >= MAX_INSTANCES) break;

                const { x, y, width: w, height: h, color } = data;

                // Adjust for border padding in Three.js coordinates
                // Set to 40 (20px per side) to barely contain the 14px High thickness
                const padding = 32;
                const planeW = w + padding;
                const planeH = h + padding;

                const cx = x + w / 2 - width / 2;
                const cy = -(y + h / 2 - height / 2);

                dummy.position.set(cx, cy, 0);
                dummy.scale.set(planeW, planeH, 1);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);

                // Set color
                tempColor.set(color || "#ff8800");
                mesh.setColorAt(i, tempColor);

                i++;
            }

            mesh.count = i;
            mesh.instanceMatrix.needsUpdate = true;

            if (mesh.instanceColor) {
                mesh.instanceColor.needsUpdate = true;
            }

            renderer.render(scene, camera);
        };

        animate();

        const handleResize = () => {
            if (!renderer) return;
            const w = window.innerWidth;
            const h = window.innerHeight;
            renderer.setSize(w, h);
            camera.left = w / -2;
            camera.right = w / 2;
            camera.top = h / 2;
            camera.bottom = h / -2;
            camera.updateProjectionMatrix();
        };
        window.addEventListener("resize", handleResize);

        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener("resize", handleResize);
            if (renderer) {
                renderer.dispose();
                renderer.forceContextLoss();
            }
            geometry.dispose();
            material.dispose();
        };
    });
</script>

<div bind:this={container} class="fire-overlay" class:hidden={!isActive}></div>

<style>
    .fire-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 40; /* Below Modals (50) but presumably above content */
        pointer-events: none;
        overflow: hidden;
        background: transparent !important;
    }
    .hidden {
        display: none !important;
    }
</style>
