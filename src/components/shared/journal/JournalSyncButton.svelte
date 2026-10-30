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
  and each one has to be visible. `isLoading` used to be in the `disabled`
  expression alone, so the button greyed out with its normal refresh icon and
  label while the journal was loading: a broken-looking button.

  The four states are explicit here rather than inferred from the disabled
  expression, so a condition added later cannot stay invisible. `isPro` wins
  over the in-flight states because a non-Pro account can never sync — the
  lock is the honest answer there.
-->
<script lang="ts">
    import { icons } from "../../../lib/constants";
    import { _ } from "../../../locales/i18n";
    import Button from "../Button.svelte";

    interface Props {
        isPro: boolean;
        isSyncing: boolean;
        isLoading: boolean;
        onSync: () => void;
    }

    let { isPro, isSyncing, isLoading, onSync }: Props = $props();

    let label = $derived(
        isSyncing
            ? $_("journal.messages.syncing")
            : isLoading
              ? $_("journal.messages.loading")
              : $_("journal.syncBitunix"),
    );

    let title = $derived(isPro ? label : $_("journal.syncRequiresPro"));
</script>

<Button
    variant="outline"
    size="sm"
    extraClasses="gap-1.5"
    ariaLabel={label}
    {title}
    onClick={onSync}
    disabled={!isPro || isSyncing || isLoading}
>
    {#if !isPro}
        <span class="opacity-70">🔒</span>
    {:else if isSyncing || isLoading}
        <div
            class="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full"
        ></div>
    {:else}
        <span class="opacity-70">{@html icons.refresh}</span>
    {/if}
    <span>{label}</span>
</Button>
