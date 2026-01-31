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
 * Copyright (C) 2026 MYDCT
 *
 * Viewport Action
 * Uses IntersectionObserver to detect when a dashboard tile is visible.
 * Signals ActiveTechnicalsManager to pause/resume calculations (Takt 2 optimization).
 */

import { activeTechnicalsManager } from "../services/activeTechnicalsManager.svelte";

export function viewport(node: HTMLElement, symbol: string) {
    let currentSymbol = symbol;
    let isIntersecting = false;

    // Pro-Level: Use rootMargin "200px" to start updating BEFORE the element enters the screen.
    // This ensures data is ready when the user scrolls it into view.
    const observer = new IntersectionObserver((entries) => {
        // We only observe one node, so entries[0] is enough
        const entry = entries[0];
        isIntersecting = entry.isIntersecting;

        if (currentSymbol) {
            activeTechnicalsManager.setSymbolVisibility(currentSymbol, isIntersecting);
        }
    }, {
        rootMargin: "200px"
    });

    if (currentSymbol) {
        observer.observe(node);
    }

    return {
        update(newSymbol: string) {
            if (newSymbol !== currentSymbol) {
                // Cleanup old symbol
                if (currentSymbol) {
                    activeTechnicalsManager.setSymbolVisibility(currentSymbol, false);
                }

                currentSymbol = newSymbol;

                if (currentSymbol) {
                    // Force refresh of observation state for new symbol
                    // Alternatively, we could just manually set visibility if 'isIntersecting' is true
                    // But re-observing is safer to get fresh 'entry'
                    observer.unobserve(node);
                    observer.observe(node);
                }
            }
        },
        destroy() {
            observer.disconnect();
            if (currentSymbol) {
                activeTechnicalsManager.setSymbolVisibility(currentSymbol, false);
            }
        }
    };
}
