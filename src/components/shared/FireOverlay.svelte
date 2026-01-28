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
        const material = new THREE.ShaderMaterial({
            vertexShader: fireVertexShader,
            fragmentShader: fireFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xffaa00) },
                uIntensity: { value: 1.0 },
                uAspectRatio: { value: 1.0 },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        });

        mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);

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

            let baseIntensity = 1.0;
            if (settingsState.burningBordersIntensity === "low")
                baseIntensity = 0.5;
            if (settingsState.burningBordersIntensity === "high")
                baseIntensity = 2.0;
            material.uniforms.uIntensity.value = baseIntensity;

            let i = 0;
            const width = window.innerWidth;
            const height = window.innerHeight;

            for (const [id, data] of fireStore.elements) {
                if (i >= MAX_INSTANCES) break;

                const { x, y, width: w, height: h } = data;
                const cx = x + w / 2 - width / 2;
                const cy = -(y + h / 2 - height / 2);

                dummy.position.set(cx, cy, 0);
                const padding = 20;
                dummy.scale.set(w + padding, h + padding, 1);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
                i++;
            }

            mesh.count = i;
            mesh.instanceMatrix.needsUpdate = true;

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
        z-index: 9999;
        pointer-events: none;
        overflow: hidden;
        background: transparent !important;
    }
    .hidden {
        display: none !important;
    }
</style>
