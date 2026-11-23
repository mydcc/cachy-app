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

// BUG-0836: no `load` here. With `ssr = false` a server load makes the client
// fetch `/__data.json` on every start, which the service worker cannot serve
// offline, so an offline reload ended on the error page. Nothing on the root
// layout needs server data; add a universal load if that changes, never a
// server one.

export const prerender = false;
export const ssr = false; // Disable SSR to prevent hydration mismatch with theme
