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
  Which account this order is going to — FEAT-0026.

  FEAT-0026 describes its own failure mode as unrecoverable and entirely
  silent, and the cure it asks for is that the active account be unmistakable
  *wherever an order can be placed*, not only in a header. So this is small,
  dense and meant to be repeated: on the order panel, on the positions
  sidebar.

  (Phrased without quotation marks on purpose: `lint-i18n.js` scans for
  quoted English prose and cannot tell a comment from a UI string.)

  Read-only by design. Switching lives in Settings, behind one call site with
  one confirmation — a one-click switcher next to the flash-close button would
  optimise for the frequency of a right switch at the cost of a wrong one, and
  this item exists because the wrong one cannot be undone.

  No `$effect`, so no cleanup obligation.
-->

<script lang="ts">
    import { settingsState } from "../../stores/settings.svelte";
    import { _ } from "../../locales/i18n";

    interface Props {
        /** Drops the venue, for places that already state it. */
        compact?: boolean;
    }

    let { compact = false }: Props = $props();

    /*
     * `accounts?.` deliberately, matching `keysForActiveAccount`'s own
     * defensiveness. This chip renders on the order panel, and a thrown
     * `undefined.find` there takes down the surface that places trades —
     * a far worse outcome than a chip that falls back to the venue name.
     */
    const account = $derived(
        settingsState.accounts?.find(
            (a) => a.id === settingsState.activeAccountId,
        ),
    );

    /**
     * Falls back to the venue rather than rendering nothing.
     *
     * A chip that disappears when state is unexpected is worse than useless
     * here: its whole job is to be present wherever money moves, and a gap
     * reads as "no account involved".
     */
    const name = $derived(account?.name ?? settingsState.apiProvider);
    const venue = $derived(
        (account?.exchange ?? settingsState.apiProvider) === "bitget"
            ? "Bitget"
            : "Bitunix",
    );

    /*
     * The default account is named after its venue, so name and venue read
     * identically ("Bitunix · Bitunix"). Showing it twice states nothing
     * twice-worthy — one label does. A renamed account ("Main · Bitunix")
     * keeps both halves. Case-insensitive: "bitunix" vs "Bitunix" is the
     * same word in different clothes.
     */
    const showVenue = $derived(!compact && venue.toLowerCase() !== name.toLowerCase());
</script>

<span
    class="chip"
    aria-label={$_("settings.connections.accounts.activeAccountAria", {
        values: { name, venue },
    })}
    title={`${name} · ${venue}`}
>
    <span class="dot" aria-hidden="true"></span>
    <span class="name">{name}</span>
    {#if showVenue}
        <span class="venue">· {venue}</span>
    {/if}
</span>

<style>
    .chip {
        display: inline-flex;
        cursor: default;
        align-items: center;
        gap: 0.35rem;
        padding: 0.15rem 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-tertiary);
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
        max-width: 14rem;
        overflow: hidden;
    }
    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent-color);
        flex: none;
    }
    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .venue {
        color: var(--text-secondary);
        font-weight: var(--font-normal);
        white-space: nowrap;
    }
</style>
