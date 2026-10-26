<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  Mounted by `+layout.svelte` at the root, not inside `WindowContainer`.
  `.windows-container` creates a stacking context at `--z-window`, so a
  switcher inside it would paint below root-level modal surfaces even with
  its own higher z-index. The host keeps the conditional here so the child
  still snapshots the window list on every open.
-->

<script lang="ts">
  import WindowSwitcher from "./WindowSwitcher.svelte";
  import { windowSwitcherState } from "../../../stores/windowSwitcher.svelte";
</script>

{#if windowSwitcherState.isOpen}
  <WindowSwitcher />
{/if}
