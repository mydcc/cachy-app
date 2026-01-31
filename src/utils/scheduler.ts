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
 * RAF Scheduler
 * Batches high-frequency updates to sync with the browser's render cycle (RequestAnimationFrame).
 * Prevents "Micro-Stutter" by ensuring state updates happen only once per frame.
 */

import { browser } from "$app/environment";

class FrameScheduler {
    private tasks = new Set<() => void>();
    private scheduled = false;

    /**
     * Schedule a task to run inside the next Animation Frame.
     * Duplicate tasks (by reference) are de-duplicated automatically by Set.
     */
    schedule(task: () => void) {
        this.tasks.add(task);
        if (!this.scheduled && browser) {
            this.scheduled = true;
            requestAnimationFrame(this.flush.bind(this));
        } else if (!browser) {
            // Server-side fallback: run immediately
            task();
        }
    }

    private flush() {
        // Process all pending tasks for this frame
        this.tasks.forEach((task) => {
            try {
                task();
            } catch (e) {
                console.error("[Scheduler] Task failed", e);
            }
        });

        // Clear queue
        this.tasks.clear();
        this.scheduled = false;
    }
}

export const scheduler = new FrameScheduler();
