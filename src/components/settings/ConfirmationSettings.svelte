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
  Per-action confirmation toggles — FEAT-0024.

  The note above the list is not decoration. A user who switches these off and
  believes they have switched off the order checks is trading on a false idea
  of what the software does for them, and would size differently because of
  it. The copy says plainly that the prompt goes and the verification stays.
-->

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import Toggle from "../shared/Toggle.svelte";
  import { confirmationPolicyStore } from "../../stores/confirmationPolicy.svelte";
  import {
    CONFIRMABLE_ACTIONS,
    GATED_ACTIONS,
    WIRED_ACTIONS,
    type ConfirmableAction,
  } from "../../lib/confirmationPolicy";

  /*
   * Built once rather than in the `{#each}`: the label and hint lookups are
   * per-row work that has no business running on every policy change.
   */
  const rows = $derived(
    CONFIRMABLE_ACTIONS.map((action: ConfirmableAction) => ({
      action,
      label: $_(`settings.confirmations.actions.${action}.label`),
      hint: $_(`settings.confirmations.actions.${action}.hint`),
      required: confirmationPolicyStore.policy[action],
      /*
       * A gated action nobody raises a dialog for cannot be switched on: the
       * gate would then demand an authorisation no call site can produce, and
       * the action would simply stop working. Ungated actions are unaffected —
       * their call site consults the policy directly, so an unwired one just
       * does not prompt.
       */
      blocked: GATED_ACTIONS.has(action) && !WIRED_ACTIONS.has(action),
    })),
  );

  function toggle(action: ConfirmableAction, required: boolean): void {
    confirmationPolicyStore.setRequired(action, required);
  }
</script>

<section class="settings-section">
  <h3 class="section-title mb-3">{$_("settings.confirmations.title")}</h3>

  <p class="text-[11px] mb-2 text-[var(--text-secondary)]">
    {$_("settings.confirmations.intro")}
  </p>

  <p
    class="text-[11px] mb-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-[var(--text-secondary)]"
  >
    {$_("settings.confirmations.verificationNote")}
  </p>

  {#if confirmationPolicyStore.persistFailed}
    <p class="text-[11px] mb-3 font-semibold text-[var(--danger-color)]">
      {$_("settings.confirmations.persistFailed")}
    </p>
  {/if}

  <ul class="space-y-2">
    {#each rows as row (row.action)}
      <li
        class="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3"
      >
        <label class="min-w-0 flex-1 cursor-pointer" for="confirm-{row.action}">
          <span class="block text-sm font-semibold text-[var(--text-primary)]">{row.label}</span>
          <span class="block text-[11px] mt-0.5 text-[var(--text-secondary)]">{row.hint}</span>
          {#if row.blocked}
            <span class="block text-[11px] mt-1 text-[var(--warning-color)]">
              {$_("settings.confirmations.notWired")}
            </span>
          {/if}
        </label>
        <Toggle
          id="confirm-{row.action}"
          checked={row.required}
          disabled={row.blocked}
          onchange={(e) => toggle(row.action, (e.currentTarget as HTMLInputElement).checked)}
        />
      </li>
    {/each}
  </ul>

  <div class="mt-3">
    <button
      type="button"
      class="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
      onclick={() => confirmationPolicyStore.reset()}
    >
      {$_("settings.confirmations.reset")}
    </button>
  </div>
</section>
