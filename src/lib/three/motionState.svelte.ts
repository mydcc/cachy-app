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

import { prefersReducedMotion, subscribeReducedMotion } from "./motion";

let reduced = $state(prefersReducedMotion());

if (typeof window !== "undefined") {
  subscribeReducedMotion((value) => {
    reduced = value;
  });
}

/**
 * Reactive OS reduced-motion flag, shared by every renderer. Updates live when
 * the user toggles the system preference; the subscription lives for the
 * lifetime of the app.
 */
export function systemReducedMotion(): boolean {
  return reduced;
}
