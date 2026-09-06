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
  Canonical grid for all settings tabs — the single place that defines how
  settings fields flow into columns. Rules for every consumer:

  1. Columns react to the SETTINGS WINDOW width (container query), never to
     the viewport: 1 column below a 560px-wide settings content, `cols`
     columns at and above it. A narrow window always stays readable.
  2. Exactly one threshold (560px, 3-col variant additionally 960px). Do not
     invent per-tab sm:/md:/lg: breakpoints for column counts.
  3. Items that must stay full width (info cards, danger zone, section-wide
     blocks) use `col-span-full` on the child, not a custom grid.
  4. Flex children inside grid items (inputs, unit suffixes, toggle texts)
     need `min-w-0` (shrinkable) / `shrink-0` (fixed) so narrow columns never
     overflow or overlap — the grid alone does not fix that.
  5. `gap` preserves the surrounding section rhythm; column behavior always
     comes from this component, never from a hand-written grid class.
-->
<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        children,
        cols = 2,
        gap = "gap-3",
    }: {
        children: Snippet;
        /** Column count at/above the threshold. Below 560px always 1 column. */
        cols?: 2 | 3;
        /** Gap utility, kept per section rhythm (default gap-3). */
        gap?: string;
    } = $props();

    const gridClass = $derived(
        cols === 3
            ? `grid grid-cols-1 @min-[560px]:grid-cols-2 @min-[960px]:grid-cols-3 ${gap}`
            : `grid grid-cols-1 @min-[560px]:grid-cols-2 ${gap}`,
    );
</script>

<div class={gridClass}>
    {@render children()}
</div>
