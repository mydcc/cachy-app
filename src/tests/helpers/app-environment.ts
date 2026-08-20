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

/**
 * Stand-in for SvelteKit's `$app/environment` virtual module, used only by the
 * Vitest run.
 *
 * The Vitest config does not load the `sveltekit()` plugin (it pulls in the
 * SSR / route machinery that unit tests never touch); the `$app/environment`
 * alias points here instead. `browser` is pinned per Vitest project via the
 * `VITEST_BROWSER` test env var so it matches exactly what the plugin produced:
 * `false` in the `unit` project, `true` in the `components` project (which
 * resolves with browser conditions).
 */
export const browser = process.env.VITEST_BROWSER === "true";
export const dev = !!import.meta.env.DEV;
export const building = !!import.meta.env.BUILDING;
export const version = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.0.1";