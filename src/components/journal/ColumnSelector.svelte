<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { _ } from '../../locales/i18n';
    import { icons } from '../../lib/constants';
    import ModalFrame from '../shared/ModalFrame.svelte';

    export let isOpen = false;
    export let visibleColumns: string[] = [];

    const dispatch = createEventDispatcher();

    // Definition of all available columns
    const allColumns = [
        { id: 'date', label: 'journal.table.date' },
        { id: 'symbol', label: 'journal.table.symbol' },
        { id: 'tradeType', label: 'journal.table.type' },
        { id: 'role', label: 'Role' }, // TODO: i18n
        { id: 'marginMode', label: 'Margin' }, // TODO: i18n
        { id: 'leverage', label: 'Lev' }, // TODO: i18n
        { id: 'entryPrice', label: 'journal.table.entry' },
        { id: 'exitPrice', label: 'Exit' }, // TODO: i18n
        { id: 'stopLossPrice', label: 'journal.table.sl' },
        { id: 'positionSize', label: 'Size' }, // TODO: i18n
        { id: 'totalNetProfit', label: 'journal.table.pnl' },
        { id: 'fundingFee', label: 'journal.table.funding' },
        { id: 'totalRR', label: 'journal.table.rr' },
        { id: 'mae', label: 'MAE %' },
        { id: 'mfe', label: 'MFE %' },
        { id: 'efficiency', label: 'Eff %' },
        { id: 'duration', label: 'Dur' },
        { id: 'status', label: 'journal.table.status' },
        { id: 'screenshot', label: 'journal.table.screenshot' },
        { id: 'tags', label: 'journal.table.tags' },
        { id: 'notes', label: 'journal.table.notes' },
        { id: 'action', label: 'journal.table.action' }
    ];

    function toggleColumn(columnId: string) {
        if (visibleColumns.includes(columnId)) {
            // Prevent removing all columns (optional safety)
            if (visibleColumns.length > 1) {
                visibleColumns = visibleColumns.filter(c => c !== columnId);
            }
        } else {
            // Add column, maintaining original order
            const newCols = [...visibleColumns, columnId];
            visibleColumns = allColumns
                .filter(c => newCols.includes(c.id))
                .map(c => c.id);
        }
        dispatch('change', visibleColumns);
    }

    function handleClose() {
        dispatch('close');
    }
</script>

<ModalFrame {isOpen} title={$_('journal.columnSelectorTitle') || 'Customize Columns'} on:close={handleClose}>
    <div class="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {#each allColumns as col}
            <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors border border-[var(--border-color)]">
                <input
                    type="checkbox"
                    checked={visibleColumns.includes(col.id)}
                    on:change={() => toggleColumn(col.id)}
                    class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded focus:ring-0"
                />
                <span class="text-sm font-medium">{$_(col.label) || col.label}</span>
            </label>
        {/each}
    </div>
    <div class="p-4 flex justify-end border-t border-[var(--border-color)]">
        <button class="btn-primary px-4 py-2 rounded font-bold" on:click={handleClose}>
            {$_('common.done') || 'Done'}
        </button>
    </div>
</ModalFrame>
