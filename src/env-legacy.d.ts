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

// SvelteKit 3 bridge: the legacy `$env/dynamic/private` module still resolves
// at runtime but no longer ships ambient types. Declared here until env vars
// move to src/env.ts + `$app/env/*` (follow-up item). Do not add new usages.
//
// NOTE: this file must stay free of top-level import/export statements —
// otherwise it becomes a module and the declaration below stops applying
// globally (that is why it lives here instead of in app.d.ts, which ends
// with `export { };`).
declare module "$env/dynamic/private" {
  export const env: Record<string, string | undefined>;
}
