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

<script lang="ts">
  import DashboardNav from "../DashboardNav.svelte";
  import { _ } from "../../../locales/i18n";
  import { resolveEntryIcon } from "../../../lib/navigation/icons";
  import {
    getJournalTabEntries,
    getJournalTabId,
  } from "../../../lib/navigation/journal-tabs";
  import { openEntry } from "../../../lib/navigation/open-entry";

  interface Props {
    activePreset: string;
    onselect: (id: string) => void;
  }

  let { activePreset, onselect }: Props = $props();

  const entries = getJournalTabEntries();
  const entryByTabId = new Map(
    entries.map((entry) => [getJournalTabId(entry), entry] as const),
  );

  let presets = $derived(
    entries.map((entry) => ({
      id: getJournalTabId(entry),
      label: $_(entry.labels.label),
      icon: resolveEntryIcon(entry.icon),
    })),
  );

  function selectTab(tabId: string): void {
    const entry = entryByTabId.get(tabId);
    if (!entry) throw new Error(`Unknown journal tab ${tabId}`);
    openEntry(entry, { selectTab: onselect });
  }
</script>

<DashboardNav {activePreset} {presets} onselect={selectTab} />
