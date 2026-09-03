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
  The account list — FEAT-0026.

  Replaces the two fixed venue cards `ConnectionsTab` used to render. Adding,
  renaming, switching and removing all live here, and each has a reason to be
  careful:

  - **Switching** obeys the `account-switch` confirmation policy. The
    authorisation parameter on `setActiveAccount` makes skipping the prompt a
    compile error rather than an oversight.
  - **Removing** always asks, unconditionally and outside the policy: it
    deletes credentials from this device and cannot be undone. A destructive
    irreversible action needs no switch to justify a prompt, and adding one to
    FEAT-0024's catalogue would drag a settings row, a default and locale keys
    along with it.
  - **Renaming** writes through to the live object rather than replacing it,
    because the credential inputs in `AccountCard` bind into that object.
-->

<script lang="ts">
    import { _ } from "../../locales/i18n";
    import { settingsState } from "../../stores/settings.svelte";
    import { confirmationPolicyStore } from "../../stores/confirmationPolicy.svelte";
    import { modalState } from "../../stores/modal.svelte";
    import {
        EXCHANGES,
        type ExchangeAccount,
    } from "../../stores/settings/accounts";
    import AccountCard from "./AccountCard.svelte";
    import ConfirmActionModal from "../shared/ConfirmActionModal.svelte";

    /** The switch waiting on a human, when the policy asks first. */
    let pendingSwitch = $state<ExchangeAccount | null>(null);

    const activeAccount = $derived(
        settingsState.accounts?.find(
            (account) => account.id === settingsState.activeAccountId,
        ),
    );

    /**
     * With one account left there is nothing to switch to and removal is
     * refused by the store anyway; disabling the control says so before the
     * user finds out by clicking.
     */
    const canRemove = $derived((settingsState.accounts?.length ?? 0) > 1);

    /*
     * Three distinct labels, deliberately. `ConfirmActionModal` keys its
     * `{#each}` on `fact.label`, so two facts sharing one would drop a row —
     * and the row it drops would be one naming an account.
     */
    const switchFacts = $derived.by(() => {
        const target = pendingSwitch;
        if (!target) return [];
        return [
            {
                label: $_("settings.connections.accounts.switchFrom"),
                value: activeAccount?.name ?? settingsState.apiProvider,
            },
            {
                label: $_("settings.connections.accounts.switchTo"),
                value: target.name,
            },
            {
                label: $_("settings.connections.accounts.exchange"),
                value: target.exchange === "bitget" ? "Bitget" : "Bitunix",
            },
        ];
    });

    function handleSwitch(target: ExchangeAccount) {
        if (target.id === settingsState.activeAccountId) return;

        const auth = confirmationPolicyStore.authorizeSwitchUnprompted();
        if (!auth) {
            pendingSwitch = target;
            return;
        }
        settingsState.setActiveAccount(target.id, auth);
    }

    function confirmSwitch(confirmedAt: number) {
        const target = pendingSwitch;
        pendingSwitch = null;
        if (!target) return;
        settingsState.setActiveAccount(
            target.id,
            confirmationPolicyStore.authorizeSwitchFromConfirmation(confirmedAt),
        );
    }

    async function handleRemove(account: ExchangeAccount) {
        // Unconditional, and the message is specific about what is and is not
        // destroyed: the keys go, the positions at the exchange do not.
        const confirmed = await modalState.show(
            $_("settings.connections.accounts.removeTitle"),
            $_("settings.connections.accounts.removeMessage", {
                values: { name: account.name },
            }),
            "confirm",
        );
        if (confirmed === true) settingsState.removeAccount(account.id);
    }
</script>

<div class="flex flex-col gap-4">
    {#each settingsState.accounts ?? [] as account (account.id)}
        <div class="account-row">
            <AccountCard
                {account}
                isActive={account.id === settingsState.activeAccountId}
            />

            <div class="controls">
                <div class="field-group flex-1">
                    <label for="account-{account.id}-name"
                        >{$_("settings.connections.accounts.name")}</label
                    >
                    <input
                        id="account-{account.id}-name"
                        class="api-input"
                        value={account.name}
                        onchange={(e) =>
                            settingsState.renameAccount(
                                account.id,
                                e.currentTarget.value,
                            )}
                        placeholder={$_(
                            "settings.connections.accounts.namePlaceholder",
                        )}
                    />
                </div>

                <div class="flex items-end gap-2">
                    <button
                        class="action bg-accent-paired"
                        disabled={account.id === settingsState.activeAccountId}
                        onclick={() => handleSwitch(account)}
                    >
                        {$_("settings.connections.accounts.makeActive")}
                    </button>
                    <button
                        class="action bg-danger-paired"
                        disabled={!canRemove}
                        title={canRemove
                            ? undefined
                            : $_(
                                  "settings.connections.accounts.removeLastHint",
                              )}
                        onclick={() => handleRemove(account)}
                    >
                        {$_("settings.connections.accounts.remove")}
                    </button>
                </div>
            </div>
        </div>
    {/each}

    <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-[var(--text-secondary)]"
            >{$_("settings.connections.accounts.addLabel")}</span
        >
        {#each EXCHANGES as exchange (exchange)}
            <button
                class="action bg-accent-paired"
                onclick={() => settingsState.addAccount(exchange)}
            >
                + {exchange === "bitget" ? "Bitget" : "Bitunix"}
            </button>
        {/each}
    </div>
</div>

{#if pendingSwitch}
    <ConfirmActionModal
        isOpen={true}
        action="account-switch"
        facts={switchFacts}
        onconfirm={confirmSwitch}
        oncancel={() => (pendingSwitch = null)}
    />
{/if}

<style>
    .account-row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .controls {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
    }
    .action {
        padding: 0.4rem 0.75rem;
        border-radius: var(--radius-sm);
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        white-space: nowrap;
    }
    .action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
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
