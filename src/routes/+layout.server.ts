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

import type { LayoutServerLoad } from "./$types";
import { CONSTANTS } from "../lib/constants";
import { initialTradeState } from "../stores/tradeStore"; // Import initialTradeState

export const prerender = true;
export const ssr = false; // Disable SSR to prevent hydration mismatch with theme

export const load: LayoutServerLoad = async ({ cookies }) => {
  const theme = cookies.get(CONSTANTS.LOCAL_STORAGE_THEME_KEY) || "dark"; // Default to dark if no cookie
  return {
    theme,
    initialTradeState, // Pass initialTradeState to the layout
  };
};
