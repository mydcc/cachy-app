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
  One exchange account's credential card — FEAT-0026.

  Extracted from `ConnectionsTab`, which held two near-identical 244-line
  copies differing only in labels, hardcoded element ids and whether a
  passphrase field appeared. Those hardcoded ids (`bitunix-key`,
  `showKeys["bitunix_k"]`, …) are exactly what made a second account on one
  venue impossible to render: two cards would have collided on every `id` and
  shared every visibility toggle. Everything is keyed by `account.id` now.

  **Never hold a captured `account` across a lock.** `settingsState.lock()`
  replaces the array with freshly redacted objects, so a card bound to a
  detached object silently swallows typing. The parent passes the live object
  out of `settingsState.accounts` on every render for that reason.
-->

<script lang="ts">
    import { _ } from "../../locales/i18n";
    import type { ExchangeAccount } from "../../stores/settings/accounts";

    interface Props {
        account: ExchangeAccount;
        /** Marks the card whose credentials sign orders right now. */
        isActive?: boolean;
    }

    let { account, isActive = false }: Props = $props();

    /**
     * Which fields are currently revealed, per field of this card.
     *
     * Local to the card, so revealing one account's secret cannot reveal
     * another's — the shared `showKeys` map in `ConnectionsTab` keyed on
     * venue literals could not have made that distinction.
     */
    let shown: Record<string, boolean> = $state({});

    const fieldId = (part: string) => `account-${account.id}-${part}`;
    const toggle = (part: string) => (shown[part] = !shown[part]);

    /** Green once the account can actually sign: a key alone cannot. */
    const isConfigured = $derived(
        Boolean(
            account.keys.key &&
                account.keys.secret &&
                (account.exchange !== "bitget" || account.keys.passphrase),
        ),
    );
</script>

{#snippet revealButton(part: string)}
    <button
        class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
        onclick={() => toggle(part)}
        aria-label={$_("settings.connections.aria.toggleKey")}
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle
                cx="12"
                cy="12"
                r="3"
            /></svg
        >
    </button>
{/snippet}

<div class="api-card" class:active={isActive}>
    <div class="header">
        <span class="font-bold text-sm">{account.name}</span>
        <div class="flex items-center gap-2">
            {#if isActive}
                <span class="active-badge"
                    >{$_("settings.connections.accounts.active")}</span
                >
            {/if}
            <span class="status-dot {isConfigured ? 'connected' : ''}"></span>
        </div>
    </div>
    <div class="body">
        <div class="field-group">
            <label for={fieldId("key")}
                >{$_("settings.connections.apiKey")}</label
            >
            <div class="input-wrapper relative">
                <input
                    id={fieldId("key")}
                    type={shown.key ? "text" : "password"}
                    bind:value={account.keys.key}
                    class="api-input pr-8"
                    placeholder={$_("settings.connections.placeholders.apiKey")}
                />
                {@render revealButton("key")}
            </div>
        </div>

        <div class="field-group mt-3">
            <label for={fieldId("secret")}
                >{$_("settings.connections.apiSecret")}</label
            >
            <div class="input-wrapper relative">
                <input
                    id={fieldId("secret")}
                    type={shown.secret ? "text" : "password"}
                    bind:value={account.keys.secret}
                    class="api-input pr-8"
                    placeholder={$_(
                        "settings.connections.placeholders.apiSecret",
                    )}
                />
                {@render revealButton("secret")}
            </div>
        </div>

        {#if account.exchange === "bitget"}
            <div class="field-group mt-3">
                <label for={fieldId("passphrase")}
                    >{$_("settings.connections.passphrase")}</label
                >
                <div class="input-wrapper relative">
                    <input
                        id={fieldId("passphrase")}
                        type={shown.passphrase ? "text" : "password"}
                        bind:value={account.keys.passphrase}
                        class="api-input pr-8"
                        placeholder={$_(
                            "settings.connections.placeholders.passphrase",
                        )}
                    />
                    {@render revealButton("passphrase")}
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .api-card {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        overflow: hidden;
    }
    /* The active account is the one that signs orders; say so structurally,
       not only with a badge. */
    .api-card.active {
        border-color: var(--accent-color);
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
    }
    .active-badge {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--accent-color);
    }
    .body {
        padding: 1rem;
    }
    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--text-secondary);
        opacity: 0.3;
    }
    .status-dot.connected {
        background: var(--success-color);
        opacity: 1;
        box-shadow: 0 0 8px var(--success-color);
    }
    .api-input {
        width: 100%;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        padding: 0.5rem;
        border-radius: var(--radius-sm);
        font-size: var(--text-sm);
        color: var(--text-primary);
    }
    .api-input:focus {
        border-color: var(--accent-color);
        outline: none;
    }
    label {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--text-secondary);
        margin-bottom: 0.25rem;
        display: block;
    }
</style>
