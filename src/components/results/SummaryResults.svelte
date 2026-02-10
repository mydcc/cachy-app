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
  import { createEventDispatcher } from "svelte";
  import { icons } from "../../lib/constants";
  import Tooltip from "../shared/Tooltip.svelte";
  import { _ } from "../../locales/i18n";
  import { trackCustomEvent } from "../../services/trackingService";
  import DOMPurify from "dompurify";

  const dispatch = createEventDispatcher();

  interface Props {
    isPositionSizeLocked: boolean;
    showCopyFeedback: boolean;
    positionSize: string;
    netLoss: string;
    requiredMargin: string;
    entryFee: string;
    liquidationPrice: string;
    breakEvenPrice: string;
    isMarginExceeded?: boolean;
  }

  let {
    isPositionSizeLocked,
    showCopyFeedback,
    positionSize,
    netLoss,
    requiredMargin,
    entryFee,
    liquidationPrice,
    breakEvenPrice,
    isMarginExceeded = false
  }: Props = $props();

  function handleCopy() {
    trackCustomEvent("Result", "Copy", "PositionSize");
    navigator.clipboard.writeText(positionSize);
    dispatch("copy");
  }

  function handleToggleLock() {
    trackCustomEvent(
      "Result",
      "ToggleLock",
      !isPositionSizeLocked ? "On" : "Off"
    );
    dispatch("toggleLock");
  }
</script>

<div class="result-group">
  <h2 class="section-header">{$_("dashboard.summaryResults.header")}</h2>
  <div class="result-item">
    <div class="result-label">
      {$_("dashboard.summaryResults.positionSizeLabel")}
      <button
        id="lock-position-size-btn"
        class="copy-btn ml-2"
        title={$_("dashboard.summaryResults.lockPositionSizeTitle")}
        aria-label={$_("dashboard.summaryResults.lockPositionSizeAriaLabel")}
        onclick={handleToggleLock}
      >
        {#if isPositionSizeLocked}
          {@html DOMPurify.sanitize(icons.lockClosed)}
        {:else}
          {@html DOMPurify.sanitize(icons.lockOpen)}
        {/if}
      </button>
      <button
        id="copy-btn"
        class="copy-btn"
        aria-label={$_("dashboard.summaryResults.copyPositionSizeAriaLabel")}
        onclick={handleCopy}
      >
        {@html DOMPurify.sanitize(icons.copy)}
      </button>
      {#if showCopyFeedback}<span
          id="copy-feedback"
          class="copy-feedback visible"
          >{$_("dashboard.summaryResults.copiedFeedback")}</span
        >{/if}
    </div>
    <span
      id="positionSize"
      class="result-value text-lg"
      style:color={isMarginExceeded
        ? "var(--danger-color)"
        : "var(--success-color)"}>{positionSize}</span
    >
  </div>
  {#if isMarginExceeded}
    <div
      class="result-item"
      style="justify-content: center; margin-bottom: 0.5rem;"
    >
      <span class="text-sm font-bold" style="color: var(--danger-color);"
        >{$_("dashboard.summaryResults.insufficientBalance")}</span
      >
    </div>
  {/if}
  <div class="result-item">
    <div class="result-label">
      {$_("dashboard.summaryResults.maxNetLossLabel")}<Tooltip
        text={$_("dashboard.summaryResults.maxNetLossTooltip")}
      />
    </div>
    <span id="netLoss" class="result-value" style:color="var(--danger-color)"
      >{netLoss}</span
    >
  </div>
  <div class="result-item">
    <div class="result-label">
      {$_("dashboard.summaryResults.requiredMarginLabel")}<Tooltip
        text={$_("dashboard.summaryResults.requiredMarginTooltip")}
      />
    </div>
    <span
      id="requiredMargin"
      class="result-value"
      style:color={isMarginExceeded ? "var(--danger-color)" : ""}
      >{requiredMargin}</span
    >
  </div>
  <div class="result-item">
    <div class="result-label">
      {$_("dashboard.summaryResults.entryFeeLabel")}
    </div>
    <span id="entryFee" class="result-value">{entryFee}</span>
  </div>
  <div class="result-item">
    <span class="result-label"
      >{$_("dashboard.summaryResults.estimatedLiquidationPriceLabel")}<Tooltip
        text={$_("dashboard.summaryResults.estimatedLiquidationPriceTooltip")}
      /></span
    >
    <span id="liquidationPrice" class="result-value">{liquidationPrice}</span>
  </div>
  <div class="result-item">
    <span class="result-label"
      >{$_("dashboard.summaryResults.breakEvenPriceLabel")}<Tooltip
        text={$_("dashboard.summaryResults.breakEvenPriceTooltip")}
      /></span
    ><span
      id="breakEvenPrice"
      class="result-value"
      style:color="var(--warning-color)">{breakEvenPrice}</span
    >
  </div>
</div>
