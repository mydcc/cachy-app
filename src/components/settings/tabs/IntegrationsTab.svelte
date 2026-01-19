<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import { enhancedInput } from "../../../lib/actions/inputEnhancements";

    // Helper for masked inputs or handling keys
    let showKeys: Record<string, boolean> = $state({});

    function toggleKeyVisibility(id: string) {
        showKeys[id] = !showKeys[id];
    }
</script>

<div
    class="integrations-tab flex flex-col gap-8"
    role="tabpanel"
    id="tab-integrations"
>
    <!-- Exchanges Section -->
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
                    ><rect width="20" height="12" x="2" y="6" rx="2" /><circle
                        cx="12"
                        cy="12"
                        r="2"
                    /><path d="M6 12h.01M18 12h.01" /></svg
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
                        <label for="bitunix-api-key">API Key</label>
                        <input
                            id="bitunix-api-key"
                            type={showKeys["bitunix_k"] ? "text" : "password"}
                            bind:value={settingsState.apiKeys.bitunix.key}
                            class="api-input"
                            placeholder="Enter Bitunix API Key"
                        />
                    </div>
                    <div class="field-group mt-3">
                        <label for="bitunix-api-secret">API Secret</label>
                        <input
                            id="bitunix-api-secret"
                            type={showKeys["bitunix_s"] ? "text" : "password"}
                            bind:value={settingsState.apiKeys.bitunix.secret}
                            class="api-input"
                            placeholder="Enter Bitunix Secret"
                        />
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
                        <label for="binance-api-key">API Key</label>
                        <input
                            id="binance-api-key"
                            type={showKeys["binance_k"] ? "text" : "password"}
                            bind:value={settingsState.apiKeys.binance.key}
                            class="api-input"
                            placeholder="Enter Binance API Key"
                        />
                    </div>
                    <div class="field-group mt-3">
                        <label for="binance-api-secret">API Secret</label>
                        <input
                            id="binance-api-secret"
                            type={showKeys["binance_s"] ? "text" : "password"}
                            bind:value={settingsState.apiKeys.binance.secret}
                            class="api-input"
                            placeholder="Enter Binance Secret"
                        />
                    </div>
                </div>
            </div>
        </div>
    </section>

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
                        <label for="cryptopanic-api-key">API Key</label>
                        <input
                            id="cryptopanic-api-key"
                            type="password"
                            bind:value={settingsState.cryptoPanicApiKey}
                            class="api-input"
                        />
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-3">
                        <div class="field-group">
                            <label for="cryptopanic-filter">Filter</label>
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
                            <label for="cryptopanic-plan">Plan</label>
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
                    <label for="cmc-api-key">CoinMarketCap API</label>
                    <input
                        id="cmc-api-key"
                        type="password"
                        bind:value={settingsState.cmcApiKey}
                        class="api-input"
                    />
                </div>
                <div class="api-card compact">
                    <label for="newsapi-key">NewsAPI.org Key</label>
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
                    <span class="font-bold text-sm">ImgBB (Primary)</span>
                </div>
                <div class="body">
                    <div class="field-group">
                        <label for="imgbb-api-key">API Key</label>
                        <input
                            id="imgbb-api-key"
                            type="password"
                            bind:value={settingsState.imgbbApiKey}
                            class="api-input"
                        />
                    </div>
                    <div class="field-group mt-3">
                        <label for="imgbb-expiration"
                            >Auto-Expiration (Sec)</label
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
                    <span class="font-bold text-sm">Imgur / Other</span>
                </div>
                <div class="body">
                    <div class="field-group">
                        <label for="imgur-client-id">Imgur Client ID</label>
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
