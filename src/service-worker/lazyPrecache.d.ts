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

// Served by `lazyPrecachePlugin` (src/config/lazyPrecache.ts): bundle-relative
// paths ("_app/immutable/chunks/<hash>.js") of the files that only a dynamic
// import reaches. Empty in dev.
declare module "virtual:cachy-lazy-precache" {
  export const LAZY_ONLY_FILES: string[];
}
