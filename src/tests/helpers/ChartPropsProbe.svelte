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
  Test-only stub for the Academy lesson chart that *records* the props it was
  given, which an opaque stub cannot.

  The chart's `params` prop is a cross-component contract (FEAT-0681): the view
  resolves the trader's parameters once and hands the same object to the chart it
  shows in the card. A stub that swallows props would let the two drift apart
  with every test still green — the failure the feature exists to prevent.
-->
<script lang="ts">
  interface Props {
    entry?: { id?: string };
    params?: Record<string, unknown>;
    field?: string;
  }

  let { entry, params, field }: Props = $props();
</script>

<div
  data-testid="chart-probe"
  data-entry-id={entry?.id ?? ""}
  data-params={JSON.stringify(params ?? {})}
  data-field={field ?? ""}
></div>
