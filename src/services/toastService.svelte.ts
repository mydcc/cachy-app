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
 * Dedicated Toast Notification Service
 * Manages transient feedback messages using Svelte 5 Runes.
 */

export type ToastType = "info" | "success" | "warning" | "error";

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
    createdAt: number;
}

class ToastService {
    toasts = $state<Toast[]>([]);
    private timeouts = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly MAX_TOASTS = 50;

    add(message: string, type: ToastType = "info", duration = 3000) {
        const id = crypto.randomUUID();
        const toast: Toast = {
            id,
            message,
            type,
            duration,
            createdAt: Date.now()
        };

        if (this.toasts.length >= this.MAX_TOASTS) {
            const oldest = this.toasts.shift();
            if (oldest) {
                const timeout = this.timeouts.get(oldest.id);
                if (timeout) {
                    clearTimeout(timeout);
                    this.timeouts.delete(oldest.id);
                }
            }
        }

        this.toasts.push(toast);

        if (duration > 0) {
            const timeout = setTimeout(() => {
                this.remove(id);
            }, duration);
            this.timeouts.set(id, timeout);
        }

        return id;
    }

    remove(id: string) {
        this.toasts = this.toasts.filter(t => t.id !== id);
        const timeout = this.timeouts.get(id);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(id);
        }
    }

    destroy() {
        this.toasts = [];
        for (const timeout of this.timeouts.values()) {
            clearTimeout(timeout);
        }
        this.timeouts.clear();
    }

    // Convenience methods
    info(message: string, duration?: number) {
        this.add(message, "info", duration);
    }

    success(message: string, duration?: number) {
        this.add(message, "success", duration);
    }

    warning(message: string, duration?: number) {
        this.add(message, "warning", duration);
    }

    error(message: string, duration = 5000) {
        this.add(message, "error", duration);
    }
}

export const toastService = new ToastService();
