/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { SvelteMap } from "svelte/reactivity";

export interface BurningElement {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    intensity: number;
    color: string;
    layer: 'tiles' | 'windows' | 'modals';
    mode?: 'theme' | 'interactive' | 'custom' | 'classic' | 'glow';
}

class FireStore {
    elements = new SvelteMap<string, BurningElement>();

    // Add or update an element
    updateElement(id: string, data: Partial<BurningElement>) {
        const existing = this.elements.get(id);
        if (existing) {
            // Check for actual changes to avoid redundant reactivity triggers
            let hasChanged = false;
            for (const key in data) {
                if ((data as any)[key] !== (existing as any)[key]) {
                    hasChanged = true;
                    break;
                }
            }
            if (!hasChanged) return;
            this.elements.set(id, { ...existing, ...data });
        } else {
            // New element defaults
            this.elements.set(id, {
                id,
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                intensity: 1.0,
                color: "#ffaa00",
                layer: "tiles",
                ...data
            } as BurningElement);
        }
    }

    removeElement(id: string) {
        this.elements.delete(id);
    }

    clear() {
        this.elements.clear();
    }
}

export const fireStore = new FireStore();
