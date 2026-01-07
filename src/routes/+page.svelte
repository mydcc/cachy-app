<script lang="ts">
    import GeneralInputs from '../components/inputs/GeneralInputs.svelte';
    import PortfolioInputs from '../components/inputs/PortfolioInputs.svelte';
    import TagInputs from '../components/inputs/TagInputs.svelte';
    import TradeSetupInputs from '../components/inputs/TradeSetupInputs.svelte';
    import TakeProfitTargets from '../components/inputs/TakeProfitTargets.svelte';
    import CustomModal from '../components/shared/CustomModal.svelte';
    import VisualBar from '../components/shared/VisualBar.svelte';
    import { CONSTANTS, themes, themeIcons, icons } from '../lib/constants';
    import { app } from '../services/app';
    import { tradeStore, updateTradeStore, resetAllInputs, toggleAtrInputs } from '../stores/tradeStore';
    import { resultsStore } from '../stores/resultsStore';
    import { presetStore } from '../stores/presetStore';
    import { uiStore } from '../stores/uiStore';
    import { settingsStore } from '../stores/settingsStore'; // Import settings store
    import { favoritesStore } from '../stores/favoritesStore'; // Import favorites store
    import { modalManager } from '../services/modalManager';
    import { onMount } from 'svelte';
    import { _, locale } from '../locales/i18n'; // Import locale
    import { get } from 'svelte/store'; // Import get
    import { loadInstruction } from '../services/markdownLoader';
    import { formatDynamicDecimal } from '../utils/utils';
    import { trackClick } from '../lib/actions';
import { trackCustomEvent } from '../services/trackingService';
    import { createBackup, restoreFromBackup } from '../services/backupService';
    
    import type { IndividualTpResult } from '../stores/types';
    import SummaryResults from '../components/results/SummaryResults.svelte';
    import LanguageSwitcher from '../components/shared/LanguageSwitcher.svelte';
    import Tooltip from '../components/shared/Tooltip.svelte';
    import JournalView from '../components/shared/JournalView.svelte';
    import CachyIcon from '../components/shared/CachyIcon.svelte';
    import ModalFrame from '../components/shared/ModalFrame.svelte';
    import SettingsButton from '../components/settings/SettingsButton.svelte';
    import SettingsModal from '../components/settings/SettingsModal.svelte';
    import MarketOverview from '../components/shared/MarketOverview.svelte';
    import PositionsSidebar from '../components/shared/PositionsSidebar.svelte';
    import ConnectionStatus from '../components/shared/ConnectionStatus.svelte'; // Import ConnectionStatus
    import { handleGlobalKeydown } from '../services/hotkeyService';

    let fileInput: HTMLInputElement;
    let changelogContent = '';
    let guideContent = '';
    let privacyContent = '';

    // Initialisierung der App-Logik, sobald die Komponente gemountet ist
    onMount(() => {
        app.init();
    });

    // Load changelog content when modal is opened
    $: if ($uiStore.showChangelogModal && changelogContent === '') {
        loadInstruction('changelog').then(content => {
            changelogContent = content.html;
        });
    }

    // Load guide content when modal is opened
    $: if ($uiStore.showGuideModal && guideContent === '') {
        loadInstruction('guide').then(content => {
            guideContent = content.html;
        });
    }

    // Load privacy content when modal is opened
    $: if ($uiStore.showPrivacyModal && privacyContent === '') {
        loadInstruction('privacy').then(content => {
            privacyContent = content.html;
        });
    }

    // Reset content when locale changes to force refetch
    $: if ($locale) {
        guideContent = '';
        changelogContent = '';
        privacyContent = '';
    }

    // Reactive statement to trigger app.calculateAndDisplay() when relevant inputs change
    $: {
        // Trigger calculation when any of these inputs change
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        $tradeStore.accountSize,
        $tradeStore.riskPercentage,
        $tradeStore.entryPrice,
        $tradeStore.stopLossPrice,
        $tradeStore.leverage,
        $tradeStore.fees,
        $tradeStore.symbol,
        $tradeStore.atrValue,
        $tradeStore.atrMultiplier,
        $tradeStore.useAtrSl,
        $tradeStore.atrMode,
        $tradeStore.atrTimeframe,
        $tradeStore.tradeType,
        $tradeStore.targets;

        // Only trigger if all necessary inputs are defined (not null/undefined from initial load)
        // and not during initial setup where values might be empty
        if ($tradeStore.accountSize !== undefined && $tradeStore.riskPercentage !== undefined &&
            $tradeStore.entryPrice !== undefined && $tradeStore.leverage !== undefined &&
            $tradeStore.fees !== undefined && $tradeStore.symbol !== undefined &&
            $tradeStore.atrValue !== undefined && $tradeStore.atrMultiplier !== undefined &&
            $tradeStore.useAtrSl !== undefined && $tradeStore.tradeType !== undefined &&
            $tradeStore.targets !== undefined) {
            
            app.calculateAndDisplay();
        }
    }

    function handleTradeSetupError(e: CustomEvent<string>) {
        uiStore.showError(e.detail);
    }

    function handleTargetsChange(event: CustomEvent<Array<{ price: number | null; percent: number | null; isLocked: boolean }>>) {
        updateTradeStore(s => ({ ...s, targets: event.detail }));
    }

    function handleTpRemove(event: CustomEvent<number>) {
        const index = event.detail;
        const newTargets = $tradeStore.targets.filter((_, i) => i !== index);
        updateTradeStore(s => ({ ...s, targets: newTargets }));
        app.adjustTpPercentages(null); // Pass null to signify a removal
    }

    function handleThemeSwitch(direction: 'forward' | 'backward' = 'forward') {
        const currentIndex = themes.indexOf($uiStore.currentTheme);
        const limit = $settingsStore.isPro ? themes.length : 5;
        let nextIndex;

        if (direction === 'forward') {
            nextIndex = (currentIndex + 1) % limit;
        } else {
            nextIndex = (currentIndex - 1 + limit) % limit;
        }

        uiStore.setTheme(themes[nextIndex]);
    }

    // Diese reaktive Variable formatiert den Theme-Namen benutzerfreundlich.
    // z.B. 'solarized-light' wird zu 'Solarized Light'
    $: themeTitle = $uiStore.currentTheme
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    $: currentThemeIcon = themeIcons[$uiStore.currentTheme as keyof typeof themeIcons];

    function handlePresetLoad(event: Event) {
        const selectedPreset = (event.target as HTMLSelectElement).value;
        app.loadPreset(selectedPreset);
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event && event.key && event.key.toLowerCase() === 'escape') {
            event.preventDefault();
            if ($uiStore.showJournalModal) uiStore.toggleJournalModal(false);
            if ($uiStore.showGuideModal) uiStore.toggleGuideModal(false);
            if ($uiStore.showPrivacyModal) uiStore.togglePrivacyModal(false);
            if ($uiStore.showChangelogModal) uiStore.toggleChangelogModal(false);
            if (get(modalManager).isOpen) modalManager._handleModalConfirm(false);
            return;
        }

        handleGlobalKeydown(event);
    }

    function handleBackupClick() {
        createBackup();
        trackCustomEvent('Backup', 'Click', 'CreateBackup');
    }

    function handleRestoreClick() {
        fileInput.click();
    }

    function handleFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;

            modalManager.show(
                $_('app.restoreConfirmTitle'),
                $_('app.restoreConfirmMessage'),
                'confirm'
            ).then((confirmed) => {
                if (confirmed) {
                    const result = restoreFromBackup(content);
                    if (result.success) {
                        uiStore.showFeedback('save'); // Re-use save feedback for now
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    } else {
                        uiStore.showError(result.message);
                    }
                }
                // Reset file input so the same file can be selected again
                input.value = '';
            });
        };
        reader.onerror = () => {
            uiStore.showError('app.fileReadError');
        };
        reader.readAsText(file);

        trackCustomEvent('Backup', 'Click', 'RestoreBackup');
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<input type="file" class="hidden" bind:this={fileInput} on:change={handleFileSelected} accept=".json,application/json" />

<!-- Wrapper for desktop positioning -->
<div class="relative w-full max-w-4xl mx-auto">

    {#if $settingsStore.showSidebars}
        <!-- Left Sidebar: Positions Table -->
        <div class="hidden xl:flex absolute -left-[22rem] top-8 flex-col gap-3 z-50">
            <PositionsSidebar />
        </div>

        <!-- Right Sidebar: Stacked tiles -->
        <div class="hidden xl:flex absolute -right-60 top-8 w-52 flex-col gap-3">
            <!-- Main current symbol -->
            <MarketOverview />

            <!-- Favorites list -->
            {#if $favoritesStore.length > 0}
                <div class="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest mt-2 px-1">{$_('dashboard.favorites') || 'Favorites'}</div>
            {/if}
            {#each $favoritesStore as fav (fav)}
                {#if fav.toUpperCase() !== ($tradeStore.symbol || '').toUpperCase()}
                    <MarketOverview customSymbol={fav} isFavoriteTile={true} />
                {/if}
            {/each}
        </div>
    {/if}

    <main class="my-8 w-full calculator-wrapper rounded-2xl shadow-2xl p-6 sm:p-8 fade-in relative">
        <ConnectionStatus />

        <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
            <div class="flex justify-between items-center w-full md:w-auto">
                <div class="flex items-center gap-3 text-[var(--text-primary)]">
                    <CachyIcon class="h-8 w-8" />
                    <h1 class="text-2xl sm:text-3xl font-bold">{$_('app.title')}</h1>
                </div>
                <button id="view-journal-btn-mobile" class="text-sm md:hidden bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)] font-bold py-2 px-4 rounded-lg" title="{$_('app.journalButtonTitle')}" on:click={() => uiStore.toggleJournalModal(true)} use:trackClick={{ category: 'Navigation', action: 'Click', name: 'ViewJournalMobile' }}>{$_('app.journalButton')}</button>
            </div>
            <div class="flex items-center flex-wrap justify-end gap-2 w-full md:w-auto">
                <div class="flex items-center flex-wrap justify-end gap-2 md:order-1">
                    <select id="preset-loader" class="input-field px-3 py-2 rounded-md text-sm" on:change={handlePresetLoad} bind:value={$presetStore.selectedPreset}>
                        <option value="">{$_('dashboard.presetLoad')}</option>
                        {#each $presetStore.availablePresets as presetName}
                            <option value={presetName}>{presetName}</option>
                        {/each}
                    </select>
                    <button id="save-preset-btn" class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2.5 px-2.5 rounded-lg" title="{$_('dashboard.savePresetTitle')}" aria-label="{$_('dashboard.savePresetAriaLabel')}" on:click={app.savePreset} use:trackClick={{ category: 'Presets', action: 'Click', name: 'SavePreset' }}>{@html icons.save}</button>
                    <button id="delete-preset-btn" class="text-sm bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover-bg)] text-[var(--btn-danger-text)] font-bold py-2.5 px-2.5 rounded-lg disabled:cursor-not-allowed" title="{$_('dashboard.deletePresetTitle')}" disabled={!$presetStore.selectedPreset} on:click={app.deletePreset} use:trackClick={{ category: 'Presets', action: 'Click', name: 'DeletePreset' }}>{@html icons.delete}</button>
                    <button id="reset-btn" class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2.5 px-2.5 rounded-lg flex items-center gap-2" title="{$_('dashboard.resetButtonTitle')}" on:click={resetAllInputs} use:trackClick={{ category: 'Actions', action: 'Click', name: 'ResetAll' }}>{@html icons.broom}</button>
                    <button
                        id="theme-switcher"
                        class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2 px-2.5 rounded-lg"
                        aria-label="{$_('dashboard.themeSwitcherAriaLabel')}"
                        on:click={() => handleThemeSwitch('forward')}
                        on:contextmenu|preventDefault={() => handleThemeSwitch('backward')}
                        title={themeTitle}
                        use:trackClick={{ category: 'Settings', action: 'Click', name: 'SwitchTheme' }}
                    >{@html currentThemeIcon}</button>
                </div>
                <button id="view-journal-btn-desktop" class="hidden md:inline-block text-sm bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)] font-bold py-2 px-4 rounded-lg md:order-2" title="{$_('app.journalButtonTitle')}" on:click={() => uiStore.toggleJournalModal(true)} use:trackClick={{ category: 'Navigation', action: 'Click', name: 'ViewJournalDesktop' }}>{$_('app.journalButton')}</button>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
                <GeneralInputs bind:tradeType={$tradeStore.tradeType} bind:leverage={$tradeStore.leverage} bind:fees={$tradeStore.fees} />

                <TagInputs tags={$tradeStore.tags} />

                <PortfolioInputs
                    bind:accountSize={$tradeStore.accountSize}
                    bind:riskPercentage={$tradeStore.riskPercentage}
                    bind:riskAmount={$tradeStore.riskAmount}
                    isRiskAmountLocked={$tradeStore.isRiskAmountLocked}
                    isPositionSizeLocked={$tradeStore.isPositionSizeLocked}
                    on:toggleRiskAmountLock={() => app.toggleRiskAmountLock()}
                />

            </div>

            <TradeSetupInputs
                bind:symbol={$tradeStore.symbol}
                bind:entryPrice={$tradeStore.entryPrice}
                bind:useAtrSl={$tradeStore.useAtrSl}
                bind:atrValue={$tradeStore.atrValue}
                bind:atrMultiplier={$tradeStore.atrMultiplier}
                bind:stopLossPrice={$tradeStore.stopLossPrice}
                bind:atrMode={$tradeStore.atrMode}
                bind:atrTimeframe={$tradeStore.atrTimeframe}

                on:showError={handleTradeSetupError}

                on:fetchPrice={() => app.handleFetchPrice()}
                on:toggleAtrInputs={(e) => toggleAtrInputs(e.detail)}
                on:selectSymbolSuggestion={(e) => app.selectSymbolSuggestion(e.detail)}
                on:setAtrMode={(e) => app.setAtrMode(e.detail)}
                on:setAtrTimeframe={(e) => app.setAtrTimeframe(e.detail)}
                on:fetchAtr={() => app.fetchAtr()}

                atrFormulaDisplay={$resultsStore.atrFormulaText}
                showAtrFormulaDisplay={$resultsStore.showAtrFormulaDisplay}
                isPriceFetching={$uiStore.isPriceFetching}
                symbolSuggestions={$uiStore.symbolSuggestions}
                showSymbolSuggestions={$uiStore.showSymbolSuggestions}
            />
        </div>

        <TakeProfitTargets bind:targets={$tradeStore.targets} on:change={handleTargetsChange} on:remove={handleTpRemove} calculatedTpDetails={$resultsStore.calculatedTpDetails} />

        {#if $uiStore.showErrorMessage}
            <div id="error-message" class="text-center text-sm font-medium mt-4 md:col-span-2" style:color="var(--danger-color)">{$_($uiStore.errorMessage)}</div>
        {/if}

        <section id="results" class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
                <SummaryResults
                    isPositionSizeLocked={$tradeStore.isPositionSizeLocked}
                    showCopyFeedback={$uiStore.showCopyFeedback}
                    positionSize={$resultsStore.positionSize}
                    netLoss={$resultsStore.netLoss}
                    requiredMargin={$resultsStore.requiredMargin}
                    entryFee={$resultsStore.entryFee}
                    liquidationPrice={$resultsStore.liquidationPrice}
                    breakEvenPrice={$resultsStore.breakEvenPrice}
                    isMarginExceeded={$resultsStore.isMarginExceeded}
                    on:toggleLock={() => app.togglePositionSizeLock()}
                    on:copy={() => uiStore.showFeedback('copy')}
                />
                {#if $resultsStore.showTotalMetricsGroup}
                    <div id="total-metrics-group" class="result-group">
                        <h2 class="section-header">{$_('dashboard.totalTradeMetrics')}<Tooltip text={$_('dashboard.totalTradeMetricsTooltip')} /></h2>
                        <div class="result-item"><span class="result-label">{$_('dashboard.riskPerTradeCurrency')}<Tooltip text={$_('dashboard.riskPerTradeCurrencyTooltip')} /></span><span id="riskAmountCurrency" class="result-value" style:color="var(--danger-color)">{$resultsStore.riskAmountCurrency}</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.totalFees')}<Tooltip text={$_('dashboard.totalFeesTooltip')} /></span><span id="totalFees" class="result-value">{$resultsStore.totalFees}</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.maxPotentialProfit')}<Tooltip text={$_('dashboard.maxPotentialProfitTooltip')} /></span><span id="maxPotentialProfit" class="result-value" style:color="var(--success-color)">{$resultsStore.maxPotentialProfit}</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.weightedRR')}<Tooltip text={$_('dashboard.weightedRRTooltip')} /></span><span id="totalRR" class="result-value">{$resultsStore.totalRR}</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.totalNetProfit')}<Tooltip text={$_('dashboard.totalNetProfitTooltip')} /></span><span id="totalNetProfit" class="result-value" style:color="var(--success-color)">{$resultsStore.totalNetProfit}</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.soldPosition')}<Tooltip text={$_('dashboard.soldPositionTooltip')} /></span><span id="totalPercentSold" class="result-value">{$resultsStore.totalPercentSold}</span></div>
                    </div>
                {/if}
            </div>
            <div id="tp-results-container">
                {#each $resultsStore.calculatedTpDetails as tpDetail}
                    <div class="result-group !mt-0 md:!mt-6">
                        <h2 class="section-header">{$_('dashboard.takeProfit')} {tpDetail.index + 1} ({tpDetail.percentSold.toFixed(0)}%)</h2>
                        <div class="result-item"><span class="result-label">{$_('dashboard.riskRewardRatio')}</span><span class="result-value" style:color={tpDetail.riskRewardRatio.gte(2) ? 'var(--success-color)' : tpDetail.riskRewardRatio.gte(1.5) ? 'var(--warning-color)' : 'var(--danger-color)'}>{formatDynamicDecimal(tpDetail.riskRewardRatio, 2)}</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.netProfit')}<Tooltip text={$_('dashboard.netProfitTooltip')} /></span><span class="result-value" style:color="var(--success-color)">+{formatDynamicDecimal(tpDetail.netProfit, 2)}</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.priceChange')}<Tooltip text={$_('dashboard.priceChangeTooltip')} /></span><span class="result-value" style:color={tpDetail.priceChangePercent.gt(0) ? 'var(--success-color)' : 'var(--danger-color)'}>{formatDynamicDecimal(tpDetail.priceChangePercent, 2)}%</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.returnOnCapital')}<Tooltip text={$_('dashboard.returnOnCapitalTooltip')} /></span><span class="result-value" style:color={tpDetail.returnOnCapital.gt(0) ? 'var(--success-color)' : 'var(--danger-color)'}>{formatDynamicDecimal(tpDetail.returnOnCapital, 2)}%</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.partialVolume')}<Tooltip text={$_('dashboard.partialVolumeTooltip')} /></span><span class="result-value">{formatDynamicDecimal(tpDetail.partialVolume, 4)}</span></div>
                        <div class="result-item"><span class="result-label">{$_('dashboard.exitFeeLabel')}</span><span class="result-value">{formatDynamicDecimal(tpDetail.exitFee, 4)}</span></div>
                    </div>
                {/each}
            </div>
            <VisualBar
                entryPrice={$tradeStore.entryPrice}
                stopLossPrice={$tradeStore.stopLossPrice}
                tradeType={$tradeStore.tradeType}
                targets={$tradeStore.targets}
                calculatedTpDetails={$resultsStore.calculatedTpDetails}
            />
            <footer class="md:col-span-2">
                <textarea id="tradeNotes" class="input-field w-full px-4 py-2 rounded-md mb-4" rows="2" placeholder="{$_('dashboard.tradeNotesPlaceholder')}" bind:value={$tradeStore.tradeNotes}></textarea>
                <div class="flex items-center gap-4">
                    <button id="save-journal-btn" class="w-full font-bold py-3 px-4 rounded-lg btn-primary-action" on:click={app.addTrade} disabled={$resultsStore.positionSize === '-'} use:trackClick={{ category: 'Journal', action: 'Click', name: 'SaveTrade' }}>{$_('dashboard.addTradeToJournal')}</button>
                    <button id="show-dashboard-readme-btn" class="font-bold p-3 rounded-lg btn-secondary-action" title="{$_('dashboard.showInstructionsTitle')}" aria-label="{$_('dashboard.showInstructionsAriaLabel')}" on:click={() => app.uiManager.showReadme('dashboard')} use:trackClick={{ category: 'Navigation', action: 'Click', name: 'ShowInstructions' }}>{@html icons.book}</button>
                    {#if $uiStore.showSaveFeedback}<span id="save-feedback" class="save-feedback" class:visible={$uiStore.showSaveFeedback}>{$_('dashboard.savedFeedback')}</span>{/if}
                </div>
                <div class="mt-4 flex justify-between items-center">
                    <LanguageSwitcher />
                    <SettingsButton />
                    <div class="flex items-center gap-2">
                        <button id="backup-btn" class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2.5 px-2.5 rounded-lg" title="{$_('app.backupButtonTitle')}" aria-label="{$_('app.backupButtonAriaLabel')}" on:click={handleBackupClick}>
                            {@html icons.export}
                        </button>
                        <button id="restore-btn" class="text-sm bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)] font-bold py-2.5 px-2.5 rounded-lg" title="{$_('app.restoreButtonTitle')}" aria-label="{$_('app.restoreButtonAriaLabel')}" on:click={handleRestoreClick}>
                            {@html icons.import}
                        </button>
                    </div>
                </div>
            </footer>
        </section>

        {#if $settingsStore.showSidebars}
        <!-- Mobile MarketOverview position -->
        <div class="xl:hidden mt-8 flex flex-col gap-4">
            <!-- Add PositionsSidebar for Mobile -->
            <PositionsSidebar />

            <MarketOverview />
            
            {#if $favoritesStore.length > 0}
                <div class="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest px-1">{$_('dashboard.favorites') || 'Favorites'}</div>
                {#each $favoritesStore as fav (fav)}
                    {#if fav.toUpperCase() !== ($tradeStore.symbol || '').toUpperCase()}
                        <MarketOverview customSymbol={fav} isFavoriteTile={true} />
                    {/if}
                {/each}
            {/if}
        </div>
        {/if}
    </main>
</div>

<footer class="w-full max-w-4xl mx-auto text-center py-4 text-sm text-gray-500 flex justify-center items-center gap-4">
    <span>Version {import.meta.env.VITE_APP_VERSION}</span>
    <button class="text-link" on:click={() => uiStore.toggleGuideModal(true)} use:trackClick={{ category: 'Navigation', action: 'Click', name: 'ShowGuide' }}>{$_('app.guideButton')}</button>
    <button class="text-link" on:click={() => uiStore.toggleChangelogModal(true)} use:trackClick={{ category: 'Navigation', action: 'Click', name: 'ShowChangelog' }}>Changelog</button>
    <button class="text-link" on:click={() => uiStore.togglePrivacyModal(true)} use:trackClick={{ category: 'Navigation', action: 'Click', name: 'ShowPrivacy' }}>Privacy & Legal</button>
    <button class="text-link {$settingsStore.isPro ? 'text-green-500 font-bold' : ''}" on:click={() => $settingsStore.isPro = !$settingsStore.isPro}>
        {$settingsStore.isPro ? 'Pro Active' : 'Pro'}
    </button>
</footer>

<JournalView />

<CustomModal />

<SettingsModal />

<ModalFrame
    isOpen={$uiStore.showChangelogModal}
    title={$_('app.changelogTitle')}
    on:close={() => uiStore.toggleChangelogModal(false)}
    extraClasses="modal-size-instructions"
>
    <div id="changelog-content" class="prose dark:prose-invert">
        {@html changelogContent}
    </div>
</ModalFrame>

<ModalFrame
    isOpen={$uiStore.showGuideModal}
    title={$_('app.guideTitle')}
    on:close={() => uiStore.toggleGuideModal(false)}
    extraClasses="modal-size-instructions"
>
    <div id="guide-content" class="prose dark:prose-invert">
        {@html guideContent}
    </div>
</ModalFrame>

<ModalFrame
    isOpen={$uiStore.showPrivacyModal}
    title="Privacy & Legal"
    on:close={() => uiStore.togglePrivacyModal(false)}
    extraClasses="modal-size-instructions"
>
    <div id="privacy-content" class="prose dark:prose-invert">
        {@html privacyContent}
    </div>
</ModalFrame>
