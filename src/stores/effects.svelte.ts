/*
  Copyright (C) 2026 MYDCT
*/

export class EffectsState {
    projectileOrigin: DOMRect | null = $state(null);
    smashTarget: { rect: DOMRect; id: string } | null = $state(null);

    triggerProjectile(element: HTMLElement) {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        this.projectileOrigin = rect;
    }

    triggerSmash(element: HTMLElement, id: string) {
        const rect = element.getBoundingClientRect();
        this.smashTarget = { rect, id };
    }

    // Reset after consumption
    consumeProjectileEvent() {
        this.projectileOrigin = null;
    }

    consumeSmashEvent() {
        this.smashTarget = null;
    }

    feedEvent: { amount: number } | null = $state(null);

    triggerFeed(amount: number) {
        this.feedEvent = { amount };
    }

    consumeFeedEvent() {
        this.feedEvent = null;
    }
}

export const effectsState = new EffectsState();
