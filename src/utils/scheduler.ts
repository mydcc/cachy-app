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
