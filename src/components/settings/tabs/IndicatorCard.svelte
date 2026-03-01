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
    import Toggle from "../../shared/Toggle.svelte";

    let { title, enabled = $bindable(), children } = $props();
</script>

<div class="indicator-card">
    <div class="card-header">
        <span class="title">{title}</span>
        <Toggle bind:checked={enabled} />
    </div>
    <!-- ALWAYS show body now, as requested -->
    <div class="card-body" class:disabled={!enabled}>
        {@render children()}
    </div>
</div>

<style>
    .indicator-card {
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        overflow: hidden;
    }
    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background-color: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
    }
    .title {
        font-weight: 700;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--text-primary);
    }
    .card-body {
        padding: 1rem;
        transition: opacity 0.3s;
    }
    .card-body.disabled {
        opacity: 0.5; /* Visual cue that it is disabled */
        pointer-events: none; /* Prevent interaction if desired, or remove to allow editing while disabled */
    }
</style>
