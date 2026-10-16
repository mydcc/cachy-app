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
  // Test-only spy for the chart wrappers: renders nothing visible and
  // surfaces the props a parent test cares about as data attributes, so a
  // test can pin which data fed a chart without booting Chart.js. Decimal
  // values serialize through their own `toJSON` (as strings), which is
  // deterministic and comparable across renders — and chart props are
  // numbers at the edge anyway (ADR-0021).
  const props: Record<string, unknown> = $props();

  const json = $derived(JSON.stringify(props.data ?? null));
</script>

<span
  data-testid="chart-data-spy"
  hidden
  data-title={String(props.title ?? "")}
  data-json={json}
></span>
