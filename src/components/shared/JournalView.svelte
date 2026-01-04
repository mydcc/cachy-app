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
    import { getComputedColor, hexToRgba } from '../../utils/colors';
    import ModalFrame from './ModalFrame.svelte';
    import DashboardNav from './DashboardNav.svelte';
    import LineChart from './charts/LineChart.svelte';
    import BarChart from './charts/BarChart.svelte';
    import DoughnutChart from './charts/DoughnutChart.svelte';
    import BubbleChart from './charts/BubbleChart.svelte';
    import CalendarHeatmap from './charts/CalendarHeatmap.svelte';
    import { Decimal } from 'decimal.js';
    import { onMount, onDestroy } from 'svelte';

    // --- State for Dashboard ---
    let activePreset = 'performance';
    let activeDeepDivePreset = 'timing';
    let showUnlockOverlay = false;
    let unlockOverlayMessage = '';

    // --- Cheat Code Logic ---
    const CHEAT_CODE = 'VIPENTE2026';
    const LOCK_CODE = 'VIPDEEPDIVE2026';
    let inputBuffer: string[] = [];

    function handleKeydown(event: KeyboardEvent) {
        if (!$settingsStore.isPro) return; // Only listen if Pro is active
        
        const key = event.key;
        if (key.length === 1) {
            inputBuffer.push(key);
            if (inputBuffer.length > Math.max(CHEAT_CODE.length, LOCK_CODE.length)) {
                inputBuffer.shift();
            }

            const bufferStr = inputBuffer.join('');

            if (!$settingsStore.isDeepDiveUnlocked && bufferStr.endsWith(CHEAT_CODE)) {
                unlockDeepDive();
            } else if ($settingsStore.isDeepDiveUnlocked && bufferStr.endsWith(LOCK_CODE)) {
                lockDeepDive();
            }
        }
    }

    function unlockDeepDive() {
        $settingsStore.isDeepDiveUnlocked = true;
        unlockOverlayMessage = 'freigeschaltet';
        showUnlockOverlay = true;
        inputBuffer = []; // Reset buffer
        setTimeout(() => {
            showUnlockOverlay = false;
        }, 2000);
    }

    function lockDeepDive() {
        $settingsStore.isDeepDiveUnlocked = false;
        unlockOverlayMessage = 'deaktivert';
        showUnlockOverlay = true;
        inputBuffer = []; // Reset buffer
        setTimeout(() => {
            showUnlockOverlay = false;
        }, 2000);
    }

    onMount(() => {
        if (browser) {
            window.addEventListener('keydown', handleKeydown);
        }
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener('keydown', handleKeydown);
        }
    });

    // --- Reactive Data for Charts ---
    $: journal = $journalStore;

    // Theme Color Management
    let themeColors = {
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        accent: '#3b82f6',
        textSecondary: '#64748b'
    };

    function updateThemeColors() {
        if (!browser) return;
        setTimeout(() => {
            themeColors = {
                success: getComputedColor('--success-color') || '#10b981',
                danger: getComputedColor('--danger-color') || '#ef4444',
                warning: getComputedColor('--warning-color') || '#f59e0b',
                accent: getComputedColor('--accent-color') || '#3b82f6',
                textSecondary: getComputedColor('--text-secondary') || '#64748b'
            };
        }, 0);
    }

    let lastTheme = '';
    $: if ($uiStore.currentTheme !== lastTheme) {
        lastTheme = $uiStore.currentTheme;
        updateThemeColors();
    }

    // Performance Data
    $: perfData = calculator.getPerformanceData(journal);
    $: equityData = {
        labels: perfData.equityCurve.map(d => new Date(d.x).toLocaleDateString()),
        datasets: [{
            label: 'Equity',
            data: perfData.equityCurve.map(d => d.y),
            borderColor: themeColors.success,
            backgroundColor: hexToRgba(themeColors.success, 0.1),
            fill: true,
            tension: 0.1
        }]
    };
    $: drawdownData = {
        labels: perfData.drawdownSeries.map(d => new Date(d.x).toLocaleDateString()),
        datasets: [{
            label: 'Drawdown',
            data: perfData.drawdownSeries.map(d => d.y),
            borderColor: themeColors.danger,
            backgroundColor: hexToRgba(themeColors.danger, 0.2),
            fill: true,
            tension: 0.1
        }]
    };
    $: monthlyData = {
        labels: perfData.monthlyLabels,
        datasets: [{
            label: 'Monthly PnL',
            data: perfData.monthlyData,
            backgroundColor: perfData.monthlyData.map(d => d >= 0 ? themeColors.success : themeColors.danger)
        }]
    };

    // Quality Data
    $: qualData = calculator.getQualityData(journal);
    $: winLossChartData = {
        labels: ['Win', 'Loss'],
        datasets: [{
            data: qualData.winLossData,
            backgroundColor: [themeColors.success, themeColors.danger],
            borderWidth: 0
        }]
    };
    $: rDistData = {
        labels: Object.keys(qualData.rHistogram),
        datasets: [{
            label: 'Trades',
            data: Object.values(qualData.rHistogram),
            backgroundColor: themeColors.accent
        }]
    };

    // Direction Data
    $: dirData = calculator.getDirectionData(journal);
    $: longShortData = {
        labels: ['Long', 'Short'],
        datasets: [{
            label: 'Net PnL',
            data: [dirData.longPnl, dirData.shortPnl],
            backgroundColor: [dirData.longPnl >= 0 ? themeColors.success : themeColors.danger, dirData.shortPnl >= 0 ? themeColors.success : themeColors.danger]
        }]
    };
    $: topSymbolData = {
        labels: dirData.topSymbols.labels,
        datasets: [{
            label: 'PnL',
            data: dirData.topSymbols.data,
            backgroundColor: themeColors.success
        }]
    };
    $: bottomSymbolData = {
        labels: dirData.bottomSymbols.labels,
        datasets: [{
            label: 'PnL',
            data: dirData.bottomSymbols.data,
            backgroundColor: themeColors.danger
        }]
    };

    // Strategies (Tags)
    $: tagData = calculator.getTagData(journal);
    $: tagPnlData = {
        labels: tagData.labels,
        datasets: [{
            label: 'PnL',
            data: tagData.pnlData,
            backgroundColor: tagData.pnlData.map(d => d >= 0 ? themeColors.success : themeColors.danger)
        }]
    };

    // Calendar Data
    $: calendarData = calculator.getCalendarData(journal);

    // Discipline Data
    $: discData = calculator.getDisciplineData(journal);
    $: hourlyData = {
        labels: Array.from({length: 24}, (_, i) => `${i}h`),
        datasets: [{
            label: 'PnL',
            data: discData.hourlyPnl,
            backgroundColor: discData.hourlyPnl.map(d => d >= 0 ? themeColors.success : themeColors.danger)
        }]
    };
    $: riskData = {
        labels: Object.keys(discData.riskBuckets),
        datasets: [{
            label: 'Trades',
            data: Object.values(discData.riskBuckets),
            backgroundColor: themeColors.warning
        }]
    };

    // Cost Data
    $: costData = calculator.getCostData(journal);
    $: grossNetData = {
        labels: ['Gross', 'Net'],
        datasets: [{
            label: 'PnL',
            data: [costData.gross, costData.net],
            backgroundColor: [themeColors.accent, costData.net >= 0 ? themeColors.success : themeColors.danger]
        }]
    };
    $: feeCurveData = {
        labels: costData.feeCurve.map(d => new Date(d.x).toLocaleDateString()),
        datasets: [{
            label: 'Cumulative Fees',
            data: costData.feeCurve.map(d => d.y),
            borderColor: themeColors.warning,
            fill: true,
            backgroundColor: hexToRgba(themeColors.warning, 0.1)
        }]
    };
    $: feeStructureData = {
        labels: ['Trading', 'Funding'],
        datasets: [{
            data: [costData.feeStructure.trading, costData.feeStructure.funding],
            backgroundColor: [themeColors.textSecondary, themeColors.danger],
            borderWidth: 0
        }]
    };

    // --- Deep Dive Data ---
    // Timing
    $: timingData = calculator.getTimingData(journal);
    $: hourlyPnlData = {
        labels: Array.from({length: 24}, (_, i) => `${i}h`),
        datasets: [{
            label: 'PnL',
            data: timingData.hourlyPnl,
            backgroundColor: timingData.hourlyPnl.map(d => d >= 0 ? themeColors.success : themeColors.danger)
        }]
    };
    $: dayOfWeekPnlData = {
        labels: timingData.dayLabels,
        datasets: [{
            label: 'PnL',
            data: timingData.dayOfWeekPnl,
            backgroundColor: timingData.dayOfWeekPnl.map(d => d >= 0 ? themeColors.success : themeColors.danger)
        }]
    };

    // Assets
    $: assetData = calculator.getAssetData(journal);
    $: assetBubbleData = {
        datasets: [{
            label: 'Assets',
            data: assetData.bubbleData,
            backgroundColor: assetData.bubbleData.map(d => d.y >= 0 ? hexToRgba(themeColors.success, 0.6) : hexToRgba(themeColors.danger, 0.6))
        }]
    };

    // Risk
    $: riskScatterData = calculator.getRiskData(journal);
    $: riskRewardScatter = {
        datasets: [{
            label: 'Trades',
            data: riskScatterData.scatterData,
            backgroundColor: riskScatterData.scatterData.map(d => d.y >= 0 ? themeColors.success : themeColors.danger)
        }]
    };

    // Market
    $: marketData = calculator.getMarketData(journal);
    $: longShortWinData = {
        labels: ['Long Win Rate', 'Short Win Rate'],
        datasets: [{
            data: marketData.longShortWinRate,
            backgroundColor: [themeColors.success, themeColors.danger],
            borderWidth: 0
        }]
    };
    $: leverageDistData = {
        labels: marketData.leverageLabels,
        datasets: [{
            label: 'Count',
            data: marketData.leverageDist,
            backgroundColor: themeColors.accent
        }]
    };

    // Psychology
    $: psychData = calculator.getPsychologyData(journal);
    $: winStreakData = {
        labels: psychData.streakLabels,
        datasets: [{
            label: 'Frequency',
            data: psychData.winStreakData,
            backgroundColor: themeColors.success
        }]
    };
    $: lossStreakData = {
        labels: psychData.streakLabels,
        datasets: [{
            label: 'Frequency',
            data: psychData.lossStreakData,
            backgroundColor: themeColors.danger
        }]
    };

    // --- Table State ---
    let currentPage = 1;
    let itemsPerPage = 10;
    let sortField: keyof import('../../stores/types').JournalEntry = 'date';
    let sortDirection: 'asc' | 'desc' = 'desc';
    let filterDateStart = '';
    let filterDateEnd = '';
    let groupBySymbol = false;
    let expandedGroups: {[key: string]: boolean} = {};

    // --- Table Logic ---
    function sortTrades(trades: any[]) {
        return [...trades].sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];

            // Handle Decimals
            if (valA instanceof Decimal) valA = valA.toNumber();
            if (valB instanceof Decimal) valB = valB.toNumber();

            // Handle Dates
            if (sortField === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            }

            // String comparison
            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }

            // Number comparison
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    $: processedTrades = $journalStore.filter(trade => {
        // Text Search
        const matchesSearch = trade.symbol.toLowerCase().includes($tradeStore.journalSearchQuery.toLowerCase());
        // Status Filter
        const matchesStatus = $tradeStore.journalFilterStatus === 'all' || trade.status === $tradeStore.journalFilterStatus;
        // Date Filter
        let matchesDate = true;
        const tradeDate = new Date(trade.date);
        if (filterDateStart) matchesDate = matchesDate && tradeDate >= new Date(filterDateStart);
        if (filterDateEnd) {
             const endDate = new Date(filterDateEnd);
             endDate.setHours(23, 59, 59, 999);
             matchesDate = matchesDate && tradeDate <= endDate;
        }

        return matchesSearch && matchesStatus && matchesDate;
    });

    $: sortedTrades = sortTrades(processedTrades);

    // Grouping Logic
    $: groupedTrades = groupBySymbol ? Object.entries(calculator.calculateSymbolPerformance(processedTrades)).map(([symbol, data]) => ({
        symbol, ...data
    })) : [];

    $: paginatedTrades = groupBySymbol
        ? groupedTrades
        : sortedTrades.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    $: totalPages = Math.ceil((groupBySymbol ? groupedTrades.length : sortedTrades.length) / itemsPerPage);

    function handleSort(field: any) {
        if (sortField === field) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = field;
            sortDirection = 'desc'; // Default to desc for new field (usually better for numbers/dates)
        }
    }

    function toggleGroupExpand(symbol: string) {
        expandedGroups[symbol] = !expandedGroups[symbol];
    }

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

    // Reset pagination on filter change
    $: if (processedTrades.length) currentPage = 1;

</script>

<ModalFrame
    isOpen={$uiStore.showJournalModal}
    title={$_('journal.title')}
    on:close={() => uiStore.toggleJournalModal(false)}
    extraClasses="modal-size-journal"
>
    <!-- Dashboard Section -->
    {#if $settingsStore.isPro && $settingsStore.isDeepDiveUnlocked}
    <DashboardNav {activePreset} on:select={(e) => activePreset = e.detail} />

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 min-h-[250px]">
        {#if activePreset === 'performance'}
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <LineChart data={equityData} title="Equity Curve" yLabel="PnL ($)" />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <LineChart data={drawdownData} title="Drawdown" yLabel="$" />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={monthlyData} title="Monthly PnL" />
            </div>
        {:else if activePreset === 'quality'}
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex flex-col justify-center items-center">
                 <!-- Stats KPI Tile -->
                <div class="text-center w-full mb-4">
                    <div class="text-sm text-[var(--text-secondary)]">Win Rate</div>
                    <div class="text-3xl font-bold text-[var(--accent-color)]">{qualData.stats.winRate.toFixed(1)}%</div>
                </div>
                <div class="h-32 w-full">
                     <DoughnutChart data={winLossChartData} title="" />
                </div>
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={rDistData} title="R-Multiple Distribution" />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex flex-col gap-4 justify-center">
                 <div class="text-center p-2 bg-[var(--bg-primary)] rounded">
                    <div class="text-xs uppercase text-[var(--text-secondary)]">Profit Factor</div>
                    <div class="text-2xl font-bold text-[var(--text-primary)]">{qualData.stats.profitFactor.toFixed(2)}</div>
                 </div>
                 <div class="text-center p-2 bg-[var(--bg-primary)] rounded">
                    <div class="text-xs uppercase text-[var(--text-secondary)]">Avg Trade</div>
                    <div class="text-2xl font-bold {qualData.stats.avgTrade.gt(0) ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}">
                        {qualData.stats.avgTrade.gt(0) ? '+' : ''}{qualData.stats.avgTrade.toFixed(2)}
                    </div>
                 </div>
            </div>
        {:else if activePreset === 'direction'}
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={longShortData} title="Long vs Short PnL" />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={topSymbolData} title="Top 5 Symbols" horizontal={true} />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={bottomSymbolData} title="Bottom 5 Symbols" horizontal={true} />
            </div>
        {:else if activePreset === 'discipline'}
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={hourlyData} title="Hourly Performance (PnL)" />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={riskData} title="Risk Consistency" />
            </div>
             <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex flex-col justify-center gap-4">
                 <div class="text-center">
                    <div class="text-xs uppercase text-[var(--text-secondary)]">Longest Win Streak</div>
                    <div class="text-3xl font-bold text-[var(--success-color)]">{discData.streak.win}</div>
                 </div>
                 <div class="text-center">
                    <div class="text-xs uppercase text-[var(--text-secondary)]">Longest Loss Streak</div>
                    <div class="text-3xl font-bold text-[var(--danger-color)]">{discData.streak.loss}</div>
                 </div>
            </div>
        {:else if activePreset === 'costs'}
             <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={grossNetData} title="Gross vs Net PnL" />
            </div>
             <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <LineChart data={feeCurveData} title="Cumulative Fees" yLabel="$" />
            </div>
             <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <DoughnutChart data={feeStructureData} title="Fee Breakdown" />
            </div>
        {/if}
    </div>
    {/if}

    <!-- Filter & Toolbar -->
    <div class="flex flex-wrap gap-4 my-4 items-end bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)]">
        <div class="flex-1 min-w-[200px]">
            <label class="text-xs text-[var(--text-secondary)] block mb-1">Search</label>
            <input type="text" class="input-field w-full px-3 py-2 rounded-md" placeholder="{$_('journal.searchSymbolPlaceholder')}" bind:value={$tradeStore.journalSearchQuery}>
        </div>
        <div class="w-32">
             <label class="text-xs text-[var(--text-secondary)] block mb-1">Status</label>
            <select class="input-field w-full px-3 py-2 rounded-md" bind:value={$tradeStore.journalFilterStatus}>
                <option value="all">{$_('journal.filterAll')}</option>
                <option value="Open">{$_('journal.filterOpen')}</option>
                <option value="Won">{$_('journal.filterWon')}</option>
                <option value="Lost">{$_('journal.filterLost')}</option>
            </select>
        </div>
        <div class="w-36">
             <label class="text-xs text-[var(--text-secondary)] block mb-1">From</label>
             <input type="date" class="input-field w-full px-3 py-2 rounded-md" bind:value={filterDateStart} />
        </div>
         <div class="w-36">
             <label class="text-xs text-[var(--text-secondary)] block mb-1">To</label>
             <input type="date" class="input-field w-full px-3 py-2 rounded-md" bind:value={filterDateEnd} />
        </div>

        <div class="flex items-center gap-2 pb-2">
            <label class="flex items-center cursor-pointer gap-2 select-none">
                <input type="checkbox" bind:checked={groupBySymbol} class="form-checkbox h-5 w-5 text-[var(--accent-color)] rounded focus:ring-0" />
                <span class="text-sm font-bold">Pivot Mode</span>
            </label>
        </div>
    </div>

    <!-- Table Container -->
    <div class="border border-[var(--border-color)] rounded-lg overflow-hidden">
        {#if groupBySymbol}
             <!-- Symbol Pivot Table -->
             <table class="journal-table w-full">
                <thead>
                    <tr>
                        <th class="text-left p-3">Symbol</th>
                        <th class="text-right p-3">Trades</th>
                        <th class="text-right p-3">Win Rate</th>
                        <th class="text-right p-3">Total P/L</th>
                    </tr>
                </thead>
                <tbody>
                    {#each paginatedTrades as group}
                        <tr class="hover:bg-[var(--bg-secondary)] cursor-pointer border-b border-[var(--border-color)] last:border-0" on:click={() => toggleGroupExpand(group.symbol)}>
                            <td class="p-3 font-bold">{group.symbol}</td>
                            <td class="text-right p-3">{group.totalTrades} ({group.wonTrades} W)</td>
                            <td class="text-right p-3">{(group.totalTrades > 0 ? (group.wonTrades / group.totalTrades * 100) : 0).toFixed(1)}%</td>
                            <td class="text-right p-3 {group.totalProfitLoss.gt(0) ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}">
                                {group.totalProfitLoss.toFixed(2)}
                            </td>
                        </tr>
                    {/each}
                    {#if paginatedTrades.length === 0}
                        <tr><td colspan="4" class="text-center p-8 text-[var(--text-secondary)]">No data matches filters.</td></tr>
                    {/if}
                </tbody>
             </table>

        {:else}
            <!-- Standard Trade List -->
            <div class="overflow-x-auto">
                <table class="journal-table w-full">
                    <thead>
                        <tr>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('date')}>Date {sortField === 'date' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('symbol')}>Symbol {sortField === 'symbol' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th>Type</th>
                            <th>Entry</th>
                            <th>SL</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('totalNetProfit')}>P/L {sortField === 'totalNetProfit' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('totalRR')}>R/R {sortField === 'totalRR' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th>Status</th>
                            <th>Notes</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedTrades as trade}
                            <tr>
                                <td>{new Date(trade.date).toLocaleString($locale || undefined, {day:'2-digit', month: '2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'})}</td>
                                <td>{trade.symbol || '-'}</td>
                                <td class="{trade.tradeType.toLowerCase() === 'long' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}">{trade.tradeType.charAt(0).toUpperCase() + trade.tradeType.slice(1)}</td>
                                <td>{trade.entryPrice.toFixed(4)}</td>
                                <td>{trade.stopLossPrice.gt(0) ? trade.stopLossPrice.toFixed(4) : '-'}</td>
                                <td class="{trade.totalNetProfit.gt(0) ? 'text-[var(--success-color)]' : trade.totalNetProfit.lt(0) ? 'text-[var(--danger-color)]' : ''}">{trade.totalNetProfit.toFixed(2)}</td>
                                <td class="{trade.totalRR.gte(2) ? 'text-[var(--success-color)]' : trade.totalRR.gte(1.5) ? 'text-[var(--warning-color)]' : 'text-[var(--danger-color)]'}">
                                    {!trade.totalRR.isZero() ? trade.totalRR.toFixed(2) : '-'}
                                </td>
                                <td>
                                    {#if trade.isManual === false}
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
                        {#if paginatedTrades.length === 0}
                             <tr><td colspan="10" class="text-center text-slate-500 py-8">{$_('journal.noTradesYet')}</td></tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>

    <!-- Pagination Controls -->
    {#if !groupBySymbol && processedTrades.length > 0}
        <div class="flex justify-between items-center mt-4 text-sm text-[var(--text-secondary)]">
            <div class="flex items-center gap-2">
                <span>Rows:</span>
                <select bind:value={itemsPerPage} class="input-field p-1 rounded">
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
            </div>
            <div class="flex items-center gap-2">
                <button disabled={currentPage === 1} on:click={() => currentPage--} class="p-1 px-3 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] disabled:opacity-50 hover:bg-[var(--bg-primary)]">
                    &lt; Prev
                </button>
                <span>Page {currentPage} of {Math.ceil(processedTrades.length / itemsPerPage)}</span>
                <button disabled={currentPage >= Math.ceil(processedTrades.length / itemsPerPage)} on:click={() => currentPage++} class="p-1 px-3 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] disabled:opacity-50 hover:bg-[var(--bg-primary)]">
                    Next &gt;
                </button>
            </div>
        </div>
    {/if}

    <!-- Deep Dive Section -->
    {#if $settingsStore.isPro && $settingsStore.isDeepDiveUnlocked}
    <div class="mt-8 border-t border-[var(--border-color)] pt-6">
        <div class="flex items-center gap-2 mb-4">
            <span class="text-2xl">🦆</span>
            <h3 class="text-xl font-bold text-[var(--text-primary)]">{$_('journal.deepDive.title')}</h3>
        </div>

        <DashboardNav 
            activePreset={activeDeepDivePreset} 
            presets={[
                { id: 'timing', label: $_('journal.deepDive.timing') },
                { id: 'assets', label: $_('journal.deepDive.assets') },
                { id: 'risk', label: $_('journal.deepDive.risk') },
                { id: 'market', label: $_('journal.deepDive.market') },
                { id: 'psychology', label: $_('journal.deepDive.psychology') },
                { id: 'strategies', label: $_('journal.deepDive.strategies') },
                { id: 'calendar', label: $_('journal.deepDive.calendar') }
            ]}
            on:select={(e) => activeDeepDivePreset = e.detail} 
        />

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 min-h-[250px] mt-4">
            {#if activeDeepDivePreset === 'timing'}
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BarChart data={hourlyPnlData} title={$_('journal.deepDive.charts.hourlyPnl')} />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BarChart data={dayOfWeekPnlData} title={$_('journal.deepDive.charts.dayOfWeekPnl')} />
                </div>
                 <!-- Placeholder for future timing metric -->
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex items-center justify-center text-[var(--text-secondary)]">
                    <span>More Timing metrics coming soon...</span>
                 </div>
            {:else if activeDeepDivePreset === 'assets'}
                <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2">
                    <BubbleChart data={assetBubbleData} title={$_('journal.deepDive.charts.assetBubble')} xLabel="Win Rate (%)" yLabel="Total PnL ($)" />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex items-center justify-center">
                    <div class="text-center">
                        <div class="text-sm text-[var(--text-secondary)]">Top Asset</div>
                         {#if dirData.topSymbols.labels.length > 0}
                             <div class="text-2xl font-bold text-[var(--success-color)]">{dirData.topSymbols.labels[0]}</div>
                             <div class="text-lg text-[var(--text-primary)]">${dirData.topSymbols.data[0]?.toFixed(2)}</div>
                         {:else}
                             <div class="text-xl">-</div>
                         {/if}
                    </div>
                 </div>
            {:else if activeDeepDivePreset === 'risk'}
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2">
                    <BubbleChart data={riskRewardScatter} title={$_('journal.deepDive.charts.riskRewardScatter')} xLabel="Risk Amount ($)" yLabel="Realized PnL ($)" />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BarChart data={rDistData} title="R-Multiple Distribution" />
                </div>
            {:else if activeDeepDivePreset === 'market'}
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <DoughnutChart data={longShortWinData} title={$_('journal.deepDive.charts.longShortWinRate')} />
                </div>
                <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2">
                    <BarChart data={leverageDistData} title={$_('journal.deepDive.charts.leverageDist')} />
                </div>
            {:else if activeDeepDivePreset === 'psychology'}
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BarChart data={winStreakData} title={$_('journal.deepDive.charts.winStreak')} />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BarChart data={lossStreakData} title={$_('journal.deepDive.charts.lossStreak')} />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                     <LineChart data={drawdownData} title={$_('journal.deepDive.charts.recovery')} yLabel="Drawdown ($)" />
                </div>
            {:else if activeDeepDivePreset === 'strategies'}
                <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2">
                    <BarChart data={tagPnlData} title={$_('journal.deepDive.charts.tagPerformance')} />
                </div>
                <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex items-center justify-center">
                     <div class="text-center p-4">
                         <div class="text-[var(--text-secondary)] text-sm mb-2">Most Profitable Strategy</div>
                         {#if tagData.labels.length > 0}
                             {@const bestIdx = tagData.pnlData.indexOf(Math.max(...tagData.pnlData))}
                             <div class="text-2xl font-bold text-[var(--success-color)]">#{tagData.labels[bestIdx]}</div>
                             <div class="text-[var(--text-primary)]">${tagData.pnlData[bestIdx].toFixed(2)}</div>
                         {:else}
                             <div class="text-xl">-</div>
                         {/if}
                     </div>
                </div>
            {:else if activeDeepDivePreset === 'calendar'}
                <div class="col-span-1 md:col-span-2 lg:col-span-3">
                    <h4 class="text-center font-bold mb-4 text-[var(--text-primary)]">{$_('journal.deepDive.charts.heatmap')}</h4>
                    <CalendarHeatmap data={calendarData} />
                </div>
            {/if}
        </div>
    </div>
    {/if}

    {#if showUnlockOverlay}
    <div class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div class="bg-black/80 text-white px-8 py-4 rounded-lg shadow-2xl backdrop-blur-sm transform transition-all animate-fade-in-out text-center">
            <div class="text-xl font-bold text-[var(--accent-color)] mb-1">🦆 Deep Dive</div>
            <div class="text-lg">{unlockOverlayMessage}</div>
        </div>
    </div>
    {/if}

    <!-- Bottom Actions -->
    <div class="flex flex-wrap items-center gap-4 mt-8 pt-4 border-t border-[var(--border-color)]">
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
