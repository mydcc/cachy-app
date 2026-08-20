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
 * Stand-in for SvelteKit's `$env/dynamic/private` virtual module, used only by
 * the Vitest run (the `sveltekit()` plugin is not loaded there). Mirrors the
 * plugin's behaviour: a live view of `process.env`.
 *
 * The tests that import this id all mock it via `vi.mock(...)`; the real
 * module exists only so the mocked id resolves.
 */
export const env: Record<string, string | undefined> = process.env;