<script lang="ts">
    import { uiState } from "../../stores/ui.svelte";
    import { _ } from "../../locales/i18n";
    import { trackClick } from "../../lib/actions";

    const ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`;
</script>

<button
    id="market-dashboard-btn"
    class="font-bold p-3 rounded-lg btn-secondary-action"
    title={$_("marketDashboard.buttonTitle") || "Market Overview"}
    onclick={() => uiState.toggleMarketDashboardModal(true)}
    use:trackClick={{
        category: "Navigation",
        action: "Click",
        name: "OpenMarketDashboard",
    }}
>
    {@html ICON}
</button>
