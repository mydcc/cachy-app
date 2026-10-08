/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect } from "vitest";
import { resetChart, resetGalaxy, resetTradeFlow } from "./resets";
import type {
    ChartResetTarget,
    GalaxyResetTarget,
    TradeFlowResetTarget,
} from "./resets";
import type { GalaxySettings, TradeFlowSettings } from "./settingsTypes";

const galaxyDefaults: GalaxySettings = {
    particleCount: 1000,
    particleSize: 0.5,
    radius: 5,
    branches: 3,
    spin: 1,
    randomness: 0.2,
    randomnessPower: 3,
    concentrationPower: 1,
    camPos: { x: 0, y: 2, z: 5 },
    galaxyRot: { x: 0, y: 0, z: 0 },
    autoCenter: true,
    enableGyroscope: false,
    rotationSpeed: 0.1,
};

const tradeFlowDefaults: TradeFlowSettings = {
    speed: 1,
    particleCount: 500,
    size: 2,
    spread: 1,
    layout: "grid",
    colorMode: "theme",
    customColorUp: "#00ff00",
    customColorDown: "#ff0000",
    minVolume: 0,
    gridWidth: 10,
    gridLength: 20,
    enableAtmosphere: false,
    atmosphereIntensity: 1,
    atmosphereSpeed: 1,
    volumeScale: 1,
    flowMode: "equalizer",
    persistenceDuration: 5,
    galaxyFlow: {
        particleCount: 800,
        particleSize: 6,
        radius: 60,
        branches: 4,
        spin: 2,
        randomness: 0.3,
        randomnessPower: 2,
        concentrationPower: 2,
        rotationSpeed: 0.2,
        galaxyRot: { x: 0, y: 0, z: 0 },
        camPos: { x: 0, y: 2, z: 5 },
        autoCenter: true,
        enableGyroscope: false,
        marketReactivity: 1,
        sentimentTint: 1,
        activityRotation: 1,
        priceAxis: false,
        atrBands: false,
        atrBandWidth: 1,
        atrBandStrength: 1,
    },
    enableRotation: false,
    cameraHeight: 5,
    cameraDistance: 10,
    cameraPositionX: 0,
    cameraRotationX: 0,
    cameraRotationY: 0,
    cameraRotationZ: 0,
    tradeFlowSource: "live",
    volatilitySource: "trades",
    moodSource: "sentiment",
};

const chartDefaults: ChartResetTarget = {
    chartPriceScaleMode: "log",
    chartAutoScale: true,
    chartInvertScale: false,
    chartDecimalsMode: "auto",
    chartFixedDecimals: 2,
    chartShowGrid: true,
    chartLastValueVisible: true,
    chartCandleBorders: false,
    chartWatermark: false,
    chartCrosshairMode: "magnet",
    chartCrosshairStyle: "dashed",
    chartSecondsVisible: false,
    chartFixEdges: true,
    chartCountdownEnabled: false,
};

describe("resetGalaxy", () => {
    it("restores the galaxy disc from defaults without sharing the reference", () => {
        // Arrange
        const target: GalaxyResetTarget = {
            galaxySettings: { ...galaxyDefaults, branches: 9 },
            backgroundOpacity: 0.2,
            backgroundBlur: 7,
        };

        // Act
        resetGalaxy(target, { galaxySettings: galaxyDefaults });

        // Assert
        expect(target.galaxySettings).toEqual(galaxyDefaults);
        expect(target.galaxySettings).not.toBe(galaxyDefaults);
        expect(target.backgroundOpacity).toBe(1);
    });

    it("clears the blur to zero even though the shipped default keeps a blur", () => {
        // Arrange — production defaultSettings ships backgroundBlur: 5
        const target: GalaxyResetTarget = {
            galaxySettings: galaxyDefaults,
            backgroundOpacity: 1,
            backgroundBlur: 5,
        };

        // Act
        resetGalaxy(target, { galaxySettings: galaxyDefaults });

        // Assert
        expect(target.backgroundBlur).toBe(0);
    });
});

describe("resetTradeFlow", () => {
    it("restores a deep copy, so later slider writes cannot reach the defaults", () => {
        // Arrange
        const target: TradeFlowResetTarget = {
            tradeFlowSettings: { ...tradeFlowDefaults, speed: 9 },
        };

        // Act
        resetTradeFlow(target, { tradeFlowSettings: tradeFlowDefaults });

        // Assert
        expect(target.tradeFlowSettings).toEqual(tradeFlowDefaults);
        target.tradeFlowSettings.galaxyFlow.spin = 99;
        expect(tradeFlowDefaults.galaxyFlow.spin).not.toBe(99);
    });
});

describe("resetChart", () => {
    it("restores every chart field to its default", () => {
        // Arrange
        const target: ChartResetTarget = {
            chartPriceScaleMode: "linear",
            chartAutoScale: false,
            chartInvertScale: true,
            chartDecimalsMode: "fixed",
            chartFixedDecimals: 7,
            chartShowGrid: false,
            chartLastValueVisible: false,
            chartCandleBorders: true,
            chartWatermark: true,
            chartCrosshairMode: "hidden",
            chartCrosshairStyle: "dotted",
            chartSecondsVisible: true,
            chartFixEdges: false,
            chartCountdownEnabled: true,
        };

        // Act
        resetChart(target, chartDefaults);

        // Assert
        expect(target).toEqual(chartDefaults);
    });
});
