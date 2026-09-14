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

/*
 * Shared Academy tab state. Extracted from the duplicated `activeTab` /
 * `academy_active_tab` logic in AcademyContent.svelte and the
 * `[[lang]]/(seo)/academy/+page.svelte` SEO route — one owner, two users.
 */

import { browser } from "$app/environment";

export type AcademyTab = "chartPatterns" | "candlestickPatterns";

export const ACADEMY_TAB_STORAGE_KEY = "academy_active_tab";

const TABS: AcademyTab[] = ["chartPatterns", "candlestickPatterns"];

function isAcademyTab(value: unknown): value is AcademyTab {
   return typeof value === "string" && (TABS as string[]).includes(value);
}

class AcademyTabsState {
   activeTab = $state<AcademyTab>("chartPatterns");

   constructor() {
      if (!browser) return;
      try {
         const stored = localStorage.getItem(ACADEMY_TAB_STORAGE_KEY);
         if (isAcademyTab(stored)) {
            this.activeTab = stored;
         }
      } catch {
         // Corrupt or unavailable storage — fall back to the default tab.
      }
   }

   setTab(tab: AcademyTab) {
      this.activeTab = tab;
      if (!browser) return;
      try {
         localStorage.setItem(ACADEMY_TAB_STORAGE_KEY, tab);
      } catch {
         // Storage full or blocked — the in-memory tab still works.
      }
   }
}

/** Creates an isolated tab state (one per mounted Academy view). */
export function createAcademyTabs(): AcademyTabsState {
   return new AcademyTabsState();
}

export type { AcademyTabsState };
