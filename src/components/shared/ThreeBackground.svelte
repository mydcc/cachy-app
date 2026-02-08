<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { settingsState } from "../../stores/settings.svelte";
    import GalaxyWorker from "./backgrounds/galaxy.worker?worker";

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
    let isVisible = true;

    // ========================================
    // THEME & COLOR RESOLUTION
    // ========================================

    const resolveColor = (varName: string, fallback: string = "#000000"): string => {
        if (!browser) return fallback;
        const style = getComputedStyle(document.documentElement);
        const initialValue = varName.startsWith("--") ? style.getPropertyValue(varName) : varName;
        const trimmed = initialValue.trim();
        if (trimmed.startsWith("var(")) {
             const match = trimmed.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
             if (match) return style.getPropertyValue(match[1]).trim() || match[2] || fallback;
        }
        return trimmed || fallback;
    };

    function updateColors() {
        if (!worker || lifecycleState !== LifecycleState.READY) return;

        const inside = resolveColor("--galaxy-stars-core") || "#6366f1";
        const out1 = resolveColor("--galaxy-stars-edge") || "#8b5cf6";
        const out2 = resolveColor("--galaxy-stars-edge-2") || "#8b5cf6";
        const out3 = resolveColor("--galaxy-stars-edge-3") || "#6366f1";

        const bgStr = resolveColor("--galaxy-bg") || "#0a0e27";
        const bgCol = { r: 0, g: 0, b: 0 }; // Temporary for HSL check
        // We just need to know if it's light/dark. Simplified check:
        const isLight = bgStr.includes("white") || bgStr.includes("#ffffff"); // Real check happens in main thread normally, but let's be more robust:
        
        // Proper HSL check in main thread
        const tempDiv = document.createElement('div');
        tempDiv.style.color = bgStr;
        document.body.appendChild(tempDiv);
        const computed = getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);
        
        const rgb = computed.match(/\d+/g);
        let light = false;
        if (rgb) {
            const r = parseInt(rgb[0]) / 255;
            const g = parseInt(rgb[1]) / 255;
            const b = parseInt(rgb[2]) / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            light = (max + min) / 2 > 0.5;
        }

        worker.postMessage({
            type: 'updateColors',
            data: {
                inside, out1, out2, out3,
                blending: light ? 0 : 2, // NormalBlending=0, AdditiveBlending=2 (approx)
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

            const offscreen = (canvas as any).transferControlToOffscreen();
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

            observer = new IntersectionObserver(([entry]) => {
                isVisible = entry.isIntersecting;
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
</script>

<div bind:this={container} class="w-full h-full absolute inset-0 overflow-hidden" aria-hidden="true" tabindex="-1"></div>

<style>
    div :global(canvas) { cursor: grab; }
    div :global(canvas:active) { cursor: grabbing; }
</style>
