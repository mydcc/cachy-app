<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program. If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  BUG-0719 — the "Sync Bitunix" button has three reasons to be unavailable,
  and each one has to be visible. `uiState.isLoading` used to be in the
  `disabled` expression alone, so work that blocks the button greyed it out
  with the refresh icon and the resting label: a broken-looking button.

  `isLoading` is the app-wide busy flag; its visible message lives in
  `uiState.loadingMessage` (today: a screenshot upload). Passing that string
  through is what keeps the reason truthful — a generic "loading" label would
  name the wrong operation.

  `isPro` wins over the in-flight states: a non-Pro account can never sync, so
  the lock is the honest answer there, and the reason also goes into the
  accessible name because a disabled button is outside the tab order.
-->
<script lang="ts">
    import { icons } from "../../../lib/constants";
    import { _ } from "../../../locales/i18n";
    import Button from "../Button.svelte";

    interface Props {
        isPro: boolean;
        /** A price fetch or a history sync is in flight. */
        isBusy: boolean;
        /** Other work blocks the button; `loadingMessage` says which work. */
        isLoading: boolean;
        /** The message the app shows for that work. */
        loadingMessage: string;
        onSync: () => void;
    }

    let { isPro, isBusy, isLoading, loadingMessage, onSync }: Props = $props();

    let label = $derived(
        !isPro
            ? $_("journal.syncBitunix")
            : isBusy
              ? $_("journal.messages.syncing")
              : isLoading
                ? loadingMessage || $_("journal.messages.loading")
                : $_("journal.syncBitunix"),
    );

    let requiresPro = $derived($_("journal.syncRequiresPro"));
    let title = $derived(isPro ? label : requiresPro);
    // Native `disabled` drops the button from the tab order, so a `title` alone
    // would never be reached by keyboard or screen reader. Name the reason.
    let accessibleLabel = $derived(
        isPro ? label : `${label} — ${requiresPro}`,
    );
</script>

<Button
    variant="outline"
    size="sm"
    extraClasses="gap-1.5"
    ariaLabel={accessibleLabel}
    {title}
    onClick={onSync}
    disabled={!isPro || isBusy || isLoading}
>
    {#if !isPro}
        <span class="opacity-70">🔒</span>
    {:else if isBusy || isLoading}
        <div
            class="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full"
        ></div>
    {:else}
        <span class="opacity-70">{@html icons.refresh}</span>
    {/if}
    <span>{label}</span>
</Button>
