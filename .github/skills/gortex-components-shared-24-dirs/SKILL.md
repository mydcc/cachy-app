---
name: gortex-components-shared-24-dirs
description: "Work in the components/shared +24 dirs area — 454 symbols across 94 files (89% cohesion)"
---

# components/shared +24 dirs

454 symbols | 94 files | 89% cohesion

## When to Use

Use this skill when working on files in:
- `src/actions/tracking.ts`
- `src/components/alerts/tabs/CandlesticksTab.svelte`
- `src/components/alerts/tabs/ComboTab.svelte`
- `src/components/alerts/tabs/IndicatorsTab.svelte`
- `src/components/alerts/tabs/PriceTab.svelte`
- `src/components/alerts/tabs/TemplatesTab.svelte`
- `src/components/inputs/ExchangeAccountControls.svelte`
- `src/components/inputs/GeneralInputs.svelte`
- `src/components/inputs/TakeProfitTargets.svelte`
- `src/components/inputs/TradeSetupInputs.svelte`
- `src/components/layout/Header.svelte`
- `src/components/results/PlaceOrderPanel.svelte`
- `src/components/results/SummaryResults.component.test.ts`
- `src/components/results/SummaryResults.svelte`
- `src/components/settings/AccountCard.svelte`
- `src/components/settings/AccountList.svelte`
- `src/components/shared/AccountSummary.svelte`
- `src/components/shared/AccountTooltip.svelte`
- `src/components/shared/ActiveAccountChip.svelte`
- `src/components/shared/AddToPositionModal.svelte`
- `src/components/shared/AdjustMarginModal.svelte`
- `src/components/shared/AnalyticsButton.svelte`
- `src/components/shared/Button.component.test.ts`
- `src/components/shared/Button.svelte`
- `src/components/shared/CachyIcon.svelte`
- `src/components/shared/ClosePositionModal.svelte`
- `src/components/shared/ConfirmActionModal.svelte`
- `src/components/shared/ConnectionStatus.svelte`
- `src/components/shared/DashboardNav.svelte`
- `src/components/shared/DepthBar.svelte`
- `src/components/shared/FlashCard.svelte`
- `src/components/shared/FloatingIframeButton.svelte`
- `src/components/shared/FundingRatePopover.svelte`
- `src/components/shared/GlobalTracker.svelte`
- `src/components/shared/IndicatorPaneHeader.svelte`
- `src/components/shared/JournalContent.svelte`
- `src/components/shared/LeftControlPanel.svelte`
- `src/components/shared/LeverageModal.svelte`
- `src/components/shared/MarginModeModal.component.test.ts`
- `src/components/shared/MarginModeModal.svelte`
- `src/components/shared/MarketDashboardModal.svelte`
- `src/components/shared/MarketOverview.svelte`
- `src/components/shared/ModalFrame.svelte`
- `src/components/shared/OfflineBanner.svelte`
- `src/components/shared/OnboardingSpotlight.svelte`
- `src/components/shared/OpenOrdersList.svelte`
- `src/components/shared/OrderDetailsTooltip.svelte`
- `src/components/shared/OrderHistoryList.svelte`
- `src/components/shared/PositionsList.svelte`
- `src/components/shared/PositionsSidebar.svelte`
- `src/components/shared/PowerToggle.svelte`
- `src/components/shared/QuizButton.svelte`
- `src/components/shared/RangeSlider.svelte`
- `src/components/shared/TakeProfitRow.svelte`
- `src/components/shared/TakeProfitTargets.svelte`
- `src/components/shared/Tooltip.svelte`
- `src/components/shared/TpSlCreateModal.svelte`
- `src/components/shared/TpSlEditModal.svelte`
- `src/components/shared/TpSlList.svelte`
- `src/components/shared/TpSlPriceInput.svelte`
- `src/components/shared/backgrounds/TradeFlowBackground.svelte`
- `src/components/shared/charts/BarChart.svelte`
- `src/components/shared/charts/BubbleChart.svelte`
- `src/components/shared/charts/DoughnutChart.svelte`
- `src/components/shared/charts/LineChart.svelte`
- `src/components/shared/charts/RadarChart.svelte`
- `src/components/shared/charts/ScatterChart.svelte`
- `src/components/shared/journal/JournalCharts.svelte`
- `src/components/shared/journal/JournalDeepDive.svelte`
- `src/components/shared/journal/JournalStatistics.svelte`
- `src/components/shared/journal/JournalTable.svelte`
- `src/components/shared/journal/TradeDetailDrawer.svelte`
- `src/lib/components/ContentRenderer.svelte`
- `src/lib/marketDashboard.ts`
- `src/lib/windows/implementations/ChannelView.svelte`
- `src/lib/windows/implementations/ChatTestView.svelte`
- `src/locales/i18n.ts`
- `src/routes/+layout.server.ts`
- `src/routes/+page.svelte`
- `src/routes/[[lang]]/(seo)/+layout.svelte`
- `src/routes/[[lang]]/(seo)/changelog/+page.svelte`
- `src/routes/[[lang]]/(seo)/guide/+page.svelte`
- `src/routes/[[lang]]/(seo)/privacy/+page.svelte`
- `src/routes/[[lang]]/(seo)/whitepaper/+page.svelte`
- `src/services/calculatorService.ts`
- `src/services/exchange/subscriptionLedger.test.ts`
- `src/services/exchangeCapabilities.ts`
- `src/services/trackingService.ts`
- `src/stores/analysis.svelte.ts`
- `src/stores/types.ts`
- `src/tests/helpers/AddToPositionLiveWrapper.svelte`
- `src/tests/helpers/ClosePositionLiveWrapper.svelte`
- `src/tests/helpers/MarginModeRefreshWrapper.svelte`
- `src/utils/utils.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/actions/tracking.ts` | event, handleClick |
| `src/components/alerts/tabs/CandlesticksTab.svelte` | CandlesticksTab |
| `src/components/alerts/tabs/ComboTab.svelte` | ComboTab |
| `src/components/alerts/tabs/IndicatorsTab.svelte` | IndicatorsTab |
| `src/components/alerts/tabs/PriceTab.svelte` | PriceTab |
| `src/components/alerts/tabs/TemplatesTab.svelte` | TemplatesTab |
| `src/components/inputs/ExchangeAccountControls.svelte` | ExchangeAccountControls |
| `src/components/inputs/GeneralInputs.svelte` | setTradeType, type, GeneralInputs |
| `src/components/inputs/TakeProfitTargets.svelte` | removeRow, TakeProfitTargets, addRow, index |
| `src/components/inputs/TradeSetupInputs.svelte` | target, TradeSetupInputs, event, event, toggleAutoUpdatePrice, ... |
| `src/components/layout/Header.svelte` | Header |
| `src/components/results/PlaceOrderPanel.svelte` | norm, t, livePrice, selectOrderType, PlaceOrderPanel, ... |
| `src/components/results/SummaryResults.component.test.ts` | writeText |
| `src/components/results/SummaryResults.svelte` | handleCopy, SummaryResults, handleToggleLock |
| `src/components/settings/AccountCard.svelte` | AccountCard |
| `src/components/settings/AccountList.svelte` | AccountList, confirmSwitch, target, confirmedAt |
| `src/components/shared/AccountSummary.svelte` | AccountSummary |
| `src/components/shared/AccountTooltip.svelte` | AccountTooltip |
| `src/components/shared/ActiveAccountChip.svelte` | ActiveAccountChip |
| `src/components/shared/AddToPositionModal.svelte` | AddToPositionModal |
| `src/components/shared/AdjustMarginModal.svelte` | AdjustMarginModal |
| `src/components/shared/AnalyticsButton.svelte` | AnalyticsButton |
| `src/components/shared/Button.component.test.ts` | children |
| `src/components/shared/Button.svelte` | Button |
| `src/components/shared/CachyIcon.svelte` | CachyIcon |
| `src/components/shared/ClosePositionModal.svelte` | ClosePositionModal |
| `src/components/shared/ConfirmActionModal.svelte` | ConfirmActionModal, confirm |
| `src/components/shared/ConnectionStatus.svelte` | ConnectionStatus |
| `src/components/shared/DashboardNav.svelte` | DashboardNav |
| `src/components/shared/DepthBar.svelte` | DepthBar |
| `src/components/shared/FlashCard.svelte` | handleKnown, FlashCard, handleUnknown, handleFlip |
| `src/components/shared/FloatingIframeButton.svelte` | e, openChannel, ch, handleContextMenu, FloatingIframeButton |
| `src/components/shared/FundingRatePopover.svelte` | FundingRatePopover, openPopover, togglePopover, closePopover |
| `src/components/shared/GlobalTracker.svelte` | target, getDomPath, firstClass, contextStr, tagName, ... |
| `src/components/shared/IndicatorPaneHeader.svelte` | IndicatorPaneHeader |
| `src/components/shared/JournalContent.svelte` | data, SortField, handleDateFilterChange, preset, field, ... |
| `src/components/shared/LeftControlPanel.svelte` | LeftControlPanel |
| `src/components/shared/LeverageModal.svelte` | e, onSlide, nudge, confirm, next, ... |
| `src/components/shared/MarginModeModal.component.test.ts` | onconfirm |
| `src/components/shared/MarginModeModal.svelte` | confirm, MarginModeModal |
| `src/components/shared/MarketDashboardModal.svelte` | analysis, scoreTooltip, key, formatPrice, p, ... |
| `src/components/shared/MarketOverview.svelte` | decimals, formatValue, val, loadToCalculator, MarketOverview |
| `src/components/shared/ModalFrame.svelte` | ModalFrame |
| `src/components/shared/OfflineBanner.svelte` | OfflineBanner, handleSettings |
| `src/components/shared/OnboardingSpotlight.svelte` | OnboardingSpotlight |
| `src/components/shared/OpenOrdersList.svelte` | handleMouseLeave, type, date, order, handleCancel, ... |
| `src/components/shared/OrderDetailsTooltip.svelte` | ts, toggleDetails, formatDate, order, LooseOrder, ... |
| `src/components/shared/OrderHistoryList.svelte` | handleKeyDown, date, getFeeDisplay, role, formatDate, ... |
| `src/components/shared/PositionsList.svelte` | val, togglePnlMode, canAdjustMargin, PositionsList, handleClose, ... |
| `src/components/shared/PositionsSidebar.svelte` | handleCloseSuccess, handleAddSuccess, handleContextMenu, event, setViewMode, ... |
| `src/components/shared/PowerToggle.svelte` | input, PowerToggle, event, handleToggle |
| `src/components/shared/QuizButton.svelte` | QuizButton |
| `src/components/shared/RangeSlider.svelte` | RangeSlider |
| `src/components/shared/TakeProfitRow.svelte` | handlePercentInput, newPercent, target, e, currentTargets, ... |
| `src/components/shared/TakeProfitTargets.svelte` | index, removeRow, addRow, TakeProfitTargets |
| `src/components/shared/Tooltip.svelte` | Tooltip |
| `src/components/shared/TpSlCreateModal.svelte` | openEdit, TpSlCreateModal, handleEditSuccess, order |
| `src/components/shared/TpSlEditModal.svelte` | TpSlEditModal |
| `src/components/shared/TpSlList.svelte` | formatDate, openEdit, ts, d, o, ... |
| `src/components/shared/TpSlPriceInput.svelte` | event, onFieldKey, TpSlPriceInput, commit |
| `src/components/shared/backgrounds/TradeFlowBackground.svelte` | TradeFlowBackground |
| `src/components/shared/charts/BarChart.svelte` | BarChart |
| `src/components/shared/charts/BubbleChart.svelte` | BubbleChart |
| `src/components/shared/charts/DoughnutChart.svelte` | DoughnutChart |
| `src/components/shared/charts/LineChart.svelte` | LineChart |
| `src/components/shared/charts/RadarChart.svelte` | RadarChart |
| `src/components/shared/charts/ScatterChart.svelte` | ScatterChart |
| `src/components/shared/journal/JournalCharts.svelte` | JournalCharts |
| `src/components/shared/journal/JournalDeepDive.svelte` | JournalDeepDive, detail, handleCalendarClick |
| `src/components/shared/journal/JournalStatistics.svelte` | JournalStatistics |
| `src/components/shared/journal/JournalTable.svelte` | diffHours, startStr, risk, item, url, ... |
| `src/components/shared/journal/TradeDetailDrawer.svelte` | formatDuration, input, startStr, handleFileInputChange, handleKeydown, ... |
| `src/lib/components/ContentRenderer.svelte` | ContentRenderer |
| `src/lib/marketDashboard.ts` | trendCellClass, state, analysis, signalFor |
| `src/lib/windows/implementations/ChannelView.svelte` | openInNewTab, retryEmbed, handleEmbedError, ChannelView |
| `src/lib/windows/implementations/ChatTestView.svelte` | ChatTestView |
| `src/locales/i18n.ts` | _ |
| `src/routes/+layout.server.ts` | load |
| `src/routes/+page.svelte` | selectedPreset, nextIndex, handlePresetLoad, event, currentIndex, ... |
| `src/routes/[[lang]]/(seo)/+layout.svelte` | +layout |
| `src/routes/[[lang]]/(seo)/changelog/+page.svelte` | +page |
| `src/routes/[[lang]]/(seo)/guide/+page.svelte` | +page |
| `src/routes/[[lang]]/(seo)/privacy/+page.svelte` | +page |
| `src/routes/[[lang]]/(seo)/whitepaper/+page.svelte` | +page |
| `src/services/calculatorService.ts` | newStopLoss, totalMetrics, finalMetrics, meta, rounded, ... |
| `src/services/exchange/subscriptionLedger.test.ts` | symbol, channel, t |
| `src/services/exchangeCapabilities.ts` | exchange, unsupportedTimeInForceReasonKey |
| `src/services/trackingService.ts` | context, action, category, eventData, trackInteraction, ... |
| `src/stores/analysis.svelte.ts` | TrendState, AnalysisQuality, SymbolAnalysis |
| `src/stores/types.ts` | JournalGroupSummary, JournalTableRow |
| `src/tests/helpers/AddToPositionLiveWrapper.svelte` | AddToPositionLiveWrapper |
| `src/tests/helpers/ClosePositionLiveWrapper.svelte` | ClosePositionLiveWrapper |
| `src/tests/helpers/MarginModeRefreshWrapper.svelte` | MarginModeRefreshWrapper |
| `src/utils/utils.ts` | formatted, dec, maxPlaces, formatDynamicDecimal, value |

## Connected Communities

- **services +4 dirs · parseDecimal** (6 cross-edges)
- **utils +2 dirs** (5 cross-edges)
- **services +46 dirs** (3 cross-edges)
- **components/shared · selectRow** (2 cross-edges)
- **services +10 dirs · appFetch** (2 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (2 cross-edges)
- **services · unsupportedReasonKey** (2 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (2 cross-edges)
- **services +1 dirs · calculateAndDisplay** (2 cross-edges)
- **benchmarks +11 dirs** (2 cross-edges)
- **components/shared · getTooltipPosition · OrderHistoryList** (1 cross-edges)
- **rule +1 dirs · parse** (1 cross-edges)
- **stores +3 dirs · ResultsManager** (1 cross-edges)
- **components/shared · getTooltipPosition · OpenOrdersList** (1 cross-edges)
- **components/shared · toNumber** (1 cross-edges)
- **services +2 dirs · flashClosePosition** (1 cross-edges)
- **components/shared +3 dirs · scheduleCalculation** (1 cross-edges)
- **services +29 dirs** (1 cross-edges)
- **components/inputs · parseInputVal** (1 cross-edges)
- **utils +3 dirs · wipeLocalData** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **services +6 dirs · ensureHistory** (1 cross-edges)
- **services +2 dirs · capabilitiesOf** (1 cross-edges)
- **components/shared +1 dirs · toggle** (1 cross-edges)
- **services +15 dirs** (1 cross-edges)
- **services +3 dirs · performCalculation** (1 cross-edges)
- **components/shared · applyPresetRange** (1 cross-edges)
- **services/exchange +2 dirs · handleCancel** (1 cross-edges)
- **components/shared +1 dirs · direction** (1 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (1 cross-edges)
- **services · fetchHistory** (1 cross-edges)
- **services +1 dirs · t** (1 cross-edges)
- **services +2 dirs · set** (1 cross-edges)
- **components/shared +2 dirs · handleScreenshotUpload** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-778")
explore(operation:"context", task:"understand components/shared +24 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
