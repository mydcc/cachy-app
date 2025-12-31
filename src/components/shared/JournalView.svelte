<script lang="ts">
    import { tradeStore } from '../../stores/tradeStore';
    import { settingsStore } from '../../stores/settingsStore';
    import { journalStore } from '../../stores/journalStore';
    import { uiStore } from '../../stores/uiStore';
    import { app } from '../../services/app';
    import { calculator } from '../../lib/calculator';
    import { _, locale } from '../../locales/i18n';
    import { icons, CONSTANTS } from '../../lib/constants';
    import { browser } from '$app/environment';
    import { formatDynamicDecimal } from '../../utils/utils';
    import ModalFrame from './ModalFrame.svelte';

    $: filteredTrades = $journalStore.filter(trade =>
        trade.symbol.toLowerCase().includes($tradeStore.journalSearchQuery.toLowerCase()) &&
        ($tradeStore.journalFilterStatus === 'all' || trade.status === $tradeStore.journalFilterStatus)
    );

    $: stats = calculator.calculateJournalStats($journalStore);

    function handleImportCsv(event: Event) {
        if (browser) {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
                app.importFromCSV(file);
            }
        }
    }

    function handleStatusChange(tradeId: number, event: Event) {
        const target = event.target as HTMLSelectElement;
        app.updateTradeStatus(tradeId, target.value);
    }

    function toggleNoteExpand(event: MouseEvent) {
        (event.target as HTMLElement).classList.toggle('expanded');
    }
</script>

<ModalFrame
    isOpen={$uiStore.showJournalModal}
    title={$_('journal.title')}
    on:close={() => uiStore.toggleJournalModal(false)}
    extraClasses="modal-size-journal"
>
    <!-- New Performance Stats Dashboard -->
    <div id="journal-stats" class="journal-stats grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)]">
            <div class="text-xs text-[var(--text-secondary)] uppercase">Total P/L</div>
            <div class="text-lg font-bold {stats.totalNetProfit.gt(0) ? 'text-[var(--success-color)]' : stats.totalNetProfit.lt(0) ? 'text-[var(--danger-color)]' : ''}">
                {stats.totalNetProfit.gt(0) ? '+' : ''}{stats.totalNetProfit.toFixed(2)}
            </div>
        </div>
        <div class="bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)]">
            <div class="text-xs text-[var(--text-secondary)] uppercase">Win Rate</div>
            <div class="text-lg font-bold text-[var(--accent-color)]">
                {stats.winRate.toFixed(1)}%
            </div>
            <div class="text-xs text-[var(--text-secondary)]">{stats.wonTrades}W / {stats.lostTrades}L</div>
        </div>
        <div class="bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)]">
            <div class="text-xs text-[var(--text-secondary)] uppercase">Profit Factor</div>
            <div class="text-lg font-bold text-[var(--text-primary)]">
                {stats.profitFactor.toFixed(2)}
            </div>
        </div>
        <div class="bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)]">
            <div class="text-xs text-[var(--text-secondary)] uppercase">Avg Trade</div>
            <div class="text-lg font-bold {stats.avgTrade.gt(0) ? 'text-[var(--success-color)]' : stats.avgTrade.lt(0) ? 'text-[var(--danger-color)]' : ''}">
                {stats.avgTrade.gt(0) ? '+' : ''}{stats.avgTrade.toFixed(2)}
            </div>
        </div>
    </div>

    <div class="flex gap-4 my-4"><input type="text" id="journal-search" class="input-field w-full px-3 py-2 rounded-md" placeholder="{$_('journal.searchSymbolPlaceholder')}" bind:value={$tradeStore.journalSearchQuery}><select id="journal-filter" class="input-field px-3 py-2 rounded-md" bind:value={$tradeStore.journalFilterStatus}><option value="all">{$_('journal.filterAll')}</option><option value="Open">{$_('journal.filterOpen')}</option><option value="Won">{$_('journal.filterWon')}</option><option value="Lost">{$_('journal.filterLost')}</option></select></div>
    <div class="max-h-[calc(100vh-20rem)] overflow-auto">
        <!-- Desktop Table -->
        <div class="hidden md:block">
            <table class="journal-table w-full">
                <thead><tr><th>{$_('journal.date')}</th><th>{$_('journal.symbol')}</th><th>{$_('journal.type')}</th><th>{$_('journal.entry')}</th><th>{$_('journal.sl')}</th><th>P/L</th><th>{$_('journal.rr')}</th><th>{$_('journal.status')}</th><th>{$_('journal.notes')}</th><th>{$_('journal.action')}</th></tr></thead>
                <tbody>
                    {#each filteredTrades as trade}
                        <tr>
                            <td>{new Date(trade.date).toLocaleString($locale || undefined, {day:'2-digit', month: '2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'})}</td>
                            <td>{trade.symbol || '-'}</td>
                            <td class="{trade.tradeType.toLowerCase() === 'long' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}">{trade.tradeType.charAt(0).toUpperCase() + trade.tradeType.slice(1)}</td>
                            <td>{trade.entryPrice.toFixed(4)}</td>
                            <td>{trade.stopLossPrice.gt(0) ? trade.stopLossPrice.toFixed(4) : '-'}</td>
                            <td class="{trade.totalNetProfit.gt(0) ? 'text-[var(--success-color)]' : trade.totalNetProfit.lt(0) ? 'text-[var(--danger-color)]' : ''}">{trade.totalNetProfit.toFixed(2)}</td>
                            <td class="{trade.totalRR.gte(2) ? 'text-[var(--success-color)]' : trade.totalRR.gte(1.5) ? 'text-[var(--warning-color)]' : 'text-[var(--danger-color)]'}">
                                {trade.totalRR.gt(0) ? trade.totalRR.toFixed(2) : '-'}
                            </td>
                            <td>
                                {#if trade.isManual === false}
                                    <!-- Read-only status for API trades -->
                                    <span class="px-2 py-1 rounded text-xs font-bold 
                                        {trade.status === 'Won' ? 'bg-[rgba(var(--success-rgb),0.2)] text-[var(--success-color)]' : 
                                         trade.status === 'Lost' ? 'bg-[rgba(var(--danger-rgb),0.2)] text-[var(--danger-color)]' : 
                                         'bg-[rgba(var(--accent-rgb),0.2)] text-[var(--accent-color)]'}">
                                        {trade.status}
                                    </span>
                                {:else}
                                    <select class="status-select input-field p-1" data-id="{trade.id}" on:change={(e) => handleStatusChange(trade.id, e)}>
                                        <option value="Open" selected={trade.status === 'Open'}>{$_('journal.filterOpen')}</option>
                                        <option value="Won" selected={trade.status === 'Won'}>{$_('journal.filterWon')}</option>
                                        <option value="Lost" selected={trade.status === 'Lost'}>{$_('journal.filterLost')}</option>
                                    </select>
                                {/if}
                            </td>
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                            <td class="notes-cell" title="{$_('journal.clickToExpand')}" on:click={toggleNoteExpand}>{trade.notes || ''}</td>
                            <td class="text-center"><button class="delete-trade-btn text-[var(--danger-color)] hover:opacity-80 p-1 rounded-full" data-id="{trade.id}" title="{$_('journal.delete')}" on:click={() => app.deleteTrade(trade.id)}>{@html icons.delete}</button></td>
                        </tr>
                    {/each}
                    {#if filteredTrades.length === 0}
                        <tr><td colspan="10" class="text-center text-slate-500 py-8">{$_('journal.noTradesYet')}</td></tr>
                    {/if}
                </tbody>
            </table>
        </div>

        <!-- Mobile Card Layout -->
        <div class="md:hidden space-y-4">
            {#each filteredTrades as trade}
                <div class="bg-[var(--bg-primary)] p-4 rounded-lg shadow-md border border-[var(--border-color)]">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="text-lg font-bold text-[var(--text-primary)]">{trade.symbol || '-'}</div>
                            <div class="text-sm {trade.tradeType.toLowerCase() === 'long' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}">{trade.tradeType.charAt(0).toUpperCase() + trade.tradeType.slice(1)}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-lg font-bold {trade.totalNetProfit.gt(0) ? 'text-[var(--success-color)]' : trade.totalNetProfit.lt(0) ? 'text-[var(--danger-color)]' : ''}">
                                {trade.totalNetProfit.toFixed(2)}
                            </div>
                            <div class="text-xs text-[var(--text-secondary)]">P/L</div>
                        </div>
                    </div>
                    <div class="mt-4 flex justify-between items-center">
                        <div>
                            <div class="text-sm">Status</div>
                            {#if trade.isManual === false}
                                <span class="px-2 py-1 rounded text-xs font-bold mt-1 inline-block
                                    {trade.status === 'Won' ? 'bg-[rgba(var(--success-rgb),0.2)] text-[var(--success-color)]' : 
                                     trade.status === 'Lost' ? 'bg-[rgba(var(--danger-rgb),0.2)] text-[var(--danger-color)]' : 
                                     'bg-[rgba(var(--accent-rgb),0.2)] text-[var(--accent-color)]'}">
                                    {trade.status}
                                </span>
                            {:else}
                                <select class="status-select input-field p-1 mt-1" data-id="{trade.id}" on:change={(e) => handleStatusChange(trade.id, e)}>
                                    <option value="Open" selected={trade.status === 'Open'}>{$_('journal.filterOpen')}</option>
                                    <option value="Won" selected={trade.status === 'Won'}>{$_('journal.filterWon')}</option>
                                    <option value="Lost" selected={trade.status === 'Lost'}>{$_('journal.filterLost')}</option>
                                </select>
                            {/if}
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-slate-400">{new Date(trade.date).toLocaleString('de-DE', {day:'2-digit', month: '2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'})}</div>
                            <button class="delete-trade-btn text-[var(--danger-color)] hover:opacity-80 p-1 rounded-full cursor-pointer mt-1" data-id="{trade.id}" title="{$_('journal.delete')}" on:click={() => app.deleteTrade(trade.id)}>{@html icons.delete}</button>
                        </div>
                    </div>
                </div>
            {/each}
            {#if filteredTrades.length === 0}
                <div class="text-center text-slate-500 py-8">{$_('journal.noTradesYet')}</div>
            {/if}
        </div>
    </div>
    <h3 class="text-xl font-bold mt-6 mb-4">{$_('journal.performancePerSymbol')}</h3>
    <div id="symbol-performance-stats" class="max-h-48 overflow-y-auto border border-[var(--border-color)] rounded-md p-2">
        <table class="journal-table w-full">
            <thead><tr><th>{$_('journal.symbol')}</th><th>{$_('journal.trades')}</th><th>{$_('journal.profitPercent')}</th><th>{$_('journal.totalPL')}</th></tr></thead>
            <tbody id="symbol-performance-table-body">
                {#each Object.entries(calculator.calculateSymbolPerformance($journalStore)) as [symbol, data]}
                    <tr>
                        <td>{symbol}</td>
                        <td>{data.totalTrades}</td>
                        <td>{(data.totalTrades > 0 ? (data.wonTrades / data.totalTrades) * 100 : 0).toFixed(1)}%</td>
                        <td class="{data.totalProfitLoss.gt(0) ? 'text-[var(--success-color)]' : data.totalProfitLoss.lt(0) ? 'text-[var(--danger-color)]' : ''}">{data.totalProfitLoss.toFixed(2)}</td>
                    </tr>
                {/each}
                {#if Object.keys(calculator.calculateSymbolPerformance($journalStore)).length === 0}
                    <tr><td colspan="4" class="text-center text-slate-500 py-4">{$_('journal.noData')}</td></tr>
                {/if}
            </tbody>
        </table>
    </div>
        <div class="flex flex-wrap items-center gap-4 mt-4">
        {#if $settingsStore.isPro}
             <button id="sync-bitunix-btn" class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover-bg)] text-[var(--btn-primary-text)]" title="Sync from Bitunix" on:click={app.syncBitunixHistory}>{@html icons.refresh}<span class="hidden sm:inline">Sync Bitunix</span></button>
        {/if}
        <button id="export-csv-btn" class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-success-bg)] hover:bg-[var(--btn-success-hover-bg)] text-[var(--btn-success-text)]" title="{$_('journal.exportCsvTitle')}" on:click={app.exportToCSV}>{@html icons.export}<span class="hidden sm:inline">{$_('journal.export')}</span></button>
        <input type="file" id="import-csv-input" accept=".csv" class="hidden" on:change={handleImportCsv}/>
        <button id="import-csv-btn" class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)]" title="{$_('journal.importCsvTitle')}" on:click={() => document.getElementById('import-csv-input')?.click()}>{@html icons.import}<span class="hidden sm:inline">{$_('journal.import')}</span></button>
        <button id="clear-journal-btn" class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover-bg)] text-[var(--btn-danger-text)]" title="{$_('journal.clearJournalTitle')}" on:click={() => { if (browser) app.clearJournal() }}>{@html icons.delete}<span class="hidden sm:inline">{$_('journal.clearAll')}</span></button>
            <button id="show-journal-readme-btn" class="font-bold p-2.5 rounded-lg bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)]" title="{$_('journal.showJournalInstructionsTitle')}" aria-label="{$_('journal.showJournalInstructionsAriaLabel')}" on:click={() => app.uiManager.showReadme('journal')}>{@html icons.book}</button>
    </div>
</ModalFrame>
