<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import { enhancedInput } from "../../../lib/actions/inputEnhancements";
    import { RSS_PRESETS } from "../../../config/rssPresets";

    // Helper for masked inputs or handling keys
    let showKeys: Record<string, boolean> = $state({});

    function toggleKeyVisibility(id: string) {
        showKeys[id] = !showKeys[id];
    }

    function addCustomFeed() {
        if (!settingsState.customRssFeeds) settingsState.customRssFeeds = [];
        if (settingsState.customRssFeeds.length < 5) {
            settingsState.customRssFeeds = [
                ...settingsState.customRssFeeds,
                "",
            ];
            // Clear news cache so new feeds are fetched immediately next time
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
</script>

<div
    class="integrations-tab flex flex-col gap-8"
    role="tabpanel"
    id="tab-integrations"
>
    <!-- Exchanges Section -->
    {#if settingsState.isPro}
        <section class="settings-section">
            <div class="flex items-center gap-2 mb-4">
                <div class="icon-box bg-blue-500/10 text-blue-500">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><rect
                            width="20"
                            height="12"
                            x="2"
                            y="6"
                            rx="2"
                        /><circle cx="12" cy="12" r="2" /><path
                            d="M6 12h.01M18 12h.01"
                        /></svg
                    >
                </div>
                <h3 class="section-title mb-0">
                    {$_("settings.integrations.exchanges") ||
                        "Exchange Connectivity"}
                </h3>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Bitunix -->
                <div class="api-card">
                    <div class="header">
                        <span class="font-bold text-sm">Bitunix</span>
                        <span
                            class="status-dot {settingsState.apiKeys.bitunix.key
                                ? 'connected'
                                : ''}"
                        ></span>
                    </div>
                    <div class="body">
                        <div class="field-group">
                            <label for="bitunix-api-key"
                                >{$_("settings.integrations.apiKey")}</label
                            >
                            <div class="input-wrapper relative">
                                <input
                                    id="bitunix-api-key"
                                    type={showKeys["bitunix_k"]
                                        ? "text"
                                        : "password"}
                                    bind:value={settingsState.apiKeys.bitunix.key}
                                    class="api-input pr-8"
                                    placeholder="{$_(
                                        'settings.integrations.enterKey',
                                    )} (Bitunix)"
                                />
                                <button
                                    class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    onclick={() => toggleKeyVisibility("bitunix_k")}
                                >
                                    {#if showKeys["bitunix_k"]}
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
                                            ><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path
                                                d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
                                            /><path
                                                d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7c.44 0 .87-.03 1.28-.08"
                                            /><path d="m2 2 20 20" /></svg
                                        >
                                    {:else}
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
                                            ><path
                                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
                                            /><circle cx="12" cy="12" r="3" /></svg
                                        >
                                    {/if}
                                </button>
                            </div>
                        </div>
                        <div class="field-group mt-3">
                            <label for="bitunix-api-secret"
                                >{$_("settings.integrations.apiSecret")}</label
                            >
                            <div class="input-wrapper relative">
                                <input
                                    id="bitunix-api-secret"
                                    type={showKeys["bitunix_s"]
                                        ? "text"
                                        : "password"}
                                    bind:value={
                                        settingsState.apiKeys.bitunix.secret
                                    }
                                    class="api-input pr-8"
                                    placeholder={$_(
                                        "settings.integrations.enterSecret",
                                    )}
                                />
                                <button
                                    class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    onclick={() => toggleKeyVisibility("bitunix_s")}
                                >
                                    {#if showKeys["bitunix_s"]}
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
                                            ><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path
                                                d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
                                            /><path
                                                d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7c.44 0 .87-.03 1.28-.08"
                                            /><path d="m2 2 20 20" /></svg
                                        >
                                    {:else}
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
                                            ><path
                                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
                                            /><circle cx="12" cy="12" r="3" /></svg
                                        >
                                    {/if}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Binance -->
                <div class="api-card">
                    <div class="header">
                        <span class="font-bold text-sm">Binance</span>
                        <span
                            class="status-dot {settingsState.apiKeys.binance.key
                                ? 'connected'
                                : ''}"
                        ></span>
                    </div>
                    <div class="body">
                        <div class="field-group">
                            <label for="binance-api-key"
                                >{$_("settings.integrations.apiKey")}</label
                            >
                            <div class="input-wrapper relative">
                                <input
                                    id="binance-api-key"
                                    type={showKeys["binance_k"]
                                        ? "text"
                                        : "password"}
                                    bind:value={settingsState.apiKeys.binance.key}
                                    class="api-input pr-8"
                                    placeholder="{$_(
                                        'settings.integrations.enterKey',
                                    )} (Binance)"
                                />
                                <button
                                    class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    onclick={() => toggleKeyVisibility("binance_k")}
                                >
                                    {#if showKeys["binance_k"]}
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
                                            ><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path
                                                d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
                                            /><path
                                                d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7c.44 0 .87-.03 1.28-.08"
                                            /><path d="m2 2 20 20" /></svg
                                        >
                                    {:else}
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
                                            ><path
                                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
                                            /><circle cx="12" cy="12" r="3" /></svg
                                        >
                                    {/if}
                                </button>
                            </div>
                        </div>
                        <div class="field-group mt-3">
                            <label for="binance-api-secret"
                                >{$_("settings.integrations.apiSecret")}</label
                            >
                            <div class="input-wrapper relative">
                                <input
                                    id="binance-api-secret"
                                    type={showKeys["binance_s"]
                                        ? "text"
                                        : "password"}
                                    bind:value={
                                        settingsState.apiKeys.binance.secret
                                    }
                                    class="api-input pr-8"
                                    placeholder={$_(
                                        "settings.integrations.enterSecret",
                                    )}
                                />
                                <button
                                    class="toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    onclick={() => toggleKeyVisibility("binance_s")}
                                >
                                    {#if showKeys["binance_s"]}
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
                                            ><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path
                                                d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
                                            /><path
                                                d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7c.44 0 .87-.03 1.28-.08"
                                            /><path d="m2 2 20 20" /></svg
                                        >
                                    {:else}
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
                                            ><path
                                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
                                            /><circle cx="12" cy="12" r="3" /></svg
                                        >
                                    {/if}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    {/if}

    <!-- Intelligence (AI) Section -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-8"
    >
        <div class="flex items-center gap-2 mb-4">
            <div class="icon-box bg-purple-500/10 text-purple-500">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="M12 2v8" /><path d="m4.93 4.93 5.66 5.66" /><path
                        d="M2 12h8"
                    /><path d="m4.93 19.07 5.66-5.66" /><path
                        d="M12 22v-8"
                    /><path d="m19.07 19.07-5.66-5.66" /><path
                        d="M22 12h-8"
                    /><path d="m19.07 4.93-5.66 5.66" /></svg
                >
            </div>
            <h3 class="section-title mb-0">
                {$_("settings.integrations.intelligence") || "AI Provider Keys"}
            </h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="api-card compact">
                <label for="openai-api-key">OpenAI (sk-...)</label>
                <input
                    id="openai-api-key"
                    type="password"
                    bind:value={settingsState.openaiApiKey}
                    class="api-input"
                />
            </div>
            <div class="api-card compact">
                <label for="gemini-api-key">Google Gemini</label>
                <input
                    id="gemini-api-key"
                    type="password"
                    bind:value={settingsState.geminiApiKey}
                    class="api-input"
                />
            </div>
            <div class="api-card compact">
                <label for="anthropic-api-key">Anthropic (Claude)</label>
                <input
                    id="anthropic-api-key"
                    type="password"
                    bind:value={settingsState.anthropicApiKey}
                    class="api-input"
                />
            </div>
        </div>
    </section>

    <!-- Data & Analytics Section -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-8"
    >
        <div class="flex items-center gap-2 mb-4">
            <div class="icon-box bg-emerald-500/10 text-emerald-500">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path
                        d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7"
                    /><path d="m22 22-5-5" /><circle
                        cx="17"
                        cy="17"
                        r="3"
                    /></svg
                >
            </div>
            <h3 class="section-title mb-0">
                {$_("settings.integrations.analytics") || "News & Market Data"}
            </h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- CryptoPanic -->
            <div class="api-card">
                <div class="header">
                    <span class="font-bold text-sm">CryptoPanic</span>
                </div>
                <div class="body">
                    <div class="field-group">
                        <label for="cryptopanic-api-key"
                            >{$_("settings.integrations.apiKey")}</label
                        >
                        <input
                            id="cryptopanic-api-key"
                            type="password"
                            bind:value={settingsState.cryptoPanicApiKey}
                            class="api-input"
                        />
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-3">
                        <div class="field-group">
                            <label for="cryptopanic-filter"
                                >{$_("settings.integrations.filter")}</label
                            >
                            <select
                                id="cryptopanic-filter"
                                bind:value={settingsState.cryptoPanicFilter}
                                class="api-input py-1 text-xs"
                            >
                                <option value="all">All</option>
                                <option value="hot">Hot</option>
                                <option value="bullish">Bullish</option>
                                <option value="bearish">Bearish</option>
                            </select>
                        </div>
                        <div class="field-group">
                            <label for="cryptopanic-plan"
                                >{$_("settings.integrations.plan")}</label
                            >
                            <select
                                id="cryptopanic-plan"
                                bind:value={settingsState.cryptoPanicPlan}
                                class="api-input py-1 text-xs"
                            >
                                <option value="free">Free</option>
                                <option value="pro">Pro</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- CMC / NewsAPI -->
            <div class="flex flex-col gap-4">
                <div class="api-card compact">
                    <label for="cmc-api-key"
                        >{$_("settings.integrations.cmcApi")}</label
                    >
                    <input
                        id="cmc-api-key"
                        type="password"
                        bind:value={settingsState.cmcApiKey}
                        class="api-input"
                    />
                </div>
                <div class="api-card compact">
                    <label for="newsapi-key"
                        >{$_("settings.integrations.newsApi")}</label
                    >
                    <input
                        id="newsapi-key"
                        type="password"
                        bind:value={settingsState.newsApiKey}
                        class="api-input"
                    />
                </div>
            </div>
        </div>
    </section>

    <!-- RSS Feeds Section -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-8"
    >
        <div class="flex items-center gap-2 mb-4">
            <div class="icon-box bg-orange-500/10 text-orange-500">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="M4 11a9 9 0 0 1 9 9" /><path
                        d="M4 4a16 16 0 0 1 16 16"
                    /><circle cx="5" cy="19" r="1" /></svg
                >
            </div>
            <h3 class="section-title mb-0">
                {$_("settings.integrations.rssPresets") || "RSS News Sources"}
            </h3>
        </div>

        <p class="text-xs text-[var(--text-secondary)] mb-4">
            {$_("settings.integrations.rssPresetsDesc")}
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {#each RSS_PRESETS as preset}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                    role="button"
                    tabindex="0"
                    class="api-card compact flex-row items-center justify-between cursor-pointer transition-colors duration-200"
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
                            )}
                        >
                            {preset.name}
                        </span>
                        <span class="text-[10px] text-[var(--text-secondary)]">
                            {preset.description || preset.url}
                        </span>
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

        <!-- Filter Options -->
        <div
            class="api-card compact flex-row items-center justify-between mb-8 p-3 bg-[var(--bg-secondary)]/50 rounded-lg border border-[var(--border-color)]"
        >
            <div class="flex flex-col">
                <span class="font-bold text-sm"
                    >{$_("settings.integrations.rssFilterBySymbol") ||
                        "Filter by active Symbol"}</span
                >
                <span class="text-[10px] text-[var(--text-secondary)]"
                    >{$_("settings.integrations.rssFilterBySymbolDesc") ||
                        "Only show news matching the current chart symbol"}</span
                >
            </div>
            <Toggle bind:checked={settingsState.rssFilterBySymbol} />
        </div>
        <!-- Custom Feeds -->
        <div class="mt-6">
            <div class="flex items-center justify-between mb-2">
                <h4
                    class="text-xs font-bold text-[var(--text-secondary)] uppercase"
                >
                    {$_("settings.integrations.customRssFeeds")}
                </h4>
                <button
                    class="text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] px-2 py-1 rounded border border-[var(--border-color)] transition-colors"
                    onclick={addCustomFeed}
                    disabled={(settingsState.customRssFeeds?.length || 0) >= 5}
                >
                    + {$_("settings.integrations.addFeed")}
                </button>
            </div>
            <p class="text-xs text-[var(--text-secondary)] mb-3">
                {$_("settings.integrations.customRssFeedsDesc")}
            </p>

            <div class="flex flex-col gap-2">
                {#if settingsState.customRssFeeds}
                    {#each settingsState.customRssFeeds as feed, i}
                        <div class="flex items-center gap-2">
                            <input
                                type="url"
                                bind:value={settingsState.customRssFeeds[i]}
                                class="api-input"
                                placeholder="https://example.com/feed.xml"
                            />
                            <button
                                class="text-red-500 hover:text-red-400 p-2"
                                onclick={() => removeCustomFeed(i)}
                                title={$_("settings.integrations.removeFeed")}
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
            </div>
        </div>
    </section>

    <!-- Utilities (Images) Section -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-8"
    >
        <div class="flex items-center gap-2 mb-4">
            <div class="icon-box bg-orange-500/10 text-orange-500">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><rect
                        width="18"
                        height="18"
                        x="3"
                        y="3"
                        rx="2"
                        ry="2"
                    /><circle cx="9" cy="9" r="2" /><path
                        d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
                    /></svg
                >
            </div>
            <h3 class="section-title mb-0">
                {$_("settings.integrations.utilities") || "Media Storage"}
            </h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="api-card">
                <div class="header">
                    <span class="font-bold text-sm"
                        >{$_("settings.integrations.imgbbPrimary")}</span
                    >
                </div>
                <div class="body">
                    <div class="field-group">
                        <label for="imgbb-api-key"
                            >{$_("settings.integrations.apiKey")}</label
                        >
                        <input
                            id="imgbb-api-key"
                            type="password"
                            bind:value={settingsState.imgbbApiKey}
                            class="api-input"
                        />
                    </div>
                    <div class="field-group mt-3">
                        <label for="imgbb-expiration"
                            >{$_("settings.integrations.autoExpiration")}</label
                        >
                        <input
                            id="imgbb-expiration"
                            type="number"
                            bind:value={settingsState.imgbbExpiration}
                            class="api-input"
                            use:enhancedInput
                        />
                    </div>
                </div>
            </div>
            <div class="api-card">
                <div class="header">
                    <span class="font-bold text-sm"
                        >{$_("settings.integrations.imgurOther")}</span
                    >
                </div>
                <div class="body">
                    <div class="field-group">
                        <label for="imgur-client-id"
                            >{$_("settings.integrations.imgurClientId")}</label
                        >
                        <input
                            id="imgur-client-id"
                            type="password"
                            bind:value={settingsState.imgurClientId}
                            class="api-input"
                        />
                    </div>
                </div>
            </div>
        </div>
    </section>
</div>

<style>
    .integrations-tab {
        padding: 0.5rem;
    }

    .section-title {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--text-primary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .icon-box {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
    }

    /* API Card Styling */
    .api-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 1rem;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: all 0.2s ease;
    }

    .api-card:hover {
        border-color: var(--accent-color);
    }

    .api-card.compact {
        padding: 0.75rem 1rem;
        gap: 0.25rem;
    }
    .api-card.compact label {
        font-size: 10px;
        font-weight: 700;
        color: var(--text-secondary);
        text-transform: uppercase;
    }

    .api-card .header {
        padding: 0.75rem 1rem;
        background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .api-card .body {
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

    .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .field-group label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
    }

    .api-input {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.4rem 0.6rem;
        font-size: 0.8125rem;
        color: var(--text-primary);
        font-family: var(--font-mono);
        outline: none;
        width: 100%;
        transition: all 0.2s ease;
    }

    .api-input:focus {
        border-color: var(--accent-color);
    }
</style>
