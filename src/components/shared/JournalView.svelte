<script lang="ts">
    import { tradeStore } from '../../stores/tradeStore';
    import { settingsStore } from '../../stores/settingsStore';
    import { journalStore } from '../../stores/journalStore';
    import { uiStore } from '../../stores/uiStore';
    import { app } from '../../services/app';
    import { imgbbService } from '../../services/imgbbService';
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
    import Tooltip from './Tooltip.svelte';
    import JournalEntryTags from './JournalEntryTags.svelte';
    import { Decimal } from 'decimal.js';
    import { onMount, onDestroy } from 'svelte';

    // --- State for Dashboard ---
    let activePreset = 'performance';
    let activeDeepDivePreset = 'timing';
    let showUnlockOverlay = false;
    let unlockOverlayMessage = '';

    // --- Cheat Code Logic ---
    const CODE_UNLOCK = 'VIPENTE2026';
    const CODE_LOCK = 'VIPDEEPDIVE';
    const CODE_SPACE = 'VIPSPACE2026';
    const CODE_BONUS = 'VIPBONUS2026';
    const CODE_STREAK = 'VIPSTREAK2026';

    const MAX_CODE_LENGTH = Math.max(
        CODE_UNLOCK.length,
        CODE_LOCK.length,
        CODE_SPACE.length,
        CODE_BONUS.length,
        CODE_STREAK.length
    );

    let inputBuffer: string[] = [];

    function handleKeydown(event: KeyboardEvent) {
        // Ignore if user is typing in an input field
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

        const key = event.key.toUpperCase();
        if (key.length === 1) {
            inputBuffer.push(key);
            if (inputBuffer.length > MAX_CODE_LENGTH) {
                inputBuffer.shift();
            }

            const bufferStr = inputBuffer.join('');

            // VIPENTE2026: Pro Active + VIP Theme Active => Unlock Charts
            if (bufferStr.endsWith(CODE_UNLOCK)) {
                if ($settingsStore.isPro && $uiStore.currentTheme === 'VIP') {
                    unlockDeepDive();
                }
            }
            // VIPDEEPDIVE: Lock Charts (Always works if matched)
            else if (bufferStr.endsWith(CODE_LOCK)) {
                lockDeepDive();
            }
            // VIPSPACE2026: Pro Active + VIP Theme Active => Space Dialog + Link
            else if (bufferStr.endsWith(CODE_SPACE)) {
                 if ($settingsStore.isPro && $uiStore.currentTheme === 'VIP') {
                    activateVipSpace();
                }
            }
            // Placeholders
            else if (bufferStr.endsWith(CODE_BONUS)) {
                console.log('VIPBONUS2026 detected (Placeholder)');
                inputBuffer = [];
            }
            else if (bufferStr.endsWith(CODE_STREAK)) {
                 console.log('VIPSTREAK2026 detected (Placeholder)');
                 inputBuffer = [];
            }
        }
    }

    function unlockDeepDive() {
        if ($settingsStore.isDeepDiveUnlocked) return;
        $settingsStore.isDeepDiveUnlocked = true;
        unlockOverlayMessage = $_('journal.messages.unlocked');
        showUnlockOverlay = true;
        inputBuffer = []; // Reset buffer
        setTimeout(() => {
            showUnlockOverlay = false;
        }, 2000);
    }

    function lockDeepDive() {
        if (!$settingsStore.isDeepDiveUnlocked) return;
        $settingsStore.isDeepDiveUnlocked = false;
        unlockOverlayMessage = $_('journal.messages.deactivated');
        showUnlockOverlay = true;
        inputBuffer = []; // Reset buffer
        setTimeout(() => {
            showUnlockOverlay = false;
        }, 2000);
    }

    function activateVipSpace() {
        unlockOverlayMessage = $_('journal.messages.vipSpaceUnlocked');
        showUnlockOverlay = true;
        inputBuffer = [];
        setTimeout(() => {
            showUnlockOverlay = false;
            if (browser) {
                window.open('https://metaverse.bitunix.cyou', '_blank');
            }
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
        labels: ['Win Long', 'Win Short', 'Loss Long', 'Loss Short', 'BE Long', 'BE Short'],
        datasets: [{
            data: qualData.sixSegmentData,
            backgroundColor: [
                hexToRgba(themeColors.success, 1),
                hexToRgba(themeColors.success, 0.5),
                hexToRgba(themeColors.danger, 1),
                hexToRgba(themeColors.danger, 0.5),
                hexToRgba(themeColors.warning, 1),
                hexToRgba(themeColors.warning, 0.5)
            ],
            borderWidth: 0,
            hoverOffset: 4
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
    $: cumRData = {
        labels: qualData.cumulativeRCurve.map(d => new Date(d.x).toLocaleDateString()),
        datasets: [{
            label: 'Cumulative R',
            data: qualData.cumulativeRCurve.map(d => d.y),
            borderColor: themeColors.accent,
            backgroundColor: hexToRgba(themeColors.accent, 0.1),
            fill: true,
            tension: 0.1
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

    function handleCalendarClick(event: CustomEvent) {
        const dateStr = event.detail.date;
        // Set filters to this date
        filterDateStart = dateStr;
        filterDateEnd = dateStr;
        // Optionally scroll to table?
    }

    $: availableYears = (() => {
        const years = new Set<number>();
        years.add(new Date().getFullYear()); // Always include current year
        calendarData.forEach(d => {
            const y = new Date(d.date).getFullYear();
            if (!isNaN(y)) years.add(y);
        });
        return Array.from(years).sort((a, b) => b - a);
    })();

    let selectedYear = new Date().getFullYear();
    // Auto-select latest year with data if current selection has no data?
    // Or just default to current year. Let's default to current year, but if user has data in prev years, they can switch.
    // Actually, let's strictly default to current year, unless we want to be smart.
    // Let's stick to a simple default, but maybe update if availableYears changes and selected isn't in it?
    // No, keep it simple. User can select.

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
    
    // Split View for Timing (Green/Red) - SIDE BY SIDE (no stack property)
    $: hourlyPnlData = {
        labels: Array.from({length: 24}, (_, i) => `${i}h`),
        datasets: [
            {
                label: 'Gross Profit',
                data: timingData.hourlyGrossProfit,
                backgroundColor: themeColors.success
            },
            {
                label: 'Gross Loss',
                data: timingData.hourlyGrossLoss,
                backgroundColor: themeColors.danger
            }
        ]
    };
    
    $: dayOfWeekPnlData = {
        labels: timingData.dayLabels,
        datasets: [
            {
                label: 'Gross Profit',
                data: timingData.dayOfWeekGrossProfit,
                backgroundColor: themeColors.success
            },
            {
                label: 'Gross Loss',
                data: timingData.dayOfWeekGrossLoss,
                backgroundColor: themeColors.danger
            }
        ]
    };
    
    // Duration
    $: durationDataRaw = calculator.getDurationData(journal);
    $: durationScatterData = {
         datasets: [{
            label: 'Trades',
            data: durationDataRaw.scatterData,
            backgroundColor: durationDataRaw.scatterData.map(d => d.y >= 0 ? themeColors.success : themeColors.danger)
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
    function sortTrades(trades: any[], field: string, direction: 'asc' | 'desc') {
        return [...trades].sort((a, b) => {
            let valA = a[field];
            let valB = b[field];

            // Handle Decimals
            if (valA instanceof Decimal) valA = valA.toNumber();
            if (valB instanceof Decimal) valB = valB.toNumber();

            // Handle Dates
            if (field === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            }

            // String comparison
            if (typeof valA === 'string' && typeof valB === 'string') {
                return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }

            // Number comparison
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Extract tradeStore values to local reactive variables to prevent unrelated updates (e.g. price) from triggering re-renders/pagination resets
    $: journalSearchQuery = $tradeStore.journalSearchQuery;
    $: journalFilterStatus = $tradeStore.journalFilterStatus;

    $: processedTrades = $journalStore.filter(trade => {
        // Text Search (Symbol, Notes, Tags)
        const query = journalSearchQuery.toLowerCase();
        const matchesSearch =
            trade.symbol.toLowerCase().includes(query) ||
            (trade.notes && trade.notes.toLowerCase().includes(query)) ||
            (trade.tags && trade.tags.some(t => t.toLowerCase().includes(query)));

        // Status Filter
        const matchesStatus = journalFilterStatus === 'all' || trade.status === journalFilterStatus;
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

    $: sortedTrades = sortTrades(processedTrades, sortField, sortDirection);

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

    // --- Image Upload Logic ---
    let dragOverTradeId: number | null = null;

    function handleDragOver(tradeId: number, event: DragEvent) {
        event.preventDefault();
        dragOverTradeId = tradeId;
    }

    function handleDragLeave(tradeId: number, event: DragEvent) {
        event.preventDefault();
        if (dragOverTradeId === tradeId) {
            dragOverTradeId = null;
        }
    }

    async function handleDrop(tradeId: number, event: DragEvent) {
        event.preventDefault();
        dragOverTradeId = null;

        const file = event.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
            await uploadScreenshot(tradeId, file);
        }
    }

    async function handleScreenshotUpload(tradeId: number, event: Event) {
        if (!browser) return;
        
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        
        if (file) {
            await uploadScreenshot(tradeId, file);
        }
        
        // Reset input so same file can be selected again if needed
        input.value = '';
    }

    async function uploadScreenshot(tradeId: number, file: File) {
        uiStore.showLoading('Uploading screenshot...');
        
        try {
            const url = await imgbbService.uploadToImgbb(file);
            
            // Update Journal Entry
            journalStore.update(trades => {
                return trades.map(t => {
                    if (t.id === tradeId) {
                        return { ...t, screenshot: url };
                    }
                    return t;
                });
            });

            uiStore.showFeedback('save'); // Re-use save success
        } catch (error: any) {
            console.error(error);
            uiStore.showError(error.message || 'Screenshot upload failed');
        } finally {
            uiStore.hideLoading();
        }
    }

    function handleTagsUpdate(tradeId: number, newTags: string[]) {
        journalStore.update(trades => {
            return trades.map(t => {
                if (t.id === tradeId) {
                    return { ...t, tags: newTags };
                }
                return t;
            });
        });
    }

    // Reset pagination on filter change
    function resetPagination(..._args: any[]) {
        currentPage = 1;
    }

    $: resetPagination(
        journalSearchQuery,
        journalFilterStatus,
        filterDateStart,
        filterDateEnd,
        groupBySymbol,
        sortField,
        sortDirection,
        itemsPerPage
    );

</script>

<style>
    /* Add style for the thumbnail hover effect */
    .screenshot-cell {
        position: relative;
    }

    .screenshot-cell.drag-over {
        background-color: rgba(var(--accent-rgb), 0.2) !important;
        border: 2px dashed var(--accent-color);
    }
    
    .thumbnail-popup {
        display: none;
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        z-index: 50;
        background: var(--bg-tertiary);
        padding: 4px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        width: 200px;
        height: auto;
    }

    .screenshot-cell:hover .thumbnail-popup {
        display: block;
    }

    .thumbnail-popup img {
        width: 100%;
        height: auto;
        border-radius: 2px;
    }

    /* Icon styling */
    .icon-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        color: var(--text-secondary);
        transition: color 0.2s, background-color 0.2s;
    }

    .icon-btn:hover {
        color: var(--accent-color);
        background-color: var(--bg-tertiary);
    }
</style>

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
                <LineChart data={equityData} title={$_('journal.deepDive.charts.titles.equityCurve')} yLabel={$_('journal.deepDive.charts.labels.pnl')} description={$_('journal.deepDive.charts.descriptions.equityCurve')} />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <LineChart data={drawdownData} title={$_('journal.deepDive.charts.titles.drawdown')} yLabel="$" description={$_('journal.deepDive.charts.descriptions.drawdown')} />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={monthlyData} title={$_('journal.deepDive.charts.titles.monthlyPnl')} description={$_('journal.deepDive.charts.descriptions.monthlyPnl')} />
            </div>
        {:else if activePreset === 'quality'}
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex flex-col justify-between overflow-hidden relative">
                <!-- Top Area: Layered Layout -->
                <div class="relative flex-1 min-h-[160px] w-full">

                    <!-- Layer 0: Chart (Centered & Larger) -->
                    <div class="absolute inset-0 flex items-center justify-center z-0">
                        <div class="h-44 w-44 relative">
                            <DoughnutChart
                                data={winLossChartData}
                                title=""
                                description={$_('journal.deepDive.charts.descriptions.winLoss')}
                                options={{ plugins: { legend: { display: false } } }}
                            />
                            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div class="text-center">
                                    <div class="text-[10px] text-[var(--text-secondary)] leading-tight">{$_('journal.deepDive.charts.titles.winRate')}</div>
                                    <div class="text-sm font-bold text-[var(--text-primary)]">{qualData.stats.winRate.toFixed(1)}%</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Layer 1: Stats (Right Aligned & Overlaid) -->
                    <div class="absolute inset-y-0 right-0 flex flex-col justify-center items-end gap-2 text-sm z-10 pointer-events-none">
                        <div class="flex flex-col items-end pointer-events-auto">
                            <span class="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider drop-shadow-md">{$_('journal.deepDive.charts.labels.profitFactor')}</span>
                            <span class="font-mono font-bold drop-shadow-md {qualData.detailedStats.profitFactor >= 1.5 ? 'text-[var(--success-color)]' : qualData.detailedStats.profitFactor >= 1 ? 'text-[var(--warning-color)]' : 'text-[var(--danger-color)]'}">
                                {qualData.detailedStats.profitFactor.toFixed(2)}
                            </span>
                        </div>
                        <div class="flex flex-col items-end pointer-events-auto">
                            <span class="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider drop-shadow-md">{$_('journal.deepDive.charts.labels.expectancy')}</span>
                            <span class="font-mono font-bold drop-shadow-md {qualData.detailedStats.expectancy > 0 ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}">
                                ${qualData.detailedStats.expectancy.toFixed(2)}
                            </span>
                        </div>
                        <div class="flex flex-col items-end pointer-events-auto">
                            <span class="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider drop-shadow-md">{$_('journal.deepDive.charts.labels.avgWinLoss')}</span>
                            <div class="flex items-baseline justify-end gap-1 drop-shadow-md">
                                <span class="font-bold text-[var(--success-color)]">${qualData.detailedStats.avgWin.toFixed(2)}</span>
                                <span class="text-[var(--text-secondary)]">/</span>
                                <span class="font-bold text-[var(--danger-color)]">${qualData.detailedStats.avgLoss.toFixed(2)}</span>
                            </div>
                        </div>
                        <div class="flex flex-col items-end pointer-events-auto">
                            <span class="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider drop-shadow-md">{$_('journal.deepDive.charts.labels.winRateLS')}</span>
                            <div class="flex items-baseline justify-end gap-1 drop-shadow-md">
                                <span class="font-bold whitespace-nowrap" style="color: {hexToRgba(themeColors.success, 1)}">L: {qualData.detailedStats.winRateLong.toFixed(0)}%</span>
                                <span class="text-[var(--text-secondary)]">|</span>
                                <span class="font-bold whitespace-nowrap" style="color: {hexToRgba(themeColors.success, 0.6)}">S: {qualData.detailedStats.winRateShort.toFixed(0)}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Bottom Row: Legend (Full Width, Z-20 to sit above chart if needed) -->
                <div class="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-[var(--border-color)] w-full relative z-20 bg-[var(--bg-secondary)]">
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                        <span class="w-2.5 h-2.5 rounded-full" style="background: {hexToRgba(themeColors.success, 1)}"></span>{$_('journal.deepDive.charts.labels.winLong')}
                    </div>
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                        <span class="w-2.5 h-2.5 rounded-full" style="background: {hexToRgba(themeColors.success, 0.5)}"></span>{$_('journal.deepDive.charts.labels.winShort')}
                    </div>
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                        <span class="w-2.5 h-2.5 rounded-full" style="background: {hexToRgba(themeColors.danger, 1)}"></span>{$_('journal.deepDive.charts.labels.lossLong')}
                    </div>
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                        <span class="w-2.5 h-2.5 rounded-full" style="background: {hexToRgba(themeColors.danger, 0.5)}"></span>{$_('journal.deepDive.charts.labels.lossShort')}
                    </div>
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                        <span class="w-2.5 h-2.5 rounded-full" style="background: {hexToRgba(themeColors.warning, 1)}"></span>{$_('journal.deepDive.charts.labels.beLong')}
                    </div>
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                        <span class="w-2.5 h-2.5 rounded-full" style="background: {hexToRgba(themeColors.warning, 0.5)}"></span>{$_('journal.deepDive.charts.labels.beShort')}
                    </div>
                </div>
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={rDistData} title={$_('journal.deepDive.charts.titles.rMultipleDist')} description={$_('journal.deepDive.charts.descriptions.rMultipleDist')} />
            </div>
             <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <LineChart data={cumRData} title={$_('journal.deepDive.charts.titles.cumulativeR')} yLabel="R" description={$_('journal.deepDive.charts.descriptions.cumulativeR')} />
            </div>
        {:else if activePreset === 'direction'}
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={longShortData} title={$_('journal.deepDive.charts.titles.longVsShort')} description={$_('journal.deepDive.charts.descriptions.longVsShort')} />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={topSymbolData} title={$_('journal.deepDive.charts.titles.topSymbols')} horizontal={true} description={$_('journal.deepDive.charts.descriptions.topSymbols')} />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={bottomSymbolData} title={$_('journal.deepDive.charts.titles.bottomSymbols')} horizontal={true} description={$_('journal.deepDive.charts.descriptions.bottomSymbols')} />
            </div>
        {:else if activePreset === 'discipline'}
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={hourlyData} title={$_('journal.deepDive.charts.titles.hourlyPnl')} description={$_('journal.deepDive.charts.descriptions.hourlyPnl')} />
            </div>
            <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <BarChart data={riskData} title={$_('journal.deepDive.charts.titles.riskConsistency')} description={$_('journal.deepDive.charts.descriptions.riskConsistency')} />
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
                <BarChart data={grossNetData} title={$_('journal.deepDive.charts.titles.grossVsNet')} description={$_('journal.deepDive.charts.descriptions.grossVsNet')} />
            </div>
             <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <LineChart data={feeCurveData} title={$_('journal.deepDive.charts.titles.cumulativeFees')} yLabel="$" description={$_('journal.deepDive.charts.descriptions.cumulativeFees')} />
            </div>
             <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                <DoughnutChart data={feeStructureData} title={$_('journal.deepDive.charts.titles.feeBreakdown')} description={$_('journal.deepDive.charts.descriptions.feeBreakdown')} />
            </div>
        {/if}
    </div>
    {/if}

    <!-- Filter & Toolbar -->
    <div class="flex flex-wrap gap-4 my-4 items-end bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)]">
        <div class="flex-1 min-w-[200px]">
            <label for="journal-search" class="text-xs text-[var(--text-secondary)] block mb-1">{$_('journal.labels.search')}</label>
            <input id="journal-search" type="text" class="input-field w-full px-3 py-2 rounded-md" placeholder="{$_('journal.searchSymbolPlaceholder')}" bind:value={$tradeStore.journalSearchQuery}>
        </div>
        <div class="w-32">
             <label for="journal-status" class="text-xs text-[var(--text-secondary)] block mb-1">{$_('journal.labels.status')}</label>
            <select id="journal-status" class="input-field w-full px-3 py-2 rounded-md" bind:value={$tradeStore.journalFilterStatus}>
                <option value="all">{$_('journal.filterAll')}</option>
                <option value="Open">{$_('journal.filterOpen')}</option>
                <option value="Won">{$_('journal.filterWon')}</option>
                <option value="Lost">{$_('journal.filterLost')}</option>
            </select>
        </div>
        <div class="w-36">
             <label for="journal-date-start" class="text-xs text-[var(--text-secondary)] block mb-1">{$_('journal.labels.from')}</label>
             <input id="journal-date-start" type="date" class="input-field w-full px-3 py-2 rounded-md" bind:value={filterDateStart} />
        </div>
         <div class="w-36">
             <label for="journal-date-end" class="text-xs text-[var(--text-secondary)] block mb-1">{$_('journal.labels.to')}</label>
             <input id="journal-date-end" type="date" class="input-field w-full px-3 py-2 rounded-md" bind:value={filterDateEnd} />
        </div>

        <div class="flex items-center gap-2 pb-2">
            <label class="flex items-center gap-2 select-none {!$settingsStore.isPro ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
                <input type="checkbox" bind:checked={groupBySymbol} disabled={!$settingsStore.isPro} class="form-checkbox h-5 w-5 text-[var(--accent-color)] rounded focus:ring-0 disabled:cursor-not-allowed" />
                <span class="text-sm font-bold">{$_('journal.labels.pivotMode')}</span>
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
                        <th class="text-left p-3">{$_('journal.table.symbol')}</th>
                        <th class="text-right p-3">{$_('journal.deepDive.charts.labels.trades')}</th>
                        <th class="text-right p-3">{$_('journal.deepDive.charts.titles.winRate')}</th>
                        <th class="text-right p-3">{$_('journal.totalPL')}</th>
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
                        <tr><td colspan="4" class="text-center p-8 text-[var(--text-secondary)]">{$_('journal.noData')}</td></tr>
                    {/if}
                </tbody>
             </table>

        {:else}
            <!-- Standard Trade List -->
            <div class="overflow-x-auto">
                <table class="journal-table w-full">
                    <thead>
                        <tr>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('date')}>{$_('journal.table.date')} {sortField === 'date' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('symbol')}>{$_('journal.table.symbol')} {sortField === 'symbol' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('tradeType')}>{$_('journal.table.type')} {sortField === 'tradeType' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('entryPrice')}>{$_('journal.table.entry')} {sortField === 'entryPrice' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('stopLossPrice')}>{$_('journal.table.sl')} {sortField === 'stopLossPrice' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('totalNetProfit')}>{$_('journal.table.pnl')} {sortField === 'totalNetProfit' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('fundingFee')}>{$_('journal.table.funding')} {sortField === 'fundingFee' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('totalRR')}>{$_('journal.table.rr')} {sortField === 'totalRR' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="cursor-pointer hover:text-[var(--text-primary)]" on:click={() => handleSort('status')}>{$_('journal.table.status')} {sortField === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                            <th>{$_('journal.table.screenshot')}</th>
                            <th>{$_('journal.table.tags')}</th>
                            <th>{$_('journal.table.notes')}</th>
                            <th>{$_('journal.table.action')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedTrades as trade}
                            {@const tradeDate = new Date(trade.date)}
                            <tr>
                                <td>{tradeDate.getFullYear() > 1970 ? tradeDate.toLocaleString($locale || undefined, {day:'2-digit', month: '2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                                <td>{trade.symbol || '-'}</td>
                                <td class="{trade.tradeType.toLowerCase() === 'long' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}">{trade.tradeType.charAt(0).toUpperCase() + trade.tradeType.slice(1)}</td>
                                <td>{trade.entryPrice.toFixed(4)}</td>
                                <td>{trade.stopLossPrice.gt(0) ? trade.stopLossPrice.toFixed(4) : '-'}</td>
                                <td class="{trade.totalNetProfit.gt(0) ? 'text-[var(--success-color)]' : trade.totalNetProfit.lt(0) ? 'text-[var(--danger-color)]' : ''}">{trade.totalNetProfit.toFixed(2)}</td>
                                <td class="{trade.fundingFee.lt(0) ? 'text-[var(--danger-color)]' : trade.fundingFee.gt(0) ? 'text-[var(--success-color)]' : 'text-[var(--text-secondary)]'}">{trade.fundingFee.toFixed(4)}</td>
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
                                
                                <td class="text-center screenshot-cell {dragOverTradeId === trade.id ? 'drag-over' : ''}"
                                    on:dragover={(e) => handleDragOver(trade.id, e)}
                                    on:dragleave={(e) => handleDragLeave(trade.id, e)}
                                    on:drop={(e) => handleDrop(trade.id, e)}
                                >
                                    {#if trade.screenshot}
                                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                                        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                        <button class="icon-btn" on:click={() => window.open(trade.screenshot, '_blank')}>
                                            <!-- svelte-ignore svelte/no-at-html-tags -->
                                            {@html icons.camera || '📷'}
                                        </button>
                                        <div class="thumbnail-popup">
                                            <img src={trade.screenshot} alt="Trade Screenshot" />
                                        </div>
                                    {:else}
                                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                                        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                        <label class="icon-btn cursor-pointer block w-full h-full" title="{$_('journal.labels.uploadScreenshot')}">
                                            <!-- svelte-ignore svelte/no-at-html-tags -->
                                            {@html icons.plus || '+'}
                                            <input type="file" accept="image/*" class="hidden" on:change={(e) => handleScreenshotUpload(trade.id, e)} />
                                        </label>
                                    {/if}
                                </td>

                                <td>
                                    <JournalEntryTags tags={trade.tags} onTagsChange={(newTags) => handleTagsUpdate(trade.id, newTags)} />
                                </td>

                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                <td class="notes-cell" title="{$_('journal.clickToExpand')}" on:click={toggleNoteExpand}>{trade.notes || ''}</td>
                                <td class="text-center"><button class="delete-trade-btn text-[var(--danger-color)] hover:opacity-80 p-1 rounded-full" data-id="{trade.id}" title="{$_('journal.delete')}" on:click={() => app.deleteTrade(trade.id)}>
                                    <!-- svelte-ignore svelte/no-at-html-tags -->
                                    {@html icons.delete}</button></td>
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
                <span>{$_('journal.pagination.rows')}</span>
                <select bind:value={itemsPerPage} class="input-field p-1 rounded">
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
            </div>
            <div class="flex items-center gap-2">
                <button disabled={currentPage === 1} on:click={() => currentPage--} class="p-1 px-3 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] disabled:opacity-50 hover:bg-[var(--bg-primary)]">
                    &lt; {$_('journal.pagination.prev')}
                </button>
                <span>{$_('journal.pagination.page')} {currentPage} {$_('journal.pagination.of')} {Math.ceil(processedTrades.length / itemsPerPage)}</span>
                <button disabled={currentPage >= Math.ceil(processedTrades.length / itemsPerPage)} on:click={() => currentPage++} class="p-1 px-3 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] disabled:opacity-50 hover:bg-[var(--bg-primary)]">
                    {$_('journal.pagination.next')} &gt;
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
                    <BarChart data={hourlyPnlData} title={$_('journal.deepDive.charts.hourlyPnl')} description="Brutto-Gewinne (Grün) und Brutto-Verluste (Rot) pro Tageszeit. Hilft zu erkennen, wann du profitabel bist und wann du Geld verlierst." />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BarChart data={dayOfWeekPnlData} title={$_('journal.deepDive.charts.dayOfWeekPnl')} description="Brutto-Gewinne und -Verluste pro Wochentag." />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BubbleChart data={durationScatterData} title="Duration vs PnL" xLabel="Dauer (Min)" yLabel="PnL ($)" description="Verhältnis von Haltedauer zum Gewinn/Verlust. Erkennst du Muster bei kurzen vs. langen Trades?" />
                 </div>
            {:else if activeDeepDivePreset === 'assets'}
                <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2">
                    <BubbleChart data={assetBubbleData} title={$_('journal.deepDive.charts.assetBubble')} xLabel="Win Rate (%)" yLabel="Total PnL ($)" description="Asset-Matrix: Oben rechts sind deine besten Coins (hohe Winrate, viel Gewinn). Größe der Blase = Anzahl Trades." />
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
                    <BubbleChart data={riskRewardScatter} title={$_('journal.deepDive.charts.riskRewardScatter')} xLabel="Risk Amount ($)" yLabel="Realized PnL ($)" description="Risk/Reward Scatter: Zeigt das Verhältnis von eingesetztem Risiko zum tatsächlichen Ergebnis. Ideal: Geringes Risiko, hoher Gewinn (oben links)." />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BarChart data={rDistData} title="R-Multiple Distribution" description="Häufigkeitsverteilung deiner Ergebnisse in R-Multiples." />
                </div>
            {:else if activeDeepDivePreset === 'market'}
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <DoughnutChart data={longShortWinData} title={$_('journal.deepDive.charts.longShortWinRate')} description="Vergleich der Gewinnrate zwischen Long- und Short-Trades." />
                </div>
                <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2">
                    <BarChart data={leverageDistData} title={$_('journal.deepDive.charts.leverageDist')} description="Verteilung der verwendeten Hebel (Leverage)." />
                </div>
            {:else if activeDeepDivePreset === 'psychology'}
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BarChart data={winStreakData} title={$_('journal.deepDive.charts.winStreak')} description="Häufigkeit von Gewinnserien unterschiedlicher Länge." />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                    <BarChart data={lossStreakData} title={$_('journal.deepDive.charts.lossStreak')} description="Häufigkeit von Verlustserien unterschiedlicher Länge." />
                </div>
                 <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
                     <LineChart data={drawdownData} title={$_('journal.deepDive.charts.recovery')} yLabel="Drawdown ($)" description="Verlauf deiner Drawdowns. Zeigt wie schnell du dich von Verlusten erholst." />
                </div>
            {:else if activeDeepDivePreset === 'strategies'}
                <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] col-span-2">
                    <BarChart data={tagPnlData} title={$_('journal.deepDive.charts.tagPerformance')} />
                </div>
                <div class="chart-tile bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex items-center justify-center">
                     <div class="text-center p-4">
                         <div class="text-[var(--text-secondary)] text-sm mb-2">Most Profitable Strategy</div>
                         {#if tagData.labels.length > 0 && tagData.pnlData.length > 0}
                             {@const maxVal = Math.max(...tagData.pnlData)}
                             {@const bestIdx = tagData.pnlData.indexOf(maxVal)}
                             {#if bestIdx !== -1 && tagData.labels[bestIdx]}
                                <div class="text-2xl font-bold text-[var(--success-color)]">#{tagData.labels[bestIdx]}</div>
                                <div class="text-[var(--text-primary)]">${tagData.pnlData[bestIdx].toFixed(2)}</div>
                             {:else}
                                <div class="text-xl">-</div>
                             {/if}
                         {:else}
                             <div class="text-xl">-</div>
                         {/if}
                     </div>
                </div>
            {:else if activeDeepDivePreset === 'calendar'}
                <div class="col-span-1 md:col-span-2 lg:col-span-3 flex flex-col items-center">
                    <div class="flex items-center gap-4 mb-4">
                        <h4 class="font-bold text-[var(--text-primary)]">{$_('journal.deepDive.charts.heatmap')}</h4>
                        <select bind:value={selectedYear} class="input-field p-1 rounded text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                            {#each availableYears as year}
                                <option value={year}>{year}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="w-full">
                        <CalendarHeatmap data={calendarData} year={selectedYear} on:click={handleCalendarClick} />
                    </div>
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
             <button id="sync-bitunix-btn" class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover-bg)] text-[var(--btn-primary-text)]" title="{$_('journal.syncBitunix')}" on:click={app.syncBitunixHistory}>
                <!-- svelte-ignore svelte/no-at-html-tags -->
                {@html icons.refresh}<span class="hidden sm:inline">{$_('journal.syncBitunix')}</span></button>
        {/if}
        <button id="export-csv-btn" class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-success-bg)] hover:bg-[var(--btn-success-hover-bg)] text-[var(--btn-success-text)]" title="{$_('journal.exportCsvTitle')}" on:click={app.exportToCSV}>
            <!-- svelte-ignore svelte/no-at-html-tags -->
            {@html icons.export}<span class="hidden sm:inline">{$_('journal.export')}</span></button>
        <input type="file" id="import-csv-input" accept=".csv" class="hidden" on:change={handleImportCsv}/>
        <button id="import-csv-btn" class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)]" title="{$_('journal.importCsvTitle')}" on:click={() => document.getElementById('import-csv-input')?.click()}>
            <!-- svelte-ignore svelte/no-at-html-tags -->
            {@html icons.import}<span class="hidden sm:inline">{$_('journal.import')}</span></button>
        <button id="clear-journal-btn" class="font-bold py-2 px-4 rounded-lg flex items-center gap-2 bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover-bg)] text-[var(--btn-danger-text)]" title="{$_('journal.clearJournalTitle')}" on:click={() => { if (browser) app.clearJournal() }}>
            <!-- svelte-ignore svelte/no-at-html-tags -->
            {@html icons.delete}<span class="hidden sm:inline">{$_('journal.clearAll')}</span></button>
        <button id="show-journal-readme-btn" class="font-bold p-2.5 rounded-lg bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)]" title="{$_('journal.showJournalInstructionsTitle')}" aria-label="{$_('journal.showJournalInstructionsAriaLabel')}" on:click={() => app.uiManager.showReadme('journal')}>
            <!-- svelte-ignore svelte/no-at-html-tags -->
            {@html icons.book}</button>
    </div>
</ModalFrame>
