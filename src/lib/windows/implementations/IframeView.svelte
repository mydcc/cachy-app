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

<script lang="ts">
    import type { WindowBase } from "../WindowBase.svelte";

    interface Props {
        window: WindowBase & { url: string };
    }

    let { window: win }: Props = $props();
</script>

<div class="iframe-view-container">
    <iframe
        src={win.url}
        title={win.title}
        allow="xr-spatial-tracking; camera; microphone; fullscreen; display-capture"
    ></iframe>
</div>

<style>
    .iframe-view-container {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background: black; /* Better base for Unity loading */
        overflow: hidden;
    }
    iframe {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
    }
</style>
