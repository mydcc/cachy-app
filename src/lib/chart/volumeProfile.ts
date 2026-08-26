import type {
    IChartApi,
    IPanePrimitive,
    IPanePrimitivePaneView,
    IPrimitivePaneRenderer,
    ISeriesApi,
    Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export interface VolumeProfileBin {
    priceStart: number;
    priceEnd: number;
    volume: number;
}

type GetColor = (name: string) => string | null;

/**
 * Horizontal volume-by-price overlay drawn on the price pane. Each price bin
 * becomes a bar anchored to the right edge; bar length scales by bin volume
 * relative to the largest bin. The POC and value-area bins use the accent
 * color, the rest a neutral tone. Off unless the indicator is enabled.
 */
export class VolumeProfilePrimitive implements IPanePrimitive<Time> {
    private _chart: IChartApi | null = null;
    private _requestUpdate: (() => void) | null = null;
    private _rows: VolumeProfileBin[] = [];
    private _poc = 0;
    private _vaLow = 0;
    private _vaHigh = 0;
    private _renderer: VolumeProfileRenderer;
    private _view: VolumeProfilePaneView;

    constructor(
        private readonly _series: ISeriesApi<'Candlestick'>,
        private readonly _getColor: GetColor,
    ) {
        this._renderer = new VolumeProfileRenderer(this);
        this._view = new VolumeProfilePaneView(this._renderer);
    }

    setData(rows: VolumeProfileBin[], poc: number, vaHigh: number, vaLow: number): void {
        this._rows = rows;
        this._poc = poc;
        this._vaHigh = vaHigh;
        this._vaLow = vaLow;
        this._requestUpdate?.();
    }

    attached(param: { chart: IChartApi; requestUpdate?: () => void }): void {
        this._chart = param.chart;
        this._requestUpdate = param.requestUpdate ?? null;
    }

    detached(): void {
        this._chart = null;
        this._requestUpdate = null;
    }

    paneViews(): readonly IPanePrimitivePaneView[] {
        return [this._view];
    }

    get series(): ISeriesApi<'Candlestick'> {
        return this._series;
    }

    get rows(): VolumeProfileBin[] {
        return this._rows;
    }

    get poc(): number {
        return this._poc;
    }

    get vaLow(): number {
        return this._vaLow;
    }

    get vaHigh(): number {
        return this._vaHigh;
    }

    getColor(name: string): string | null {
        return this._getColor(name);
    }
}

class VolumeProfilePaneView implements IPanePrimitivePaneView {
    constructor(private _renderer: VolumeProfileRenderer) {}

    zOrder(): 'top' {
        return 'top';
    }

    renderer(): IPrimitivePaneRenderer {
        return this._renderer;
    }
}

class VolumeProfileRenderer implements IPrimitivePaneRenderer {
    constructor(private _p: VolumeProfilePrimitive) {}

    draw(target: CanvasRenderingTarget2D): void {
        const p = this._p;
        const rows = p.rows;
        if (!rows.length) return;

        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
            const series = p.series;
            const scaleWidth = series.priceScale().width();
            const inset = 8;
            const usable = mediaSize.width - scaleWidth - inset;
            if (usable <= 0) return;

            let maxVol = 0;
            for (const r of rows) if (r.volume > maxVol) maxVol = r.volume;
            if (maxVol <= 0) return;

            const accent = p.getColor('--accent-color') || '#2962ff';
            const neutral = p.getColor('--text-tertiary') || '#9aa0a6';

            for (const r of rows) {
                const yTop = series.priceToCoordinate(r.priceEnd);
                const yBottom = series.priceToCoordinate(r.priceStart);
                if (yTop == null || yBottom == null) continue;

                const top = Math.min(yTop, yBottom);
                const bottom = Math.max(yTop, yBottom);
                const h = Math.max(1, bottom - top);
                const w = (r.volume / maxVol) * usable;
                const x = mediaSize.width - scaleWidth - inset - w;

                const mid = (r.priceStart + r.priceEnd) / 2;
                const inValueArea = mid <= p.vaHigh && mid >= p.vaLow;
                const isPoc = Math.abs(mid - p.poc) <= (r.priceEnd - r.priceStart) / 2 + 1e-9;
                const highlight = isPoc || inValueArea;

                context.fillStyle = highlight ? accent : neutral;
                context.globalAlpha = highlight ? 0.5 : 0.3;
                context.fillRect(x, top, w, h);
            }
            context.globalAlpha = 1;
        });
    }
}
