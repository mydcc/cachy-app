<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { settingsState } from "../../stores/settings.svelte";
    import GalaxyWorker from "./backgrounds/galaxy.worker?worker";
    import { readCssColor, isLightColor } from "../../lib/themeColors";
    import { concreteQuality, retainAutoQuality } from "./backgrounds/qualityController.svelte";
    import { prefersReducedMotion, resolveReducedMotion, subscribeReducedMotion } from "../../lib/three/motion";

    // ========================================
    // STATE MANAGEMENT
    // ========================================
    
    const LifecycleState = {
      IDLE: 'IDLE',
      INITIALIZING: 'INITIALIZING',
      READY: 'READY',
      ERROR: 'ERROR',
      DISPOSED: 'DISPOSED'
    } as const;

    type LifecycleStateType = typeof LifecycleState[keyof typeof LifecycleState];

    let lifecycleState = $state<LifecycleStateType>(LifecycleState.IDLE);
    let container: HTMLDivElement;
    let worker: Worker | null = null;
    let observer: IntersectionObserver | null = null;
    let themeObserver: MutationObserver | null = null;

    // ========================================
    // THEME & COLOR RESOLUTION
    // ========================================

    // CSS-variable resolution lives in `lib/themeColors.ts`.
    function updateColors() {
        if (!worker || lifecycleState !== LifecycleState.READY) return;

        const style = getComputedStyle(document.documentElement);
        const inside = readCssColor("--galaxy-stars-core", "#6366f1", style);
        const out1 = readCssColor("--galaxy-stars-edge", "#8b5cf6", style);
        const out2 = readCssColor("--galaxy-stars-edge-2", "#8b5cf6", style);
        const out3 = readCssColor("--galaxy-stars-edge-3", "#6366f1", style);
        const light = isLightColor(readCssColor("--galaxy-bg", "#0a0e27", style));

        worker.postMessage({
            type: 'updateColors',
            data: {
                inside, out1, out2, out3,
                blending: light ? 1 : 2, // NormalBlending=1, AdditiveBlending=2
                cutoff: light ? 0.6 : 0.2
            }
        });
    }

    // ========================================
    // LIFECYCLE
    // ========================================

    onMount(() => {
        if (!browser || !container) return;
        
        lifecycleState = LifecycleState.INITIALIZING;

        try {
            const canvas = document.createElement("canvas");
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            container.appendChild(canvas);

            const offscreen = canvas.transferControlToOffscreen();
            worker = new GalaxyWorker();
            
            worker.postMessage({
                type: 'init',
                data: {
                    canvas: offscreen,
                    width: window.innerWidth,
                    height: window.innerHeight,
                    pixelRatio: Math.min(window.devicePixelRatio, 2),
                    settings: JSON.parse(JSON.stringify(settingsState.galaxySettings))
                }
            }, [offscreen]);

            lifecycleState = LifecycleState.READY;
            updateColors();

            // Listeners
            window.addEventListener("resize", onWindowResize);
            themeObserver = new MutationObserver(() => updateColors());
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-mode", "style"] });

            observer = new IntersectionObserver(() => {
                // Optimization: Tell worker to pause/resume? (Not implemented in worker yet)
            });
            observer.observe(container);

        } catch (e) {
            console.error("[Galaxy] Worker Init Error:", e);
            lifecycleState = LifecycleState.ERROR;
        }

        return () => {
            window.removeEventListener("resize", onWindowResize);
            if (themeObserver) themeObserver.disconnect();
            if (observer) observer.disconnect();
            worker?.terminate();
            if (container && container.firstChild) container.removeChild(container.firstChild);
        };
    });

    function onWindowResize() {
        if (!worker) return;
        worker.postMessage({
            type: 'resize',
            data: {
                width: window.innerWidth,
                height: window.innerHeight,
                pixelRatio: Math.min(window.devicePixelRatio, 2)
            }
        });
    }

    // Reactivity
    let prevStructureKey = "";
    $effect(() => {
        if (!worker || lifecycleState !== LifecycleState.READY) return;
        const s = settingsState.galaxySettings;
        const key = `${s.particleCount}_${s.randomness}`;
        
        worker.postMessage({
            type: 'updateSettings',
            data: { settings: JSON.parse(JSON.stringify(s)) }
        });

        if (key !== prevStructureKey) {
            worker.postMessage({ type: 'generate' });
            prevStructureKey = key;
        }
    });

    // Quality + reduced motion (see `qualityController` / `lib/three/motion`).
    let systemReducedMotion = $state(prefersReducedMotion());
    $effect(() => subscribeReducedMotion((reduced) => (systemReducedMotion = reduced)));

    $effect(() => {
        if (settingsState.visualQuality !== "auto") return;
        return retainAutoQuality();
    });

    $effect(() => {
        if (!worker || lifecycleState !== LifecycleState.READY) return;
        worker.postMessage({
            type: "quality",
            data: { tier: concreteQuality(settingsState.visualQuality) },
        });
    });

    $effect(() => {
        if (!worker || lifecycleState !== LifecycleState.READY) return;
        worker.postMessage({
            type: "setMotion",
            data: {
                reduced: resolveReducedMotion(
                    settingsState.reduceMotion,
                    systemReducedMotion,
                ),
            },
        });
    });

    // Gyroscope Effect
    $effect(() => {
        if (!browser || !worker) return;
        
        const handleOrientation = (event: DeviceOrientationEvent) => {
            if (event.alpha === null || event.beta === null || event.gamma === null) return;
            worker!.postMessage({
                type: 'gyro',
                data: {
                    alpha: event.alpha,
                    beta: event.beta,
                    gamma: event.gamma
                }
            });
        };
        
        if (settingsState.galaxySettings.enableGyroscope) {
            window.addEventListener('deviceorientation', handleOrientation);
        } else {
            window.removeEventListener('deviceorientation', handleOrientation);
        }
        
        return () => {
            window.removeEventListener('deviceorientation', handleOrientation);
        };
    });
</script>

<div bind:this={container} class="w-full h-full absolute inset-0 overflow-hidden" aria-hidden="true" tabindex="-1"></div>

<style>
    div :global(canvas) { cursor: grab; }
    div :global(canvas:active) { cursor: grabbing; }
</style>
