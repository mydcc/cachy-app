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
  One external channel's card — FEAT-0397.

  The three channels differ only in their credential fields, which arrive as a
  snippet. Everything else — the enable toggle, the test button, the validation
  message, the last outcome — is identical by design: a trader who has learnt to
  read one card can read all three, and a per-channel copy of this row is how one
  of them would quietly stop reporting failures.

  The toggle and the test button share one precondition: `problem` is `null`. A
  channel that cannot send must not be switchable to "on", because a toggle that
  reads on and delivers nothing is the failure this subsystem exists to prevent.
-->

<script lang="ts">
  import type { Snippet } from "svelte";
  import { _ } from "../../locales/i18n";
  import Toggle from "../shared/Toggle.svelte";
  import { externalChannelsStore } from "../../stores/externalChannels.svelte";
  import { externalDeliveryLog } from "../../stores/externalDeliveryLog.svelte";
  import { deliverExternal } from "../../services/externalDelivery";
  import type { ExternalChannelId } from "../../lib/notifications/externalChannels";

  interface Props {
    channel: ExternalChannelId;
    title: string;
    hint: string;
    enabled: boolean;
    /** The credential inputs, which are the only per-channel part. */
    fields: Snippet;
    onEnabledChange: (enabled: boolean) => void;
    onClear: () => void;
  }

  let { channel, title, hint, enabled, fields, onEnabledChange, onClear }: Props = $props();

  /** True while this card's own test is in flight. */
  let testing = $state(false);

  const problem = $derived(externalChannelsStore.problem(channel));
  const problemText = $derived(
    problem ? $_(`settings.externalChannels.problems.${problem}`) : "",
  );

  const last = $derived(externalDeliveryLog.latest(channel));

  /**
   * The last thing that happened, in the trader's words.
   *
   * This is the "not silent" criterion: a delivery that failed while the trader
   * was away is still readable afterwards, with the provider's own reason rather
   * than a generic apology.
   */
  const outcomeText = $derived.by(() => {
    if (!last) return $_("settings.externalChannels.never");
    const time = new Date(last.atMs).toLocaleTimeString();
    if (last.ok) return $_("settings.externalChannels.lastOk", { values: { time } });
    const reason = last.reason
      ? $_(`settings.externalChannels.failures.${last.reason}`)
      : (last.detail ?? "");
    return $_("settings.externalChannels.lastFailed", { values: { time, reason } });
  });

  /*
   * The test takes the same send path a real alert takes, with `test: true` so
   * the log can tell the two apart. A test served by a shortcut would prove the
   * shortcut works and nothing about the alarm.
   */
  async function sendTest(): Promise<void> {
    testing = true;
    try {
      await deliverExternal(
        channel,
        $_("settings.externalChannels.testMessage"),
        $_("settings.externalChannels.subject").replace(
          "{category}",
          $_("settings.externalChannels.logTest"),
        ),
        true,
      );
    } finally {
      testing = false;
    }
  }
</script>

<div class="mb-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
  <span class="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
  <p class="mt-1 text-[11px] text-[var(--text-secondary)]">{hint}</p>

  <div class="mt-2 grid gap-2 sm:grid-cols-2">
    {@render fields()}
  </div>

  <div class="mt-2 flex flex-wrap items-center gap-3">
    <label class="text-[11px] text-[var(--text-secondary)] cursor-pointer" for="ext-{channel}-enabled">
      {$_("settings.externalChannels.enable")}
    </label>
    <Toggle
      id="ext-{channel}-enabled"
      checked={enabled}
      disabled={problem !== null}
      onchange={(e) => onEnabledChange((e.currentTarget as HTMLInputElement).checked)}
    />
    <button
      type="button"
      class="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors disabled:opacity-50"
      disabled={problem !== null || testing}
      onclick={sendTest}
    >
      {testing ? $_("settings.externalChannels.testing") : $_("settings.externalChannels.test")}
    </button>
    <button
      type="button"
      class="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--danger-color)] transition-colors"
      onclick={onClear}
    >
      {$_("settings.externalChannels.clear")}
    </button>
  </div>

  {#if problemText}
    <p class="mt-2 text-[11px] font-semibold text-[var(--warning-color)]">{problemText}</p>
  {/if}

  <p
    class="mt-1 text-[11px] {last && !last.ok
      ? 'font-semibold text-[var(--danger-color)]'
      : 'text-[var(--text-secondary)]'}"
    data-testid="outcome-{channel}"
  >
    {outcomeText}
  </p>
</div>
