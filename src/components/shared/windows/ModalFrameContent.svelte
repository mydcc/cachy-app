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
  Content view for ModalFrameWindow (FEAT-0044). Renders the Snippet that was
  passed into ModalFrame.svelte's `children` prop, inside WindowFrame's own
  content area -- deliberately no independent scroll container here, since
  WindowFrame's .window-content already provides the single scroll boundary
  a window needs (a second one risks a BUG-0047-style nested-overflow bug).
-->

<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children?: Snippet;
        bodyClass?: string;
    }

    let { children, bodyClass = "" }: Props = $props();
</script>

<div class="modal-frame-body {bodyClass}">
    {#if children}
        {@render children()}
    {/if}
</div>

<style>
    .modal-frame-body {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        padding: 1.5rem;
    }
</style>
