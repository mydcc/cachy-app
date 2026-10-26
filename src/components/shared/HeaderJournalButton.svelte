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
  import Button from "./Button.svelte";
  import { trackClick, type TrackClickParams } from "../../actions/tracking";
  import { _ } from "../../locales/i18n";
  import { openEntry } from "../../lib/navigation/open-entry";
  import type { Entry } from "../../lib/navigation/entry-points";

  interface Props {
    /** The registry's header placement for the journal destination. */
    entry: Entry;
    /** The two responsive copies the header has always rendered. */
    variant: "mobile" | "desktop";
  }

  let { entry, variant }: Props = $props();

  // The ids below are journal-specific (the onboarding tour targets them), so
  // a second header entry must not be routed through this component. Fail
  // loudly instead of rendering a duplicate id. The one-time read is
  // intentional: the id is the component's identity, not a reactive value.
  // svelte-ignore state_referenced_locally
  if (entry.id !== "journal") {
    throw new Error(
      `HeaderJournalButton renders the journal entry only; got ${entry.id}`,
    );
  }

  let label = $derived($_(entry.labels.label));
  let title = $derived($_(entry.labels.title ?? entry.labels.label));
  // Variant metadata, not destination data: the analytics split between the
  // two breakpoints predates the registry and stays unchanged.
  let track = $derived<TrackClickParams>({
    category: "Navigation",
    action: "Click",
    name: variant === "mobile" ? "ViewJournalMobile" : "ViewJournalDesktop",
  });
</script>

{#if variant === "mobile"}
  <button
    id="journal-toggle-btn"
    class="text-sm md:hidden bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)] font-bold py-2 px-4 rounded-lg"
    title={title}
    onclick={() => openEntry(entry)}
    use:trackClick={track}
  >{label}</button>
{:else}
  <Button
    id="view-journal-btn-desktop"
    variant="accent"
    title={title}
    ariaLabel={label}
    onClick={() => openEntry(entry)}
    track={track}
  >{label}</Button>
{/if}
