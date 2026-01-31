/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
