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
  // Test-only stub for heavy child components: accepts any props, renders
  // nothing visible. Lets a parent mount without dragging its subtree
  // (and their stores, sockets, dialogs) into the test.
  const props: Record<string, unknown> = $props();
</script>

<span data-testid="empty-stub" hidden>{Object.keys(props).length}</span>
