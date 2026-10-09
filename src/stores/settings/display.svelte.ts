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
 *
 * Display settings sub-store — ADR-0024 decision 2, first group.
 *
 * Holds the 65 display-owned `$state` fields: 66 `PERSISTENCE_SCHEMA` rows
 * carry `section: "display"`, but `isProLicenseActive` lives on the
 * entitlement collaborator (never a manager field), so 65 land here. An
 * inventory test below the schema pins that subtraction — a 67th display
 * row without a store field fails there, not as silent data loss.
 * `SettingsManager` keeps all 65 names via delegating getters/setters, so
 * the 97 consumer files do not change.
 *
 * Import rule for sub-stores: defaults and types come from
 * `./settingsTypes` only, never from `settings.svelte.ts` (the manager
 * imports this module — importing it back would be a module cycle).
 * `defaultSettings` moved to `settingsTypes.ts` for exactly this reason.
 *
 * Ownership rules (ADR-0024 "What is now forbidden"):
 * - no sub-store reads `settingsState` — coordination goes through ports;
 * - no sub-store writes another sub-store's field;
 * - every field here has a `PERSISTENCE_SCHEMA` row (the tracking list in
 *   `tracking.ts` is generated from the schema, so an unlisted field would
 *   silently stop being saved).
 */

import type { VisualQuality } from "../../lib/three/quality";
import { defaultSettings } from "./settingsTypes";
import type {
    AmbientToplineIntensity,
    AmbientToplineMode,
    AnimationIntensity,
    BackgroundAnimationPreset,
    BackgroundType,
    HeatmapMode,
    Settings,
    TradeFlowSettings,
} from "./settingsTypes";

export class DisplaySettingsStore {
  showSpinButtons = $state<boolean | "hover">(defaultSettings.showSpinButtons);
  disclaimerAccepted = $state<boolean>(defaultSettings.disclaimerAccepted);
  useUtcDateParsing = $state<boolean>(defaultSettings.useUtcDateParsing);
  forceEnglishTechnicalTerms = $state<boolean>(
    defaultSettings.forceEnglishTechnicalTerms,
  );
  debugMode = $state<boolean>(defaultSettings.debugMode);
  syncFavorites = $state<boolean>(defaultSettings.syncFavorites);
  confirmTradeDeletion = $state<boolean>(defaultSettings.confirmTradeDeletion);
  confirmBulkDeletion = $state<boolean>(defaultSettings.confirmBulkDeletion);
  enableBurningBorders = $state<boolean>(defaultSettings.enableBurningBorders);
  borderEffect = $state<"fire" | "glow">(
    defaultSettings.borderEffect || "fire",
  );
  borderEffectColorMode = $state<
    "theme" | "interactive" | "custom" | "classic"
  >(defaultSettings.borderEffectColorMode);
  borderEffectCustomColor = $state<string>(
    defaultSettings.borderEffectCustomColor,
  );
  burningBordersIntensity = $state<AnimationIntensity>(
    defaultSettings.burningBordersIntensity,
  );
  burnCharts = $state<boolean>(defaultSettings.burnCharts);
  burnModals = $state<boolean>(defaultSettings.burnModals);
  burnChannels = $state<boolean>(defaultSettings.burnChannels);
  burnMarketOverviewTiles = $state<boolean>(
    defaultSettings.burnMarketOverviewTiles,
  );
  burnFlashCards = $state<boolean>(defaultSettings.burnFlashCards);
  burnJournal = $state<boolean>(defaultSettings.burnJournal);
  enableAmbientTopline = $state<boolean>(defaultSettings.enableAmbientTopline);
  ambientToplineMode = $state<AmbientToplineMode>(
    defaultSettings.ambientToplineMode,
  );
  ambientToplineIntensity = $state<AmbientToplineIntensity>(
    defaultSettings.ambientToplineIntensity,
  );
  ambientToplineBursts = $state<boolean>(defaultSettings.ambientToplineBursts);
  visualQuality = $state<VisualQuality>(defaultSettings.visualQuality);
  fireConfig = $state<Settings["fireConfig"]>(
    structuredClone(defaultSettings.fireConfig),
  );
  fontFamily = $state<string>(defaultSettings.fontFamily);
  showMarketOverviewLinks = $state<boolean>(
    defaultSettings.showMarketOverviewLinks,
  );
  showMarketOverview = $state<boolean>(defaultSettings.showMarketOverview);
  showMarketActivity = $state<boolean>(defaultSettings.showMarketActivity);
  showSidebarActivity = $state<boolean>(defaultSettings.showSidebarActivity);
  showMarketSentiment = $state<boolean>(defaultSettings.showMarketSentiment);
  showTechnicalsSummary = $state<boolean>(
    defaultSettings.showTechnicalsSummary,
  );
  showTechnicalsConfluence = $state<boolean>(
    defaultSettings.showTechnicalsConfluence,
  );
  showTechnicalsVolatility = $state<boolean>(
    defaultSettings.showTechnicalsVolatility,
  );
  showTechnicalsOscillators = $state<boolean>(
    defaultSettings.showTechnicalsOscillators,
  );
  showTechnicalsMAs = $state<boolean>(defaultSettings.showTechnicalsMAs);
  showTechnicalsAdvanced = $state<boolean>(
    defaultSettings.showTechnicalsAdvanced,
  );
  showTechnicalsSignals = $state<boolean>(
    defaultSettings.showTechnicalsSignals,
  );
  showTechnicalsPivots = $state<boolean>(defaultSettings.showTechnicalsPivots);
  showTvLink = $state<boolean>(defaultSettings.showTvLink);
  showCgHeatLink = $state<boolean>(defaultSettings.showCgHeatLink);
  heatmapMode = $state<HeatmapMode>(defaultSettings.heatmapMode);
  showBrokerLink = $state<boolean>(defaultSettings.showBrokerLink);
  rssPresets = $state<string[]>(structuredClone(defaultSettings.rssPresets || []));
  customRssFeeds = $state<string[]>(structuredClone(defaultSettings.customRssFeeds || []));
  glassBlur = $state<number>(defaultSettings.glassBlur);
  glassSaturate = $state<number>(defaultSettings.glassSaturate);
  glassOpacity = $state<number>(defaultSettings.glassOpacity);
  // Background Customization
  enableGlassmorphism = $state<boolean>(defaultSettings.enableGlassmorphism);
  backgroundType = $state<BackgroundType>(defaultSettings.backgroundType);
  backgroundUrl = $state<string | null>(defaultSettings.backgroundUrl);
  backgroundOpacity = $state<number>(defaultSettings.backgroundOpacity);
  backgroundBlur = $state<number>(defaultSettings.backgroundBlur);
  backgroundAnimationPreset = $state<BackgroundAnimationPreset>(
    defaultSettings.backgroundAnimationPreset,
  );
  backgroundAnimationIntensity = $state<AnimationIntensity>(
    defaultSettings.backgroundAnimationIntensity,
  );
  videoPlaybackSpeed = $state<number>(defaultSettings.videoPlaybackSpeed);
  galaxySettings = $state<Settings["galaxySettings"]>(
    structuredClone(defaultSettings.galaxySettings),
  );
  // Cloned, not aliased: `$state` proxies the object it is handed, so passing
  // `defaultSettings.tradeFlowSettings` directly would let every slider write
  // through into the defaults and leave the reset button restoring the user's
  // own edits. The nested `galaxyFlow` object makes that failure permanent,
  // since a shallow spread elsewhere would keep sharing it by reference.
  tradeFlowSettings = $state<TradeFlowSettings>(
    structuredClone(defaultSettings.tradeFlowSettings),
  );
  enableTelemetry = $state<boolean>(defaultSettings.enableTelemetry);
  enableNetworkLogs = $state<boolean>(defaultSettings.enableNetworkLogs);
  logSettings = $state<Settings["logSettings"]>(
    structuredClone(defaultSettings.logSettings),
  );
  // Social Media
  discordBotToken = $state<string | undefined>(defaultSettings.discordBotToken);
  discordChannels = $state<string[]>(structuredClone(defaultSettings.discordChannels));
  enableDockingCentered = $state<boolean>(
    defaultSettings.enableDockingCentered,
  );
  dockingPosition = $state<"top" | "bottom">(defaultSettings.dockingPosition);
}
