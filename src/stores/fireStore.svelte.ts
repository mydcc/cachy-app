import { SvelteMap } from "svelte/reactivity";

export interface BurningElement {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    intensity: number;
    color: string;
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
