/*
 * Grandfathered cross-layer imports for the architecture burn-down.
 *
 * `services` must not import `stores` (see the boundary block in
 * eslint.config.js). The files below predate that rule. This list is
 * burn-down only:
 *
 *   - When a service stops importing stores, delete its path here.
 *   - Never add a path. A new import is a new violation: read the value from a
 *     parameter or an injected port instead, and let the store layer own state.
 *
 * Count is asserted by the burn-down checklist in the architecture audit; keep
 * it strictly decreasing.
 */
export const servicesToStoresAllowlist = [
  "src/services/accountSession.svelte.ts",
  "src/services/activeTechnicals/calculationExecutor.ts",
  "src/services/activeTechnicals/visibilityController.ts",
  "src/services/activeTechnicalsManager.svelte.ts",
  "src/services/alertEngine/ruleLoopWiring.ts",
  "src/services/apiService.ts",
  "src/services/app.ts",
  "src/services/appEffects.svelte.ts",
  "src/services/backupService.ts",
  "src/services/bitgetWs.ts",
  "src/services/bitunixWs.ts",
  "src/services/bitunixWs/channelDispatch.ts",
  "src/services/calculatorService.ts",
  "src/services/cloudService.ts",
  "src/services/connectionManager.ts",
  "src/services/dataRepairService.ts",
  "src/services/engineBenchmark.ts",
  "src/services/exchange/registry.ts",
  "src/services/externalDelivery.ts",
  "src/services/feeRateService.ts",
  "src/services/fundingRateService.svelte.ts",
  "src/services/hotkeyService.ts",
  "src/services/marketAnalyst.ts",
  "src/services/marketWatcher.ts",
  "src/services/marketWatcher/historyFetcher.ts",
  "src/services/newsService.ts",
  "src/services/notificationService.svelte.ts",
  "src/services/orderPlacementService.ts",
  "src/services/paperAccountFeed.ts",
  "src/services/paperExchange.ts",
  "src/services/paperJournalService.ts",
  "src/services/paperTradingService.ts",
  "src/services/rmsService.ts",
  "src/services/soundChannel.svelte.ts",
  "src/services/syncService.ts",
  "src/services/technicalsService.ts",
  "src/services/tradeCalculator.svelte.ts",
  "src/services/tradeService.ts",
];

/*
 * Grandfathered `utils -> services` imports. Same burn-down rules as above:
 * these predate the utils gate and are infrastructure reads (logger, db,
 * storage, order-refusal formatting) rather than state. Fix with a port and
 * delete the path here once the util no longer needs the service.
 */
export const utilsToServicesAllowlist = [
  "src/utils/appReset.ts",
  "src/utils/errorUtils.ts",
  "src/utils/retryPolicy.ts",
];
