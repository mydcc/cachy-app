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
  FEAT-0015 — the order audit trail.

  Class A, and more sensitive than most: it records what was sent to an
  exchange and when. It is never uploaded anywhere. Credentials are already
  redacted in what is stored, so what is shown and exported here is clean by
  construction rather than by filtering at display time.
-->

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import {
    orderAuditService,
    MAX_AUDIT_ENTRIES,
    type OrderAuditEntry,
  } from "../../services/orderAuditService";
  import { modalState } from "../../stores/modal.svelte";

  let refreshToken = $state(0);
  let expanded = $state<string | null>(null);

  const entries = $derived.by(() => {
    void refreshToken;
    // Newest first: when something has just gone wrong, the relevant attempt
    // is the last one.
    return [...orderAuditService.getEntries()].reverse();
  });

  function outcomeClass(outcome: OrderAuditEntry["outcome"]): string {
    if (outcome === "sent") return "outcome-sent";
    if (outcome === "refused") return "outcome-refused";
    return "outcome-failed";
  }

  function outcomeLabel(outcome: OrderAuditEntry["outcome"]): string {
    if (outcome === "sent") return $_("settings.audit.outcome.sent");
    if (outcome === "refused") return $_("settings.audit.outcome.refused");
    return $_("settings.audit.outcome.failed");
  }

  function when(ms: number): string {
    return new Date(ms).toLocaleString();
  }

  async function clearLog() {
    const confirmed = await modalState.show(
      $_("settings.audit.clearTitle"),
      $_("settings.audit.clearMessage"),
      "confirm",
    );
    if (confirmed === true) {
      orderAuditService.clear();
      refreshToken += 1;
    }
  }
</script>

<div class="space-y-4">
  <section class="settings-section">
    <h3 class="section-title mb-2">{$_("settings.audit.title")}</h3>
    <p class="text-[11px] text-[var(--text-secondary)]">
      {$_("settings.audit.description")}
    </p>
    <p class="text-[11px] mt-1 text-[var(--text-secondary)]">
      {$_("settings.audit.retention", {
        values: { max: String(MAX_AUDIT_ENTRIES) },
      })}
    </p>

    <div class="mt-3 flex flex-wrap gap-2">
      <button
        class="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
        onclick={() => orderAuditService.downloadExport()}
      >
        {$_("settings.audit.export")}
      </button>
      <button
        class="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
        onclick={() => (refreshToken += 1)}
      >
        {$_("settings.audit.refresh")}
      </button>
      <button
        class="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--danger-color)] hover:border-[var(--danger-color)] transition-colors"
        onclick={clearLog}
      >
        {$_("settings.audit.clear")}
      </button>
    </div>
  </section>

  <section class="settings-section">
    {#if entries.length === 0}
      <p class="text-[11px] text-[var(--text-secondary)]">
        {$_("settings.audit.empty")}
      </p>
    {:else}
      <p class="text-[11px] mb-2 text-[var(--text-secondary)]">
        {$_("settings.audit.count", { values: { count: String(entries.length) } })}
      </p>

      <div class="audit-list">
        {#each entries as entry (entry.id)}
          <div class="audit-row">
            <button
              class="audit-head"
              onclick={() => (expanded = expanded === entry.id ? null : entry.id)}
              aria-expanded={expanded === entry.id}
            >
              <span class="badge {outcomeClass(entry.outcome)}"
                >{outcomeLabel(entry.outcome)}</span
              >
              <span class="font-mono text-[11px]">{entry.action}</span>
              <span class="text-[11px] text-[var(--text-secondary)]"
                >{entry.mode === "paper"
                  ? $_("settings.audit.modePaper")
                  : $_("settings.audit.modeLive")}</span
              >
              <span class="text-[10px] text-[var(--text-secondary)] ml-auto"
                >{when(entry.at)}</span
              >
            </button>

            {#if entry.refusal}
              <p class="text-[11px] px-2 pb-1 text-[var(--danger-color)]">
                {$_("settings.audit.refusedField", {
                  values: { field: entry.refusal.field },
                })}
              </p>
            {/if}

            {#if expanded === entry.id}
              <pre class="audit-detail">{JSON.stringify(entry, null, 2)}</pre>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .section-title {
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }
  .audit-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 26rem;
    overflow-y: auto;
  }
  .audit-row {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-secondary);
  }
  .audit-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: var(--space-2);
    text-align: left;
    color: var(--text-primary);
  }
  .badge {
    padding: 0 0.35rem;
    border-radius: var(--radius-sm);
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: 1px solid currentColor;
  }
  .outcome-sent {
    color: var(--success-color);
  }
  .outcome-refused {
    color: var(--danger-color);
  }
  .outcome-failed {
    color: var(--warning-color);
  }
  .audit-detail {
    margin: 0;
    padding: var(--space-2);
    border-top: 1px solid var(--border-color);
    font-size: 0.65rem;
    line-height: 1.4;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 18rem;
    overflow: auto;
  }
</style>
