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
  The confirmation dialog — FEAT-0024.

  It takes facts, not a question. "Are you sure?" is answerable without
  reading anything, which is why a user who has clicked through it fifty
  times stops seeing it; a dialog that says "Close 0.5 BTC at 94,180, taking
  −412.60 USDT" cannot be answered without reading, and that is the whole
  point of asking.

  Callers supply the facts because only they know which numbers matter for
  their action, and those numbers must come from the same snapshot the caller
  hands the gate. This component never derives a value of its own — a second
  derivation is a second chance to disagree with the screen, which is
  precisely what FEAT-0011 exists to catch.

  `onconfirm` returns the moment of confirmation. That timestamp travels into
  the order intent as `confirmedAt`; without it the gate refuses.
-->

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import ModalFrame from "./ModalFrame.svelte";
  import type { ConfirmableAction } from "../../lib/confirmationPolicy";

  /** One line of the dialog: what it is, and what it will be. */
  interface ConfirmFact {
    label: string;
    value: string;
    /** Colours the value. `danger` for a loss or a destructive quantity. */
    tone?: "neutral" | "danger" | "success";
  }

  interface Props {
    isOpen?: boolean;
    action: ConfirmableAction;
    facts: ConfirmFact[];
    /** True for actions with nothing to undo — adds an explicit warning. */
    irreversible?: boolean;
    onconfirm: (confirmedAt: number) => void;
    oncancel?: () => void;
  }

  let { isOpen = false, action, facts, irreversible = false, onconfirm, oncancel }: Props =
    $props();

  const actionLabel = $derived($_(`settings.confirmations.actions.${action}.label`));

  function confirm(): void {
    /*
     * Stamped here rather than by the caller: this is the instant a human
     * actually agreed, and the gate's staleness rules should measure from
     * that moment, not from whenever the caller got round to building its
     * payload.
     */
    onconfirm(Date.now());
  }
</script>

<ModalFrame
  {isOpen}
  title={$_("settings.confirmations.dialog.heading", { values: { action: actionLabel } })}
  onclose={oncancel}
  width={420}
  height={360}
>
  <div class="flex h-full flex-col gap-4 p-1">
    <dl class="space-y-2">
      {#each facts as fact (fact.label)}
        <div
          class="flex items-baseline justify-between gap-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2"
        >
          <dt class="text-[11px] text-[var(--text-secondary)]">{fact.label}</dt>
          <dd
            class="font-mono text-sm font-bold tabular-nums"
            style:color={fact.tone === "danger"
              ? "var(--danger-color)"
              : fact.tone === "success"
                ? "var(--success-color)"
                : "var(--text-primary)"}
          >
            {fact.value}
          </dd>
        </div>
      {/each}
    </dl>

    {#if irreversible}
      <p class="text-[11px] font-semibold text-[var(--danger-color)]">
        {$_("settings.confirmations.dialog.irreversible")}
      </p>
    {/if}

    <div class="mt-auto flex gap-2">
      <button
        type="button"
        class="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-2 text-xs font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-color)]"
        onclick={oncancel}
      >
        {$_("settings.confirmations.dialog.cancel")}
      </button>
      <button
        type="button"
        class="flex-1 rounded-lg border px-4 py-2 text-xs font-bold transition-colors {irreversible
          ? 'bg-danger-paired border-[var(--danger-color)]'
          : 'bg-accent-paired border-[var(--accent-color)]'}"
        onclick={confirm}
      >
        {$_("settings.confirmations.dialog.confirm")}
      </button>
    </div>
  </div>
</ModalFrame>
