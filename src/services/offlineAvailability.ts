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
 * FEAT-0265: the UI side of "not available offline yet" — the toast the
 * domain-layer port in `src/lib/offlineAvailability.ts` calls, and the worker
 * listener the three.js backgrounds use.
 */

import { get } from "svelte/store";
import { _ } from "../locales/i18n";
import { isBrowserOffline, reportNotAvailableOffline } from "../lib/offlineAvailability";
import { toastService } from "./toastService.svelte";

const OFFLINE_NOTICE_DURATION_MS = 6000;

export function showNotAvailableOfflineNotice(): void {
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
