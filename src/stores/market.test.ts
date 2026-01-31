
import { describe, it, expect, beforeEach } from 'vitest';
import { MarketManager } from './market.svelte';
import { Decimal } from 'decimal.js';

describe('MarketManager', () => {
  let market: MarketManager;

  beforeEach(() => {
    market = new MarketManager();
  });

  const createKline = (time: number, close: number) => ({
    time,
    open: new Decimal(100),
    high: new Decimal(110),
    low: new Decimal(90),
    close: new Decimal(close),
    volume: new Decimal(1000)
  });

  it('should initialize empty klines', () => {
    market.updateSymbolKlines('BTC', '1m', []);
    const data = market.data['BTC'];
    expect(data.klines['1m']).toEqual([]);
  });

  it('should append new klines to empty history', () => {
    const k1 = createKline(1000, 101);
    market.updateSymbolKlines('BTC', '1m', [k1]);

    const history = market.data['BTC'].klines['1m'];
    expect(history.length).toBe(1);
    expect(history[0].time).toBe(1000);
    expect(history[0].close.toNumber()).toBe(101);
  });

  it('should append strictly new klines', () => {
    const k1 = createKline(1000, 101);
    market.updateSymbolKlines('BTC', '1m', [k1]);

    const k2 = createKline(2000, 102);
    market.updateSymbolKlines('BTC', '1m', [k2]);

    const history = market.data['BTC'].klines['1m'];
    expect(history.length).toBe(2);
    expect(history[0].time).toBe(1000);
    expect(history[1].time).toBe(2000);
  });

  it('should update the latest kline (live update)', () => {
    const k1 = createKline(1000, 101);
    market.updateSymbolKlines('BTC', '1m', [k1], 'ws');

    // Update same time with new price
    const k1Update = createKline(1000, 105);
    market.updateSymbolKlines('BTC', '1m', [k1Update], 'ws');

    const history = market.data['BTC'].klines['1m'];
    expect(history.length).toBe(1);
    expect(history[0].time).toBe(1000);
    expect(history[0].close.toNumber()).toBe(105);
  });

  it('should handle overlap and append mixed', () => {
    const k1 = createKline(1000, 101);
    const k2 = createKline(2000, 102);
    market.updateSymbolKlines('BTC', '1m', [k1, k2], 'ws');

    const k2Update = createKline(2000, 103);
    const k3 = createKline(3000, 104);

    // Pass overlapping update + new one
    market.updateSymbolKlines('BTC', '1m', [k2Update, k3], 'ws');

    const history = market.data['BTC'].klines['1m'];
    expect(history.length).toBe(3);
    expect(history[0].time).toBe(1000);
    expect(history[1].time).toBe(2000);
    expect(history[1].close.toNumber()).toBe(103);
    expect(history[2].time).toBe(3000);
  });

  it('should handle backfill (older data)', () => {
    const k2 = createKline(2000, 102);
    market.updateSymbolKlines('BTC', '1m', [k2]);

    const k1 = createKline(1000, 101); // Older
    market.updateSymbolKlines('BTC', '1m', [k1]);

    const history = market.data['BTC'].klines['1m'];
    expect(history.length).toBe(2);
    expect(history[0].time).toBe(1000);
    expect(history[1].time).toBe(2000);
  });

  it('should deduplicate mixed unsorted inputs', () => {
    const k1 = createKline(1000, 101);
    market.updateSymbolKlines('BTC', '1m', [k1]);

    const k3 = createKline(3000, 103);
    const k2 = createKline(2000, 102);
    const k1Dup = createKline(1000, 101);

    // Incoming is unsorted and has dups
    market.updateSymbolKlines('BTC', '1m', [k3, k2, k1Dup]);

    const history = market.data['BTC'].klines['1m'];
    expect(history.length).toBe(3);
    expect(history[0].time).toBe(1000);
    expect(history[1].time).toBe(2000);
    expect(history[2].time).toBe(3000);
  });

  it('should respect MAX_HISTORY limit', () => {
     // Generate more than 2000 items (default settings limit)
     const klines = [];
     for(let i=0; i<2100; i++) {
         klines.push(createKline(i*1000, 100));
     }
     market.updateSymbolKlines('BTC', '1m', klines);

     const history = market.data['BTC'].klines['1m'];
     // Defaults to 2000 in settings.svelte.ts
     expect(history.length).toBe(2000);
     // Should keep the latest ones (end of array)
     expect(history[history.length-1].time).toBe(2099000);
  });
});
