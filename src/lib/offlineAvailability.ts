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
 * deleted by a deploy. Without this distinction the stale-deployment path
 * would reload the page instead of saying what is going on.
 */

import { get } from "svelte/store";
import { _ } from "../locales/i18n";
import { toastService } from "../services/toastService.svelte";

const OFFLINE_NOTICE_DURATION_MS = 6000;

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Tells the user that a feature has not been loaded while online yet. */
export function reportNotAvailableOffline(): void {
  toastService.warning(get(_)("offline.notCachedYet"), OFFLINE_NOTICE_DURATION_MS);
}

/**
 * A worker script that is not cached yet does not throw from `new Worker()`
 * offline — the failure arrives later as an `error` event, and without a
 * listener the effect keeps an empty canvas. Online errors are left to the
 * caller's existing handling; this only claims the offline case.
 */
export function onWorkerUnavailableOffline(worker: Worker, onUnavailable: () => void): void {
  worker.addEventListener("error", (event) => {
    if (!isBrowserOffline()) return;
    event.preventDefault();
    reportNotAvailableOffline();
    onUnavailable();
  });
}
