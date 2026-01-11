import { CONSTANTS } from '../lib/constants';
import { parseDecimal } from '../utils/utils';
import { modalManager } from './modalManager';
import { Decimal } from 'decimal.js';
import { loadInstruction } from './markdownLoader';
import { _ } from '../locales/i18n';
import { get } from 'svelte/store';
import type { IndividualTpResult } from '../stores/types';

interface VisualBarContentItem {
    type: string;
    style: { left: string; width: string; };
}

interface VisualBarMarker {
    pos: Decimal;
    label:string;
    isEntry: boolean;
    index?: number;
    rr?: Decimal;
}

export interface VisualBarData {
    visualBarContent: VisualBarContentItem[];
    markers: VisualBarMarker[];
}

export const uiManager = {
    showReadme: async (type: 'dashboard' | 'journal' | 'changelog') => {
        const instruction = await loadInstruction(type);
        let titleKey: string;
        if (type === 'dashboard') {
            titleKey = 'dashboard.instructionsTitle';
        } else if (type === 'journal') {
            titleKey = 'journal.showJournalInstructionsTitle';
        } else { // type === 'changelog'
            titleKey = 'app.changelogTitle';
        }
        const translatedTitle = get(_)(titleKey);
        modalManager.show(translatedTitle, instruction.html, 'alert');
    }
};

export function updateVisualBar(
    values: { entryPrice: number | null; stopLossPrice: number | null; tradeType: string },
    targets: Array<{ price: number | null; percent: number | null; isLocked: boolean }>,
    calculatedTpDetails: IndividualTpResult[]
): VisualBarData {
    const visualBarContent: { type: string; style: { left: string; width: string; }; }[] = [];
    const markers: VisualBarMarker[] = [];

    const validTargetPrices = targets.map(t => parseDecimal(t.price)).filter(p => p.gt(0));
    const allPrices = [parseDecimal(values.entryPrice), parseDecimal(values.stopLossPrice), ...validTargetPrices];
    if (allPrices.some(p => p.lte(0))) return { visualBarContent, markers };

    const highestPrice = Decimal.max(...allPrices);
    const lowestPrice = Decimal.min(...allPrices);
    const totalRange = highestPrice.minus(lowestPrice);
    if (totalRange.lte(0)) return { visualBarContent, markers };

    const slPos = parseDecimal(values.stopLossPrice).minus(lowestPrice).dividedBy(totalRange).times(100);
    const entryPos = parseDecimal(values.entryPrice).minus(lowestPrice).dividedBy(totalRange).times(100);

    if (values.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
        visualBarContent.push({ type: 'loss-zone', style: { left: `${slPos}%`, width: `${entryPos.minus(slPos)}%` } });
        visualBarContent.push({ type: 'gain-zone', style: { left: `${entryPos}%`, width: `${new Decimal(100).minus(entryPos)}%` } });
    } else {
        visualBarContent.push({ type: 'gain-zone', style: { left: '0', width: `${entryPos}%` } });
        visualBarContent.push({ type: 'loss-zone', style: { left: `${entryPos}%`, width: `${slPos.minus(entryPos)}%` } });
    }

    markers.push({ pos: slPos, label: 'SL', isEntry: false });
    markers.push({ pos: entryPos, label: 'Einstieg', isEntry: true });

    calculatedTpDetails.forEach(tpDetail => {
        const tpPrice = parseDecimal(targets[tpDetail.index].price);
        const tpPos = tpPrice.minus(lowestPrice).dividedBy(totalRange).times(100);
        markers.push({
            pos: tpPos,
            label: `TP${tpDetail.index + 1}`,
            isEntry: false,
            index: tpDetail.index,
            rr: tpDetail.riskRewardRatio
        });
    });

    return { visualBarContent, markers };
}