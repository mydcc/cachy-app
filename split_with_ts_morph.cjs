const { Project } = require('ts-morph');
const fs = require('fs');

const project = new Project();
project.addSourceFileAtPath('src/services/marketWatcher.ts');
const sourceFile = project.getSourceFile('src/services/marketWatcher.ts');
const mwClass = sourceFile.getClass('MarketWatcher');

// We will make properties and methods public where necessary for the composition to work
// (or use internal/protected if TS supports it, but public is safest and doesn't break external API if it's not exported from index.ts)

// Since we are splitting a God Class into 3 composed classes, private state accessed across boundaries must become public.

mwClass.getProperty('requests').setScope('public');
mwClass.getProperty('_subscriptionsDirty').setScope('public');
mwClass.getProperty('prunedRequestIds').setScope('public');
mwClass.getProperty('historyLocks').setScope('public');
mwClass.getProperty('exhaustedHistory').setScope('public');
mwClass.getProperty('pendingRequests').setScope('public');
mwClass.getProperty('requestStartTimes').setScope('public');
mwClass.getProperty('inFlight').setScope('public');
mwClass.getMethod('syncSubscriptions').setScope('public');
mwClass.getMethod('pruneZombieRequests').setScope('public');
mwClass.getMethod('pruneOrphanedSubscriptions').setScope('public');
mwClass.getMethod('pollSymbolChannel').setScope('public');

// Now save these to the backup
sourceFile.saveSync();
