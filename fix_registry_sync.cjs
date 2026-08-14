const fs = require('fs');

const regFile = 'src/services/marketWatcher/subscriptionRegistry.ts';
let regText = fs.readFileSync(regFile, 'utf8');

// In subscriptionRegistry.ts, the old code synced immediately if subscriptions were dirty in `register()`.
// Actually, `MarketWatcher.runPollingLoop` did the batched `syncSubscriptions()`.
// Let's check `marketWatcher_perf.test.ts`. It mocks `watcher.syncSubscriptions`.
// Since we changed how the mock would intercept the call, it might be that `syncSubscriptions` is not being called on `watcher` anymore, but on `registry`.
// In `marketWatcher.ts`, `runPollingLoop` does:
//           if (this.registry._subscriptionsDirty) {
//             this.registry.syncSubscriptions();
//             this.registry._subscriptionsDirty = false;
//           }
// BUT the test does: const syncSpy = vi.spyOn(watcher, 'syncSubscriptions');
// Because `watcher.syncSubscriptions` is now just a getter/delegator, calling `registry.syncSubscriptions()` bypasses the spy on the parent `watcher`.
// We should make `runPollingLoop` call `this.syncSubscriptions()` so the spy works.

const mainFile = 'src/services/marketWatcher.ts';
let mainText = fs.readFileSync(mainFile, 'utf8');

mainText = mainText.replace(/this\.registry\.syncSubscriptions\(\);/g, 'this.syncSubscriptions();');
fs.writeFileSync(mainFile, mainText);
