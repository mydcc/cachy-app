/*
  Copyright (C) 2026 MYDCT
*/

export class EffectsState {
    projectileOrigin: DOMRect | null = $state(null);

    triggerProjectile(element: HTMLElement) {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        this.projectileOrigin = rect;
    }

    // Reset after consumption
    consumeProjectileEvent() {
        // We might not need this if we just set it to null in the component
        // but it helps to have a clear method.
        this.projectileOrigin = null;
    }
}

export const effectsState = new EffectsState();
