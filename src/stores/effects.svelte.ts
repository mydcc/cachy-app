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

import type { DuckTriggerEvent } from "../lib/pets/types";

export class EffectsState {
    // FEAT-0257 follow-up: events are queued, not overwritten, so rapid
    // triggers that arrive while FXOverlay's chunk is still loading are
    // all preserved.
    projectileEvents: DOMRect[] = $state([]);
    smashEvents: Array<{ rect: DOMRect; id: string }> = $state([]);

    triggerProjectile(element: HTMLElement) {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        this.projectileEvents = [...this.projectileEvents, rect];
    }

    triggerSmash(element: HTMLElement, id: string) {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        this.smashEvents = [...this.smashEvents, { rect, id }];
    }

    // Consume the oldest event of each queue
    consumeProjectileEvent() {
        this.projectileEvents = this.projectileEvents.slice(1);
    }

    consumeSmashEvent() {
        this.smashEvents = this.smashEvents.slice(1);
    }

    // ─── Duck Events ──────────────────────────────────────────────────────────

    duckEvents: DuckTriggerEvent[] = $state([]);

    triggerDuckEvent(event: DuckTriggerEvent) {
        this.duckEvents = [...this.duckEvents, event];
    }

    consumeDuckEvent() {
        this.duckEvents = this.duckEvents.slice(1);
    }
}

export const effectsState = new EffectsState();
