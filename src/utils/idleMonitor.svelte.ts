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
 * Idle Monitor
 * Detects user inactivity to optimize background processes.
 * Reduces CPU usage when the user is not actively interacting with the app.
 */

import { browser } from "$app/environment";

class IdleMonitor {
    // Reactive state
    isUserIdle = $state(false);
    lastActivity = $state(Date.now());

    private idleTimeout: any = null;
    private readonly IDLE_THRESHOLD = 60000; // 60 seconds

    constructor() {
        if (browser) {
            this.setupListeners();
            this.resetTimer();
        }
    }

    private setupListeners() {
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

        // Throttled event handler to prevent excessive calls
        let throttleTimer: any = null;

        const handleActivity = () => {
            if (throttleTimer) return;

            throttleTimer = setTimeout(() => {
                this.resetTimer();
                throttleTimer = null;
            }, 1000); // Throttle to 1s
        };

        events.forEach(event => {
            window.addEventListener(event, handleActivity, { passive: true });
        });
    }

    private resetTimer() {
        this.isUserIdle = false;
        this.lastActivity = Date.now();

        if (this.idleTimeout) clearTimeout(this.idleTimeout);

        this.idleTimeout = setTimeout(() => {
            this.isUserIdle = true;
        }, this.IDLE_THRESHOLD);
    }
}

export const idleMonitor = new IdleMonitor();
