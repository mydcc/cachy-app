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
    interface Props {
        window: { content: string };
    }
    let { window: win }: Props = $props();
</script>

<div class="markdown-view-container p-6 prose dark:prose-invert">
    {@html win.content}
</div>

<style>
    .markdown-view-container {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        background: var(--bg-primary);
        color: var(--text-primary);
    }
</style>
