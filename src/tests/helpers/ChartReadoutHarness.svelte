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
  Test-only parent (FEAT-0678).

  It exists to hand the chart a callback and store the result in `$state`, the
  shape the lesson view uses. That is what the readout test mounts: the chart's
  report has to arrive with the timeframe it drew, once.
-->

<script lang="ts">
    import IndicatorLessonChart from "../../components/shared/IndicatorLessonChart.svelte";
    import type { CatalogueEntry } from "../../lib/alerts/indicatorCatalogue";
    import type { ParamValue, PriceField } from "../../lib/rules/types";
    import type { LessonSeries } from "../../lib/academy/indicatorLessonSeries";
    import { readoutSpy } from "./chartReadoutSpy";

    interface Props {
        entry: CatalogueEntry;
        params?: Readonly<Record<string, ParamValue>>;
        field?: PriceField;
    }

    let { entry, params = {}, field }: Props = $props();

    let readout = $state<{ series: LessonSeries; timeframe: string } | null>(null);
</script>

<IndicatorLessonChart
    {entry}
    {params}
    {field}
    onreadout={(next) => {
        readoutSpy.calls += 1;
        readoutSpy.last = next;
        readout = next;
    }}
/>

<p data-testid="chart-readout">{readout ? readout.timeframe : ""}</p>
