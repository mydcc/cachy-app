<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  Content view for AcademyWindow (FEAT-0045). Formerly AcademyModal.svelte's
  own template, minus the ModalFrame wrapper it used to render itself
  through -- the window chrome (title bar, close/minimize/maximize, backdrop
  ineligibility) now comes from WindowFrame via the `academy` registry type.

  Tab state lives in `lib/academy/useAcademyTabs.svelte`, the tab bar in
  `AcademyTabs.svelte` — both shared with the `/academy` SEO route.
-->

<script lang="ts">
   import AcademyTabs from "./AcademyTabs.svelte";
   import CandlestickPatternsView from "./CandlestickPatternsView.svelte";
   import ChartPatternsView from "./ChartPatternsView.svelte";
   import { createAcademyTabs } from "../../lib/academy/useAcademyTabs.svelte";

   const tabs = createAcademyTabs();
</script>

<div class="@container flex flex-col h-full min-h-0 min-w-0 p-4 @sm:p-6">
   <AcademyTabs
      activeTab={tabs.activeTab}
      onTabChange={(tab) => tabs.setTab(tab)}
      idPrefix="academy-window"
   />

   <div
      role="tabpanel"
      id="academy-window-panel-{tabs.activeTab}"
      aria-labelledby="academy-window-tab-{tabs.activeTab}"
      class="flex-1 overflow-hidden min-w-0"
   >
      {#if tabs.activeTab === "chartPatterns"}
         <ChartPatternsView />
      {:else}
         <CandlestickPatternsView />
      {/if}
   </div>
</div>
