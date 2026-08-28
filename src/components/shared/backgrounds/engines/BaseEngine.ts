/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { VolumeNormalizer } from './volumeScale';

export interface EngineContext {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    /**
     * Shared trade-volume normalizer, owned by the worker and deliberately
     * per-worker rather than per-engine: one market stream feeds whichever
     * engine is active, and a symbol change must clear the calibration window
     * exactly once (`volumeScale.ts` explains the normalization itself).
     */
    volumeNormalizer: VolumeNormalizer;
    // Deliberately `any`: every BaseEngine subclass (CityEngine, BlockEngine,
    // EqualizerEngine, GalaxyEngine, RaindropsEngine, SonarEngine,
    // StarDustEngine) and galaxy.worker.ts reads arbitrary numeric/string
    // fields off this freely (`s.gridWidth || 80`, etc.) with no shared
    // settings shape across engines. Narrowing it here would cascade type
    // errors through all of them — a separate, much larger pass, not a
    // single-file fix.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings: any;
    colorUp?: THREE.Color;
    colorDown?: THREE.Color;
    currentAtmosphere?: THREE.Color;
}

export abstract class BaseEngine {
    protected container: THREE.Group;
    public context: EngineContext;
    protected isInitialized: boolean = false;

    constructor(context: EngineContext) {
        this.context = context;
        this.container = new THREE.Group();
        this.context.scene.add(this.container);
    }

    abstract init(): void;
    abstract update(time: number, delta: number): void;
    
    // Optional methods for interactivity
    public onTrade?(trade: { type: 'buy' | 'sell', price: number, amount: number }): void;
    /**
     * Smoothed market heat (0..1) from `marketHeat()`, pushed once per frame by
     * the worker. Separate from `onTrade` because it is a continuous signal, not
     * an event: engines that only want "how busy is this market right now"
     * should not have to re-derive it from the trade stream themselves.
     */
    public onMarketActivity?(activity: number): void;
    /**
     * The streamed symbol changed. Engines holding any per-market calibration
     * of their own (a price window, in-flight geometry positioned on the old
     * market's scale) must drop it here. The shared `volumeNormalizer` is reset
     * by the worker itself and needs no engine cooperation.
     */
    public onSymbolChange?(): void;
    /**
     * Latest computed indicator readings for the streamed symbol, or nulls when
     * none are available. Separate from `onMarketActivity` because these are raw
     * per-indicator values an engine may want to draw against (an ATR band, an
     * RSI level), not the single blended heat that drives the atmosphere.
     */
    public onIndicators?(signal: { volatilityRel: number | null; rsi: number | null }): void;
    public onMouseMove?(x: number, y: number): void;
    public updateThemeColors?(colorUp: THREE.Color, colorDown: THREE.Color, atmosphere: THREE.Color): void;

    public setVisible(visible: boolean) {
        this.container.visible = visible;
    }

    public dispose() {
        this.context.scene.remove(this.container);
        this.reset();
    }

    public reset() {
        // Remove all children from container to clear geometry
        while(this.container.children.length > 0){ 
            this.container.remove(this.container.children[0]); 
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same reasoning as EngineContext.settings above
    public updateSettings(settings: any) {
        this.context.settings = settings;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same reasoning as EngineContext.settings above
    protected shouldReinit(newSettings: any): boolean {
        return (
            newSettings.gridWidth !== this.context.settings.gridWidth ||
            newSettings.gridLength !== this.context.settings.gridLength ||
            newSettings.spread !== this.context.settings.spread ||
            newSettings.size !== this.context.settings.size
        );
    }
}
