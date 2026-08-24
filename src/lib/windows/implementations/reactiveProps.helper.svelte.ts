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
 * Test-only helper (same pattern as marketState.helper.svelte.ts): plain
 * .test.ts files cannot use the $state rune directly, so this rune-compiled
 * module exposes it as a factory. Passing the returned proxy as `props` to
 * mount() lets tests mutate inputs afterwards — the supported way to update
 * a mounted component's props without recreating it.
 */
export function makeReactiveProps<T extends object>(initial: T): T {
    const proxy = $state(initial);
    return proxy;
}
