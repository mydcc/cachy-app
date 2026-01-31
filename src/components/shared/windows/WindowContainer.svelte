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
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import WindowFrame from "./WindowFrame.svelte";
</script>

<div class="windows-container">
    {#each windowManager.windows as win (win.id)}
        <div
            class="window-wrapper"
            role="none"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
        >
            <WindowFrame window={win} />
        </div>
    {/each}
</div>

<style>
    .windows-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 11000;
        pointer-events: none; /* Let clicks pass through to the app */
    }
    .window-wrapper {
        position: absolute;
        pointer-events: auto; /* Interaction with windows only */
    }
</style>
