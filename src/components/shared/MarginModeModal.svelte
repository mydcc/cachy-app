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
  FEAT-0328 — margin mode and position mode, in one dialog.

  COLLECT, THEN CONFIRM. Selecting a card moves a local draft and sends
  nothing. Only "Confirm" hands the changed modes to the caller, and only the
  ones that actually differ from what the exchange currently reports. An
  earlier revision fired a request on every click, which meant one stray tap
  could change how a live account holds its margin — the exact risk this
  shape removes.

  The two are in one dialog because they are two halves of the same question,
  and the venue's own dialog presents them together. They are NOT one setting:

    margin mode    refused while THIS symbol carries a position or an order
    position mode  refused while ANY pair does; the endpoint takes no symbol

  So each section carries its own gate and its own visible reason. Sharing a
  dialog must not become sharing a precondition.

  Each option shows what it means rather than naming it twice. Cross draws one
  pool feeding both positions; isolated draws a wall between them. That is the
  whole difference, and it decides whether one bad trade can take the other
  down with it.
-->

<script lang="ts">
  import { untrack } from "svelte";
  import { _ } from "../../locales/i18n";
  import ModalFrame from "./ModalFrame.svelte";

  type MarginMode = "ISOLATION" | "CROSS";
  type PositionMode = "ONE_WAY" | "HEDGE";

  interface Props {
    /** What the exchange reports now, or undefined when unknown. */
    currentMarginMode?: MarginMode;
    currentPositionMode?: PositionMode;
    /** Non-empty when the venue would refuse that section right now. */
    marginReason: string;
    positionReason: string;
    busy: boolean;
    onclose: () => void;
    onconfirm: (changes: {
      marginMode?: MarginMode;
      positionMode?: PositionMode;
    }) => void;
  }

  let {
    currentMarginMode,
    currentPositionMode,
    marginReason,
    positionReason,
    busy,
    onclose,
    onconfirm,
  }: Props = $props();

  // Drafts, seeded once from what the exchange reports. Nothing travels until
  // Confirm.
  // `untrack` because seeding once is the point: a WebSocket push that moves
  // the exchange's mode mid-dialog must not silently rewrite the draft the
  // user is about to confirm.
  let draftMargin = $state<MarginMode | undefined>(untrack(() => currentMarginMode));
  let draftPosition = $state<PositionMode | undefined>(
    untrack(() => currentPositionMode),
  );

  const marginChanged = $derived(
    draftMargin !== undefined && draftMargin !== currentMarginMode,
  );
  const positionChanged = $derived(
    draftPosition !== undefined && draftPosition !== currentPositionMode,
  );
  const hasChanges = $derived(marginChanged || positionChanged);

  function confirm() {
    if (!hasChanges || busy) return;
    onconfirm({
      // Only what actually differs — a redundant request is still a request.
      marginMode: marginChanged ? draftMargin : undefined,
      positionMode: positionChanged ? draftPosition : undefined,
    });
  }
</script>

<ModalFrame title={$_("exchange.accountSettings.modeTitle")} {onclose} isOpen={true}>
  <div class="flex flex-col gap-4 p-4 min-w-[320px] max-w-[26rem]">
    <!-- Margin mode: per symbol. -->
    <section class="flex flex-col gap-2">
      <span class="section-label">{$_("dashboard.generalInputs.marginMode")}</span>

      <div class="grid grid-cols-2 gap-2" title={marginReason || undefined}>
        <button
          type="button"
          class="option"
          class:option-active={draftMargin === "CROSS"}
          data-track-id="btn-margin-mode-cross"
          disabled={busy || marginReason !== ""}
          onclick={() => (draftMargin = "CROSS")}
        >
          <span class="option-title">{$_("exchange.accountSettings.cross")}</span>
          <!-- One pool feeds every position. -->
          <span class="diagram">
            <span class="node node-wide"
              >{$_("exchange.accountSettings.diagramSharedPool")}</span
            >
            <span class="arrows"
              ><span class="arrow"></span><span class="arrow"></span></span
            >
            <span class="row">
              <span class="node">{$_("exchange.accountSettings.diagramPositionA")}</span>
              <span class="node">{$_("exchange.accountSettings.diagramPositionB")}</span>
            </span>
          </span>
        </button>

        <button
          type="button"
          class="option"
          class:option-active={draftMargin === "ISOLATION"}
          data-track-id="btn-margin-mode-isolated"
          disabled={busy || marginReason !== ""}
          onclick={() => (draftMargin = "ISOLATION")}
        >
          <span class="option-title">{$_("exchange.accountSettings.isolated")}</span>
          <!-- A wall between them: one loss cannot reach the other. -->
          <span class="diagram">
            <span class="row">
              <span class="node">{$_("exchange.accountSettings.diagramMarginA")}</span>
              <span class="node">{$_("exchange.accountSettings.diagramMarginB")}</span>
            </span>
            <span class="arrows"
              ><span class="arrow"></span><span class="arrow"></span></span
            >
            <span class="row">
              <span class="node">{$_("exchange.accountSettings.diagramPositionA")}</span>
              <span class="node">{$_("exchange.accountSettings.diagramPositionB")}</span>
            </span>
          </span>
        </button>
      </div>

      {#if marginReason}
        <p class="reason" data-track-id="reason-margin-mode">{marginReason}</p>
      {/if}
    </section>

    <!-- Position mode: account-wide, so its precondition is too. -->
    <section class="flex flex-col gap-2">
      <span class="section-label">{$_("exchange.accountSettings.positionMode")}</span>

      <div class="grid grid-cols-2 gap-2" title={positionReason || undefined}>
        <button
          type="button"
          class="option"
          class:option-active={draftPosition === "ONE_WAY"}
          data-track-id="btn-position-mode-one-way"
          disabled={busy || positionReason !== ""}
          onclick={() => (draftPosition = "ONE_WAY")}
        >
          <span class="option-title">{$_("exchange.accountSettings.oneWay")}</span>
          <span class="diagram">
            <span class="row">
              <span class="node">{$_("exchange.accountSettings.diagramTrade1")}</span>
              <span class="node">{$_("exchange.accountSettings.diagramTrade2")}</span>
            </span>
            <span class="arrows"
              ><span class="arrow"></span><span class="arrow"></span></span
            >
            <span class="node node-wide"
              >{$_("exchange.accountSettings.diagramOnePosition")}</span
            >
          </span>
        </button>

        <button
          type="button"
          class="option"
          class:option-active={draftPosition === "HEDGE"}
          data-track-id="btn-position-mode-hedge"
          disabled={busy || positionReason !== ""}
          onclick={() => (draftPosition = "HEDGE")}
        >
          <span class="option-title">{$_("exchange.accountSettings.hedge")}</span>
          <span class="diagram">
            <span class="row">
              <span class="node">{$_("exchange.accountSettings.diagramTrade1")}</span>
              <span class="node">{$_("exchange.accountSettings.diagramTrade2")}</span>
            </span>
            <span class="arrows"
              ><span class="arrow"></span><span class="arrow"></span></span
            >
            <span class="row">
              <span class="node">{$_("exchange.accountSettings.diagramPositionA")}</span>
              <span class="node">{$_("exchange.accountSettings.diagramPositionB")}</span>
            </span>
          </span>
        </button>
      </div>

      {#if positionReason}
        <p class="reason" data-track-id="reason-position-mode">{positionReason}</p>
      {/if}
    </section>

    <div class="flex gap-2 justify-end">
      <button
        type="button"
        onclick={onclose}
        disabled={busy}
        data-track-id="btn-mode-cancel"
        class="px-3 py-1.5 text-xs rounded border border-[var(--border-color)]
               text-[var(--text-secondary)] disabled:opacity-50"
      >
        {$_("common.cancel")}
      </button>
      <button
        type="button"
        onclick={confirm}
        disabled={busy || !hasChanges}
        data-track-id="btn-mode-confirm"
        class="px-3 py-1.5 text-xs rounded font-bold bg-accent-paired
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? $_("exchange.accountSettings.pending") : $_("common.confirm")}
      </button>
    </div>
  </div>
</ModalFrame>

<style>
  .section-label {
    font-size: 0.6875rem;
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .option {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.625rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
    background-color: var(--bg-secondary);
    text-align: left;
    transition:
      border-color 0.15s ease,
      color 0.15s ease;
  }
  .option:hover:not(:disabled) {
    border-color: var(--accent-color);
  }
  .option:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .option-active {
    border-color: var(--accent-color);
  }
  .option-title {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--text-primary);
  }
  .option-active .option-title {
    color: var(--accent-color);
  }

  /* The explanation, drawn. Boxes and connectors only — themed throughout. */
  .diagram {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }
  .node {
    padding: 0.1875rem 0.25rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background-color: var(--bg-tertiary);
    font-size: 0.5625rem;
    line-height: 1.2;
    text-align: center;
    color: var(--text-secondary);
  }
  .node-wide {
    display: block;
  }
  .option-active .node {
    border-color: var(--accent-color);
    color: var(--text-primary);
  }
  .arrows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
    height: 0.5rem;
  }
  .arrow {
    justify-self: center;
    width: 1px;
    height: 100%;
    background-color: var(--border-color);
  }
  .option-active .arrow {
    background-color: var(--accent-color);
  }

  .reason {
    font-size: 0.6875rem;
    color: var(--warning-color);
  }
</style>
