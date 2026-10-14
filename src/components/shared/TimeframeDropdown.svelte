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
  The timeframe chip with its quick-pick dropdown, shared by the Technicals
  panel and the Academy lesson chart.

  Extracted rather than copied: the two panels want the same control, and the
  repo has already paid once for a duplicated renderer (BUG-0457/BUG-0460 in
  `subPaneContent`). The component owns the popup's own state — open/closed, the
  custom field, the hover timer — and nothing else: `value` is what the chip
  shows and `onSelect` is what a pick means, so a caller decides whether that
  writes `tradeState.analysisTimeframe` or the lesson's stored preference.
-->

<script lang="ts">
    import { _ } from "../../locales/i18n";
    import { normalizeTimeframeInput } from "../../utils/utils";

    interface Props {
        /** What the chip shows. */
        value: string;
        /** The quick picks, in the order the grid shows them. */
        options: readonly string[];
        /** Receives a pick, or a custom timeframe the trader submitted. */
        onSelect: (timeframe: string) => void;
        /** Accessible name for the chip and the custom field. */
        label: string;
    }

    let { value, options, onSelect, label }: Props = $props();

    let showPopup = $state(false);
    let customInput = $state("");
    let hoverTimeout: number | null = null;

    /*
     * Hover opens the popup, but only for a pointer that can hover: on a touch
     * screen a hover event fires on tap and the popup would close again with the
     * dismissing tap. Those devices open it with the chip's click.
     */
    function openOnHover(event?: PointerEvent) {
        if (event?.pointerType === "touch") return;
        if (hoverTimeout) clearTimeout(hoverTimeout);
        showPopup = true;
    }

    function closeOnLeave(event?: PointerEvent) {
        if (event?.pointerType === "touch") return;
        if (hoverTimeout) clearTimeout(hoverTimeout);
        // A delay, not an immediate close: the pointer crosses the gap between
        // the chip and the popup, and closing there would make the grid
        // unusable with a mouse.
        hoverTimeout = window.setTimeout(() => {
            showPopup = false;
            hoverTimeout = null;
        }, 300);
    }

    function choose(timeframe: string) {
        onSelect(timeframe);
        showPopup = false;
    }

    function submitCustom() {
        const normalised = normalizeTimeframeInput(customInput);
        if (!normalised) return;
        choose(normalised);
        customInput = "";
    }

    function handleClickOutside(event: MouseEvent) {
        if (showPopup && !(event.target as HTMLElement).closest(".timeframe-dropdown")) {
            showPopup = false;
        }
    }
</script>

<svelte:window onclick={handleClickOutside} />

<div
    class="relative timeframe-dropdown"
    role="group"
    onpointerenter={openOnHover}
    onpointerleave={closeOnLeave}
>
    <button
        type="button"
        aria-label={label}
        aria-expanded={showPopup}
        class="text-[10px] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] cursor-pointer hover:bg-[var(--accent-color)] hover:text-[var(--text-on-accent)] border-none outline-none font-mono flex items-center justify-center"
        onclick={() => (showPopup = !showPopup)}
    >
        {value}
    </button>

    {#if showPopup}
        <div
            class="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-xl z-50 p-2 w-48 flex flex-col gap-2"
        >
            <div class="grid grid-cols-3 gap-1">
                {#each options as timeframe (timeframe)}
                    <button
                        type="button"
                        class="py-1 text-xs border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-[var(--text-on-accent)] rounded text-[var(--text-primary)]"
                        onclick={() => choose(timeframe)}>{timeframe}</button
                    >
                {/each}
            </div>
            <div class="flex gap-1 border-t border-[var(--border-color)] pt-2">
                <input
                    bind:value={customInput}
                    aria-label={label}
                    placeholder={$_("settings.technicals.customTimeframePlaceholder")}
                    class="w-full text-xs p-1 rounded border border-[var(--input-border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)]"
                    onkeydown={(event) => event.key === "Enter" && submitCustom()}
                />
                <button
                    type="button"
                    class="px-2 bg-[var(--bg-tertiary)] text-xs rounded hover:bg-[var(--accent-color)] hover:text-[var(--text-on-accent)] text-[var(--text-primary)]"
                    onclick={submitCustom}>{$_("common.ok")}</button
                >
            </div>
        </div>
    {/if}
</div>
