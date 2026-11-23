/*
 * Copyright (C) 2026 MYDCC
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

/**
 * FEAT-0265: three.js, its workers and the physics engine are cached on first
 * use, not at install. Offline, before that first use, loading them fails —
 * and a failed dynamic import carries the same browser message as a chunk
 * deleted by a deploy. This module lets the domain layer tell the two apart
 * and report the offline case through a port; the UI layer supplies the
 * notice (`src/services/offlineAvailability.ts`, wired in the root layout).
 */

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Until the UI registers its notice, the report still reaches the console. */
let notify: () => void = () => console.warn("A feature is not available offline yet");

export function setOfflineNotifier(notifier: () => void): void {
  notify = notifier;
}

/** Tells the user that a feature has not been loaded while online yet. */
export function reportNotAvailableOffline(): void {
  notify();
}
