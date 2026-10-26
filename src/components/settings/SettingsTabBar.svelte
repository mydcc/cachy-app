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
  import TabBar from "./TabBar.svelte";
  import { _ } from "../../locales/i18n";
  import { resolveEntryIcon } from "../../lib/navigation/icons";
  import { openEntry } from "../../lib/navigation/open-entry";
  import {
    getSettingsTabEntries,
    getSettingsTabId,
  } from "../../lib/navigation/settings-tabs";

  interface Props {
    active: string;
    onSelect: (id: string) => void;
  }

  let { active, onSelect }: Props = $props();

  const entries = getSettingsTabEntries();
  const entryByTabId = new Map(
    entries.map((entry) => [getSettingsTabId(entry), entry] as const),
  );

  let tabs = $derived(
    entries.map((entry) => ({
      id: getSettingsTabId(entry),
      label: $_(entry.labels.label),
      icon: resolveEntryIcon(entry.icon),
    })),
  );

  function select(id: string): void {
    const entry = entryByTabId.get(id);
    if (!entry) throw new Error(`Unknown settings tab ${id}`);
    openEntry(entry, { selectTab: onSelect });
  }
</script>

<TabBar {tabs} {active} onSelect={select} ariaLabel={$_("settings.tabs.label")} />
