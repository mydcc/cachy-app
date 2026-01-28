import { fireStore } from "../stores/fireStore.svelte";
import { settingsState } from "../stores/settings.svelte";

let idCounter = 0;

export interface BurnOptions {
    intensity?: number;
    color?: string;
    id?: string;
}

export function burn(node: HTMLElement, options: BurnOptions = {}) {
    const id = options.id || `burn-${idCounter++}`;
    
    // Initial registration
    const update = () => {
        if (!settingsState.enableBurningBorders) return;
        
        const rect = node.getBoundingClientRect();
        fireStore.updateElement(id, {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            intensity: options.intensity ?? 1.0,
            color: options.color ?? "#ffaa00"
        });
    };

    // Tracking loop
    let frameId: number;
    const loop = () => {
        update();
        frameId = requestAnimationFrame(loop);
    };

    // Start tracking
    loop();

    return {
        update(newOptions: BurnOptions) {
            options = newOptions;
        },
        destroy() {
            cancelAnimationFrame(frameId);
            fireStore.removeElement(id);
        }
    };
}
