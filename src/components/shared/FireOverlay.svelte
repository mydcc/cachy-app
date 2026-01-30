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
    import { onMount } from "svelte";
    import * as THREE from "three";
    import { fireStore } from "../../stores/fireStore.svelte";
    import { settingsState } from "../../stores/settings.svelte";
    import { modalState } from "../../stores/modal.svelte";
    import { windowManager } from "../../lib/windows/WindowManager.svelte";
    import { fireVertexShader, fireFragmentShader } from "./FireShader";
    import { browser } from "$app/environment";

    let { layer = "tiles" as const, zIndex = 40 } = $props<{
        layer?: "tiles" | "windows" | "modals";
        zIndex?: number;
    }>();

    let container: HTMLDivElement;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene;
    let camera: THREE.OrthographicCamera;
    let material: THREE.ShaderMaterial;

    const MAX_INSTANCES = 100;
    let mesh: THREE.InstancedMesh;
    const dummy = new THREE.Object3D();

    // Reactive state to hide the whole thing when not needed
    let isActive = $derived.by(() => {
        if (!settingsState.enableBurningBorders) return false;

        // Check if ANY modal is open (even if it doesn't have a burning border)
        // This prevents background tiles/windows from burning through transparent modal overlays
        const isAnyModalOpen =
            modalState.state.isOpen ||
            windowManager.isOpen("journal") ||
            windowManager.isOpen("settings") ||
            windowManager.isOpen("guide") ||
            windowManager.isOpen("privacy") ||
            windowManager.isOpen("whitepaper") ||
            windowManager.isOpen("changelog");
        // Note: Academy and MarketDashboard flags are checked from stores if needed,
        // but it seems they might also be windows now. For safety, we remove legacy uiState checks
        // that caused errors. If they are in windowManager, isOpen will catch them if we knew IDs.
        // Assuming typical IDs match legacy names.

        // Track which layers have active elements in the fireStore
        let hasModalElements = false;
        let hasWindowElements = false;
        let hasTileElements = false;

        for (const el of fireStore.elements.values()) {
            if (el.layer === "modals") hasModalElements = true;
            else if (el.layer === "windows") hasWindowElements = true;
            else if (el.layer === "tiles") hasTileElements = true;
        }

        // Priority logic:
        // - 'modals' layer is active if there are modal elements (burning modals).
        // - 'windows' layer is active if windows exist AND no modal is open (checks isAnyModalOpen).
        // - 'tiles' layer is active if tiles exist AND no windows exist AND no modal is open (checks isAnyModalOpen).

        if (layer === "modals") return hasModalElements;

        // If ANY modal is open, suppress lower layers
        if (isAnyModalOpen) return false;

        if (layer === "windows") return hasWindowElements;
        if (layer === "tiles") return hasTileElements && !hasWindowElements;

        return false;
    });

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

        // Initialization of per-instance modes (aMode)
        const modes = new Float32Array(MAX_INSTANCES);
        const modeAttribute = new THREE.InstancedBufferAttribute(modes, 1);
        geometry.setAttribute("aMode", modeAttribute);

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
                baseIntensity = 0.25;
                baseThickness = 6.0;
            }
            if (settingsState.burningBordersIntensity === "high") {
                baseIntensity = 1;
                baseThickness = 14.0;
            }

            // Speed adjustments
            if (settingsState.burningBordersIntensity === "high") {
                baseSpeed = 0.6;
                baseTurbulence = 0.8;
            }

            // Override for Glow Mode
            if (isGlow) {
                baseSpeed *= 0.5; // Slower, smoother pulse
                baseIntensity *= 2.0; // Needs higher base for bloom look
            }

            // Refine constraints for large Modal windows
            if (layer === "modals") {
                baseThickness *= 0.7; // Make the border thinner on large modals to be less overwhelming
            }

            material.uniforms.uIntensity.value = baseIntensity;
            material.uniforms.uThickness.value = baseThickness;
            material.uniforms.uSpeed.value = baseSpeed;
            material.uniforms.uTurbulence.value = baseTurbulence;
            material.uniforms.uScale.value = scaleFactor;

            const modeAttr = geometry.getAttribute(
                "aMode",
            ) as THREE.InstancedBufferAttribute;

            let i = 0;
            const width = window.innerWidth;
            const height = window.innerHeight;

            const tempColor = new THREE.Color();

            for (const [id, data] of fireStore.elements) {
                if (i >= MAX_INSTANCES) break;
                if (data.layer !== layer) continue; // Filter by layer

                const { x, y, width: w, height: h, color } = data;

                const scaleFactor = 1.1; // EXACTLY 10% larger
                const planeW = w * scaleFactor;
                const planeH = h * scaleFactor;

                const cx = x + w / 2 - width / 2;
                const cy = -(y + h / 2 - height / 2);

                dummy.position.set(cx, cy, 0);
                dummy.scale.set(planeW, planeH, 1);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);

                // Set color
                tempColor.set(color || "#ff8800");
                mesh.setColorAt(i, tempColor);

                // Set mode per instance
                let instanceMode = currentMode;
                // If the element has an explicit mode override, use it.
                // 3 is the new 'classic' fire mode.
                if (data.mode === "classic") instanceMode = 3;
                else if (data.mode === "glow") instanceMode = 1;

                modeAttr.setX(i, instanceMode);

                i++;
            }

            modeAttr.needsUpdate = true;

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

<div
    bind:this={container}
    class="fire-overlay"
    class:hidden={!isActive}
    style="z-index: {zIndex};"
></div>

<style>
    .fire-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        overflow: hidden;
        background: transparent !important;
    }
    .hidden {
        display: none !important;
    }
</style>
