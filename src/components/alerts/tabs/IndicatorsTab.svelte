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
  FEAT-0389 -- placeholder for the indicator condition builder, which is FEAT-0028.

  This file exists as its own module rather than as an inline branch in the
  shell because the acceptance criterion is that tabs are code-split: opening
  the panel must not pull in every builder. A real chunk here means the split
  is exercised now, and FEAT-0028 replaces the body of this
  component without touching the shell's loader.
-->

<script lang="ts">
    let { symbol: _symbol }: { symbol: string } = $props();
    import { _ } from "../../../locales/i18n";
</script>

<div class="pending" role="status">
    <h4>{$_("dashboard.alerts.panel.pendingTitle")}</h4>
    <p>{$_("dashboard.alerts.panel.pendingBody", { values: { item: "FEAT-0028" } })}</p>
</div>

<style>
    .pending {
        padding: var(--space-6) var(--space-4);
        text-align: center;
        color: var(--text-secondary);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border: 1px dashed var(--border);
    }
    .pending h4 {
        margin: 0 0 var(--space-2) 0;
        color: var(--text-primary);
        font-size: 0.9rem;
    }
    .pending p {
        margin: 0;
        line-height: 1.5;
        font-size: 0.85rem;
    }
</style>
