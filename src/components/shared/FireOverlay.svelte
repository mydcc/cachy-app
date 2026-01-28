<script lang="ts">
    import { onMount } from "svelte";
    import * as THREE from "three";
    import { fireStore } from "../../stores/fireStore.svelte";
    import { settingsState } from "../../stores/settings.svelte";
    import { fireVertexShader, fireFragmentShader } from "./FireShader";

    let container: HTMLDivElement;
    let canvas: HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.OrthographicCamera;

    // Max instances
    const MAX_INSTANCES = 100;
    let mesh: THREE.InstancedMesh;
    const dummy = new THREE.Object3D();

    onMount(() => {
        // Initialize Three.js
        scene = new THREE.Scene();

        // Orthographic camera for 1:1 pixel mapping
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

        renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: false, // Performance optimization
            depth: false, // No depth testing needed for overlay
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0); // Transparent clear
        container.appendChild(renderer.domElement);

        // Explicitly set scene background to null for transparency
        scene.background = null;

        // Geometry (Plane)
        // We use a 1x1 plane, which we scale to the element size
        const geometry = new THREE.PlaneGeometry(1, 1);

        // Material (Shader)
        const material = new THREE.ShaderMaterial({
            vertexShader: fireVertexShader,
            fragmentShader: fireFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uColor: {
                    value: new THREE.Color(
                        settingsState.galaxySettings.camPos
                            ? 0xffaa00
                            : 0xffaa00,
                    ),
                }, // Default fallback
                uIntensity: { value: 1.0 },
                uAspectRatio: { value: 1.0 },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        // Instanced Mesh
        mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);

        // Animation Loop
        const clock = new THREE.Clock();
        let frameId: number;

        const animate = () => {
            frameId = requestAnimationFrame(animate);

            if (!settingsState.enableBurningBorders) {
                renderer.clear();
                return;
            }

            const time = clock.getElapsedTime();
            material.uniforms.uTime.value = time;

            // Settings intensity
            let baseIntensity = 1.0;
            if (settingsState.burningBordersIntensity === "low")
                baseIntensity = 0.5;
            if (settingsState.burningBordersIntensity === "high")
                baseIntensity = 2.0;
            material.uniforms.uIntensity.value = baseIntensity;

            // Update Instances
            let i = 0;
            const width = window.innerWidth;
            const height = window.innerHeight;

            // Iterate over store
            for (const [id, data] of fireStore.elements) {
                if (i >= MAX_INSTANCES) break;

                const { x, y, width: w, height: h, color } = data;

                // Convert DOM coordinates (Top-Left 0,0) to Three.js coordinates (Center 0,0)
                const cx = x + w / 2 - width / 2;
                const cy = -(y + h / 2 - height / 2); // Invert Y

                dummy.position.set(cx, cy, 0);

                // Add some padding for the fire to extend outwards
                const padding = 20;
                dummy.scale.set(w + padding, h + padding, 1);

                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);

                // Should also set individual color usage if we want different colors per element
                // For now using global uniform or we need InstancedBufferAttribute for color

                i++;
            }

            mesh.count = i;
            mesh.instanceMatrix.needsUpdate = true;

            renderer.render(scene, camera);
        };

        animate();

        // Resize Handler
        const handleResize = () => {
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
            renderer.dispose();
            geometry.dispose();
            material.dispose();
        };
    });
</script>

<div bind:this={container} class="fire-overlay"></div>

<style>
    .fire-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 9999; /* Very high z-index to be on top */
        pointer-events: none; /* Crucial: Let clicks pass through */
    }
</style>
