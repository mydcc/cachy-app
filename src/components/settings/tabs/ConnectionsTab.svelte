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
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import { RSS_PRESETS } from "../../../config/rssPresets";
    import ApiQuotaStatus from "../ApiQuotaStatus.svelte";

    // FEAT-0333: credentials live on named accounts now. The inputs bind into
    // the account object itself, so the venue lookup happens once per venue
    // rather than once per field.
    const bitunixAccount = $derived(settingsState.accountFor("bitunix"));
    const bitgetAccount = $derived(settingsState.accountFor("bitget"));

    // Helper for masking inputs
    let showKeys: Record<string, boolean> = $state({});

    function toggleKeyVisibility(id: string) {
        showKeys[id] = !showKeys[id];
    }

    // BUG-0052: self-service access token. POST /api/auth/token is
    // deliberately unguarded — this is how a client gets its first token —
    // so this is a plain fetch, not appFetch.
    let tokenStatus: "idle" | "loading" | "error" = $state("idle");

    async function createAccessToken() {
        tokenStatus = "loading";
        try {
            const res = await fetch("/api/auth/token", { method: "POST" });
            if (!res.ok) throw new Error("token request failed");
            const data = await res.json();
            settingsState.appAccessToken = data.token;
            tokenStatus = "idle";
        } catch {
            tokenStatus = "error";
        }
    }

    // RSS Feed Management
    function togglePreset(id: string) {
        if (!settingsState.rssPresets) settingsState.rssPresets = [];
        const current = settingsState.rssPresets;
        if (current.includes(id)) {
            settingsState.rssPresets = current.filter((p) => p !== id);
        } else {
            settingsState.rssPresets = [...current, id];
        }
        localStorage.removeItem("cachy_news_cache");
    }

    function addCustomFeed() {
        if (!settingsState.customRssFeeds) settingsState.customRssFeeds = [];
        if (settingsState.customRssFeeds.length < 5) {
            settingsState.customRssFeeds = [
                ...settingsState.customRssFeeds,
                "",
            ];
            localStorage.removeItem("cachy_news_cache");
        }
    }

    function removeCustomFeed(index: number) {
        if (!settingsState.customRssFeeds) return;
        const newFeeds = [...settingsState.customRssFeeds];
        newFeeds.splice(index, 1);
        settingsState.customRssFeeds = newFeeds;
        localStorage.removeItem("cachy_news_cache");
    }

    const activeSubTab = $derived(uiState.settingsConnectionsSubTab);

    const subTabs = [
        {
            id: "exchanges",
            label: $_("settings.tabs.connections"),
        },
        {
            id: "data",
            label: $_("settings.tabs.integrations"),
        },
        { id: "rss", label: $_("settings.connections.rss") },
    ];
</script>

<div
    class="connections-tab h-full flex flex-col gap-3 sm:gap-4 md:gap-6"
    role="tabpanel"
    id="tab-connections"
>
    <!-- Sub-Navigation -->
    <div
        class="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2 shrink-0"
    >
        {#each subTabs as tab}
            <button
                class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {activeSubTab ===
                tab.id
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}"
                onclick={() => (uiState.settingsConnectionsSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {#if settingsState.decryptionFailures > 0 || settingsState.deviceKeyLost}
            <div class="mb-6 flex items-start gap-3 text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--warning-color)] p-4 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 mt-0.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                <div class="flex flex-col">
                    <strong class="text-[var(--text-primary)] mb-1">
                        {#if settingsState.deviceKeyLost}
                            {$_("settings.deviceKeyLostTitle")}
                        {:else}
                            {$_("settings.decryptionWarningTitle")} ({settingsState.decryptionFailures})
                        {/if}
                    </strong>
                    <span class="text-[var(--text-secondary)] text-xs">
                        {#if settingsState.deviceKeyLost}
                            {$_("settings.deviceKeyLostDesc")}
                        {:else}
                            {$_("settings.decryptionWarningMessage")}
                        {/if}
                    </span>
                </div>
            </div>
        {/if}

        <!-- Exchanges -->
        {#if activeSubTab === "exchanges"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.connections.exchanges")}
                </h3>

                <div class="api-card mb-6">
                    <div class="header">
                        <span class="font-bold text-sm">{$_("settings.connections.serverSecurity")}</span>
                        <span class="status-dot {settingsState.appAccessToken ? "connected" : ""}"></span>
                    </div>
                    <div class="body">
                        <div class="field-group">
                            <label for="app-access-token">{$_("settings.connections.appAccessToken")}</label>
                            <div class="input-wrapper relative">
                                <input
                                    id="app-access-token"
                                    type={showKeys["app_token"] ? "text" : "password"}
                                    bind:value={settingsState.appAccessToken}
                                    class="api-input pr-8"
                                    placeholder={$_("settings.connections.placeholders.appAccessToken")}
                                />
                                <button
                                    class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                                    onclick={() => toggleKeyVisibility("app_token")}
                                    aria-label={$_("settings.connections.aria.toggleToken")}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                            </div>
                            <button
                                class="mt-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] transition-colors disabled:opacity-50"
                                onclick={createAccessToken}
                                disabled={tokenStatus === "loading"}
                            >
                                {$_("settings.connections.createToken")}
                            </button>
                            {#if tokenStatus === "error"}
                                <p class="text-xs text-[var(--danger-color)] mt-1">{$_("settings.connections.createTokenError")}</p>
                            {/if}
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Bitunix -->
                    <div class="api-card">
                        <div class="header">
                            <span class="font-bold text-sm">{$_("settings.connections.providers.bitunix")}</span>
                            <span
                                class="status-dot {bitunixAccount.keys.key
                                    ? 'connected'
                                    : ''}"
                            ></span>
                        </div>
                        <div class="body">
                            <div class="field-group">
                                <label for="bitunix-key"
                                    >{$_("settings.connections.apiKey")}</label
                                >
                                <div class="input-wrapper relative">
                                    <input
                                        id="bitunix-key"
                                        type={showKeys["bitunix_k"]
                                            ? "text"
                                            : "password"}
                                        bind:value={
                                            bitunixAccount.keys.key
                                        }
                                        class="api-input pr-8"
                                        placeholder={$_("settings.connections.placeholders.apiKey")}
                                    />
                                    <button
                                        class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                                        onclick={() =>
                                            toggleKeyVisibility("bitunix_k")}
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
                                            ><path
                                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
                                            /><circle
                                                cx="12"
                                                cy="12"
                                                r="3"
                                            /></svg
                                        >
                                    </button>
                                </div>
                            </div>
                            <div class="field-group mt-3">
                                <label for="bitunix-secret"
                                    >{$_("settings.connections.apiSecret")}</label
                                >
                                <div class="input-wrapper relative">
                                    <input
                                        id="bitunix-secret"
                                        type={showKeys["bitunix_s"]
                                            ? "text"
                                            : "password"}
                                        bind:value={
                                            bitunixAccount.keys.secret
                                        }
                                        class="api-input pr-8"
                                        placeholder={$_("settings.connections.placeholders.apiSecret")}
                                    />
                                    <button
                                        class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                                        onclick={() =>
                                            toggleKeyVisibility("bitunix_s")}
                                        aria-label={$_("settings.connections.aria.toggleSecret")}
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
                                            ><path
                                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
                                            /><circle
                                                cx="12"
                                                cy="12"
                                                r="3"
                                            /></svg
                                        >
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Bitget -->
                    <div class="api-card">
                        <div class="header">
                            <span class="font-bold text-sm">{$_("settings.connections.providers.bitget")}</span>
                            <span
                                class="status-dot {bitgetAccount.keys.key &&
                                bitgetAccount.keys.passphrase
                                    ? 'connected'
                                    : ''}"
                            ></span>
                        </div>
                        <div class="body">
                            <div class="field-group">
                                <label for="bitget-key"
                                    >{$_("settings.connections.apiKey")}</label
                                >
                                <div class="input-wrapper relative">
                                    <input
                                        id="bitget-key"
                                        type={showKeys["bitget_k"]
                                            ? "text"
                                            : "password"}
                                        bind:value={
                                            bitgetAccount.keys.key
                                        }
                                        class="api-input pr-8"
                                        placeholder={$_("settings.connections.placeholders.apiKey")}
                                    />
                                    <button
                                        class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                                        onclick={() =>
                                            toggleKeyVisibility("bitget_k")}
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
                                            ><path
                                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
                                            /><circle
                                                cx="12"
                                                cy="12"
                                                r="3"
                                            /></svg
                                        >
                                    </button>
                                </div>
                            </div>
                            <div class="field-group mt-3">
                                <label for="bitget-secret"
                                    >{$_(
                                        "settings.connections.apiSecret",
                                    )}</label
                                >
                                <div class="input-wrapper relative">
                                    <input
                                        id="bitget-secret"
                                        type={showKeys["bitget_s"]
                                            ? "text"
                                            : "password"}
                                        bind:value={
                                            bitgetAccount.keys.secret
                                        }
                                        class="api-input pr-8"
                                        placeholder={$_("settings.connections.placeholders.apiSecret")}
                                    />
                                    <button
                                        class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                                        onclick={() =>
                                            toggleKeyVisibility("bitget_s")}
                                        aria-label={$_("settings.connections.aria.toggleSecret")}
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
                                            ><path
                                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
                                            /><circle
                                                cx="12"
                                                cy="12"
                                                r="3"
                                            /></svg
                                        >
                                    </button>
                                </div>
                            </div>
                            <div class="field-group mt-3">
                                <label for="bitget-pass"
                                    >{$_("settings.connections.passphrase")}</label
                                >
                                <div class="input-wrapper relative">
                                    <input
                                        id="bitget-pass"
                                        type={showKeys["bitget_p"]
                                            ? "text"
                                            : "password"}
                                        bind:value={
                                            bitgetAccount.keys.passphrase
                                        }
                                        class="api-input pr-8"
                                        placeholder={$_("settings.connections.placeholders.passphrase")}
                                    />
                                    <button
                                        class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                                        onclick={() =>
                                            toggleKeyVisibility("bitget_p")}
                                        aria-label={$_("settings.connections.aria.togglePassphrase")}
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
                                            ><path
                                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
                                            /><circle
                                                cx="12"
                                                cy="12"
                                                r="3"
                                            /></svg
                                        >
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        {/if}

        <!-- Data Services -->
        {#if activeSubTab === "data"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.connections.dataServices")}
                </h3>

                <div class="api-card mb-6">
                    <div class="header">
                        <span class="font-bold text-sm">{$_("settings.connections.serverSecurity")}</span>
                        <span class="status-dot {settingsState.appAccessToken ? "connected" : ""}"></span>
                    </div>
                    <div class="body">
                        <div class="field-group">
                            <label for="app-access-token-data">{$_("settings.connections.appAccessToken")}</label>
                            <div class="input-wrapper relative">
                                <input
                                    id="app-access-token-data"
                                    type={showKeys["app_token"] ? "text" : "password"}
                                    bind:value={settingsState.appAccessToken}
                                    class="api-input pr-8"
                                    placeholder={$_("settings.connections.placeholders.appAccessToken")}
                                />
                                <button
                                    class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                                    onclick={() => toggleKeyVisibility("app_token")}
                                    aria-label={$_("settings.connections.aria.toggleToken")}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                            </div>
                            <button
                                class="mt-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] transition-colors disabled:opacity-50"
                                onclick={createAccessToken}
                                disabled={tokenStatus === "loading"}
                            >
                                {$_("settings.connections.createToken")}
                            </button>
                            {#if tokenStatus === "error"}
                                <p class="text-xs text-[var(--danger-color)] mt-1">{$_("settings.connections.createTokenError")}</p>
                            {/if}
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- CryptoPanic -->
                    <div class="api-card">
                        <div class="header">
                            <span class="font-bold text-sm">{$_("settings.connections.providers.cryptopanic")}</span>
                        </div>
                        <div class="body">
                            <div class="field-group">
                                <label for="cp-key">{$_("settings.connections.apiKey")}</label>
                                <input
                                    id="cp-key"
                                    type="password"
                                    bind:value={settingsState.cryptoPanicApiKey}
                                    class="api-input"
                                />
                            </div>
                            <div class="grid grid-cols-2 gap-2 mt-3">
                                <div class="field-group">
                                    <label for="cp-filter"
                                        >{$_("settings.connections.filter")}</label
                                    >
                                    <select
                                        id="cp-filter"
                                        bind:value={
                                            settingsState.cryptoPanicFilter
                                        }
                                        class="api-input py-1 text-xs"
                                    >
                                        <option value="all"
                                            >{$_(
                                                "settings.connections.filterAll",
                                            )}</option
                                        >
                                        <option value="hot"
                                            >{$_(
                                                "settings.connections.filterHot",
                                            )}</option
                                        >
                                        <option value="bullish"
                                            >{$_(
                                                "settings.connections.filterBullish",
                                            )}</option
                                        >
                                        <option value="bearish"
                                            >{$_(
                                                "settings.connections.filterBearish",
                                            )}</option
                                        >
                                        <option value="important"
                                            >{$_(
                                                "settings.connections.filterImportant",
                                            )}</option
                                        >
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label for="cp-plan"
                                        >{$_(
                                            "settings.connections.plan",
                                        )}</label
                                    >
                                    <select
                                        id="cp-plan"
                                        bind:value={
                                            settingsState.cryptoPanicPlan
                                        }
                                        class="api-input py-1 text-xs"
                                    >
                                        <option value="developer"
                                            >{$_(
                                                "settings.connections.planFree",
                                            )}</option
                                        >
                                        <option value="growth"
                                            >{$_(
                                                "settings.connections.planPro",
                                            )}</option
                                        >
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Other APIs -->
                    <div class="flex flex-col gap-4">
                        <div class="api-card compact">
                            <label for="cmc-key">{$_("settings.connections.labels.cmc")}</label>
                            <input
                                id="cmc-key"
                                type="password"
                                bind:value={settingsState.cmcApiKey}
                                class="api-input"
                            />
                        </div>
                        <div class="api-card compact">
                            <label for="news-key">{$_("settings.connections.labels.newsapi")}</label>
                            <input
                                id="news-key"
                                type="password"
                                bind:value={settingsState.newsApiKey}
                                class="api-input"
                            />
                        </div>
                        <div class="api-card">
                            <div class="header">
                                <span class="font-bold text-sm">{$_("settings.connections.labels.imgbb")}</span>
                                <span class="status-dot {settingsState.imgbbApiKey ? "connected" : ""}"></span>
                            </div>
                            <div class="body">
                                <p class="text-xs text-[var(--text-secondary)] mb-3">
                                    Required for screenshot uploads.
                                    <a
                                        href="https://api.imgbb.com/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="text-[var(--accent-color)] hover:underline"
                                    >
                                        Get your API key →
                                    </a>
                                </p>
                                <div class="field-group">
                                    <label for="imgbb-key">{$_("settings.connections.apiKey")} <span class="text-[var(--danger-color)]">*</span></label>
                                    <div class="input-wrapper relative">
                                        <input
                                            id="imgbb-key"
                                            type={showKeys["imgbb_k"] ? "text" : "password"}
                                            bind:value={settingsState.imgbbApiKey}
                                            class="api-input pr-8"
                                            required
                                            placeholder="Enter your imgbb API key..."
                                        />
                                        <button
                                            class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                                            onclick={() => toggleKeyVisibility("imgbb_k")}
                                            aria-label={$_("settings.connections.aria.toggleKey")}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- API Quota Status -->
                <div class="mt-6">
                    <ApiQuotaStatus />
                </div>
            </section>
        {/if}

        <!-- RSS Feeds -->
        {#if activeSubTab === "rss"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.connections.rss")}
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {#each RSS_PRESETS as preset}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <div
                            role="button"
                            tabindex="0"
                            class="api-card compact flex-row items-center justify-between cursor-pointer transition-colors"
                            onclick={() => togglePreset(preset.id)}
                            class:border-[var(--accent-color)]={settingsState.rssPresets?.includes(
                                preset.id,
                            )}
                            class:bg-[var(--bg-secondary)]={settingsState.rssPresets?.includes(
                                preset.id,
                            )}
                        >
                            <div class="flex flex-col">
                                <span
                                    class="font-bold text-sm"
                                    class:text-[var(--accent-color)]={settingsState.rssPresets?.includes(
                                        preset.id,
                                    )}>{preset.name}</span
                                >
                                <span
                                    class="text-[10px] text-[var(--text-secondary)]"
                                    >{preset.url}</span
                                >
                            </div>
                            <div class="pointer-events-none">
                                <Toggle
                                    checked={settingsState.rssPresets?.includes(
                                        preset.id,
                                    ) ?? false}
                                />
                            </div>
                        </div>
                    {/each}
                </div>

                <!-- Custom Feeds -->
                <h4
                    class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2"
                >
                    {$_("settings.connections.customFeeds")}
                </h4>
                <div class="flex flex-col gap-2">
                    {#if settingsState.customRssFeeds}
                        {#each settingsState.customRssFeeds as _feed, i}
                            <div class="flex items-center gap-2">
                                <input
                                    type="url"
                                    bind:value={settingsState.customRssFeeds[i]}
                                    class="api-input"
                                    placeholder={$_("settings.connections.placeholders.url")}
                                />
                                <button
                                    class="text-red-500 hover:text-red-400 p-2"
                                    onclick={() => removeCustomFeed(i)}
                                    aria-label={$_("settings.connections.aria.removeFeed")}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path d="M18 6 6 18" /><path
                                            d="m6 6 12 12"
                                        /></svg
                                    >
                                </button>
                            </div>
                        {/each}
                    {/if}
                    <button
                        class="text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] px-2 py-1 rounded border border-[var(--border-color)] w-max"
                        onclick={addCustomFeed}
                        disabled={(settingsState.customRssFeeds?.length || 0) >=
                            5}
                    >
                        + {$_("settings.connections.addFeed")}
                    </button>
                </div>
            </section>
        {/if}
    </div>
</div>

<style>
    .section-title {
        font-size: var(--text-sm);
        font-weight: var(--font-bold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
    }
    .api-card {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        overflow: hidden;
    }
    .api-card.compact {
        padding: var(--space-3);
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
    }
    .body {
        padding: var(--space-4);
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
        padding: var(--space-2);
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
        margin-bottom: var(--space-1);
        display: block;
    }
</style>
