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

import { BufferPool } from "../../utils/bufferPool";
import { Decimal } from "decimal.js";
import type { Kline, KlineBuffers } from "../../services/technicalsTypes";
import type { MarketData } from "../market.svelte";
import type { RawKline, RawNumeric } from "./types";
import { settingsState } from "../settings.svelte";
import { isUnsafeObjectKey } from "../../utils/utils";

export class KlineBufferManager {
  public bufferPool = new BufferPool();
  public backingBuffers = new Map<string, KlineBuffers>();

  getBuffer(key: string): KlineBuffers | undefined {
    return this.backingBuffers.get(key);
  }

  ensureCapacity(key: string, neededLen: number): KlineBuffers {
    let backing = this.backingBuffers.get(key);
    if (!backing || backing.times.length < neededLen) {
      const newCap = Math.ceil(Math.max(neededLen * 1.5, 1000));
      if (backing) {
        this.bufferPool.release(backing.times);
        this.bufferPool.release(backing.opens);
        this.bufferPool.release(backing.highs);
        this.bufferPool.release(backing.lows);
        this.bufferPool.release(backing.closes);
        this.bufferPool.release(backing.volumes);
      }
      backing = {
        times: this.bufferPool.acquire(newCap),
        opens: this.bufferPool.acquire(newCap),
        highs: this.bufferPool.acquire(newCap),
        lows: this.bufferPool.acquire(newCap),
        closes: this.bufferPool.acquire(newCap),
        volumes: this.bufferPool.acquire(newCap),
      };
      this.backingBuffers.set(key, backing);
    }
    return backing;
  }

  releaseSymbol(symbol: string) {
    const keysToDelete: string[] = [];
    const prefix = `${symbol}:`;
    this.backingBuffers.forEach((backing, key) => {
      if (key.startsWith(prefix)) {
        this.bufferPool.release(backing.times);
        this.bufferPool.release(backing.opens);
        this.bufferPool.release(backing.highs);
        this.bufferPool.release(backing.lows);
        this.bufferPool.release(backing.closes);
        this.bufferPool.release(backing.volumes);
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      this.backingBuffers.delete(key);
    }
  }

  clear() {
    this.backingBuffers.forEach((backing) => {
      this.bufferPool.release(backing.times);
      this.bufferPool.release(backing.opens);
      this.bufferPool.release(backing.highs);
      this.bufferPool.release(backing.lows);
      this.bufferPool.release(backing.closes);
      this.bufferPool.release(backing.volumes);
    });
    this.backingBuffers.clear();
  }

  applySymbolKlines(
    symbol: string,
    timeframe: string,
    klines: RawKline[],
    source: "rest" | "ws",
    enforceLimit: boolean,
    current: MarketData
  ) {
    // timeframe ultimately traces back to a WS channel/topic string rather
    // than a fixed internal enum — reject it before it's ever used as an
    // object key (current.klines[timeframe], current.klinesBuffers[timeframe]).
    if (isUnsafeObjectKey(timeframe)) return;

    if (klines.length > 1 && (source === "ws" || klines[0]?.open instanceof Decimal === false)) {
        klines.sort((a, b) => a.time - b.time);
        const dedupedRaw: RawKline[] = [];
        let lastTime = -1;
        for (const k of klines) {
             if (k.time === lastTime) {
                 dedupedRaw[dedupedRaw.length - 1] = k;
             } else {
                 dedupedRaw.push(k);
                 lastTime = k.time;
             }
        }
        klines = dedupedRaw;
    }

    const existingHistory = current.klines[timeframe];
    if (klines.length === 1 && existingHistory && existingHistory.length > 0) {
        const lastIdx = existingHistory.length - 1;
        const lastKline = existingHistory[lastIdx];
        const newRaw = klines[0];

        if (newRaw.time === lastKline.time) {
            const updateDecimal = (oldVal: Decimal, newVal: RawNumeric): Decimal => {
                if (newVal === null || newVal === undefined) return oldVal;
                if (typeof newVal === "number") return new Decimal(newVal);
                if (typeof newVal === "string" && oldVal.toString() === newVal) return oldVal;
                return new Decimal(newVal);
            };

            const updatedKline: Kline = {
                open: updateDecimal(lastKline.open, newRaw.open),
                high: updateDecimal(lastKline.high, newRaw.high),
                low: updateDecimal(lastKline.low, newRaw.low),
                close: updateDecimal(lastKline.close, newRaw.close),
                volume: updateDecimal(lastKline.volume, newRaw.volume),
                time: newRaw.time
            };

            existingHistory[lastIdx] = updatedKline;

            const bufferKey = `${symbol}:${timeframe}`;
            const backing = this.getBuffer(bufferKey);
            if (backing && backing.times.length > lastIdx) {
                 const getNum = (val: RawNumeric): number => {
                    if (typeof val === "number") return val;
                    if (typeof val === "string") return parseFloat(val);
                    return val instanceof Decimal ? val.toNumber() : Number(val);
                 };

                 backing.opens[lastIdx] = getNum(newRaw.open);
                 backing.highs[lastIdx] = getNum(newRaw.high);
                 backing.lows[lastIdx] = getNum(newRaw.low);
                 backing.closes[lastIdx] = getNum(newRaw.close);
                 backing.volumes[lastIdx] = getNum(newRaw.volume);
            }
            current.lastUpdated = Date.now();
            return;
        }
    }

    let newKlines: Kline[] = klines.map(k => ({
      open: k.open instanceof Decimal ? k.open : new Decimal(k.open as Decimal.Value),
      high: k.high instanceof Decimal ? k.high : new Decimal(k.high as Decimal.Value),
      low: k.low instanceof Decimal ? k.low : new Decimal(k.low as Decimal.Value),
      close: k.close instanceof Decimal ? k.close : new Decimal(k.close as Decimal.Value),
      volume: k.volume instanceof Decimal ? k.volume : new Decimal(k.volume as Decimal.Value),
      time: k.time
    }));

    if (newKlines.length > 1) {
      newKlines.sort((a, b) => a.time - b.time);
      const deduped: Kline[] = [];
      let lastTime = -1;
      for (const k of newKlines) {
        if (k.time === lastTime) {
          deduped[deduped.length - 1] = k;
        } else {
          deduped.push(k);
          lastTime = k.time;
        }
      }
      newKlines = deduped;
    }

    let history = current.klines[timeframe] || [];
    if (!current.klines[timeframe]) current.klines[timeframe] = history;

    const userLimit = settingsState.chartHistoryLimit || 2000;
    const safetyLimit = 50000;
    let effectiveLimit: number;
    if (!enforceLimit) {
      effectiveLimit = safetyLimit;
    } else {
      const previousLength = Math.max(0, history.length);
      effectiveLimit = Math.min(Math.max(previousLength, userLimit), safetyLimit);
    }

    const bufferKey = `${symbol}:${timeframe}`;

    const res = this.mergeKlines(history, newKlines, effectiveLimit);
    history = res.history;
    const offset = res.offset;
    const isAppend = res.isAppend;

    if (newKlines.length > 0) {
        current.klines[timeframe] = history;
    }

    const neededLen = history.length;
    if (neededLen === 0) return;

    let backing = this.getBuffer(bufferKey);
    if (!backing || backing.times.length < neededLen) {
        backing = this.ensureCapacity(bufferKey, neededLen);
    }

    this.writeToBuffer(backing, history, neededLen, offset, isAppend);

    const views: KlineBuffers = {
        times: backing.times.subarray(0, neededLen),
        opens: backing.opens.subarray(0, neededLen),
        highs: backing.highs.subarray(0, neededLen),
        lows: backing.lows.subarray(0, neededLen),
        closes: backing.closes.subarray(0, neededLen),
        volumes: backing.volumes.subarray(0, neededLen)
    };

    if (!current.klinesBuffers) current.klinesBuffers = {};
    current.klinesBuffers[timeframe] = views;
    current.lastUpdated = Date.now();
  }

  private mergeKlines(history: Kline[], newKlines: Kline[], effectiveLimit: number) {
    let offset = 0;
    let isAppend = false;
    let mergedHistory = history;

    if (newKlines.length > 0) {
        if (mergedHistory.length === 0) {
            newKlines.sort((a, b) => a.time - b.time);
            if (newKlines.length > effectiveLimit) newKlines = newKlines.slice(-effectiveLimit);
            mergedHistory = newKlines;
        } else {
            newKlines.sort((a, b) => a.time - b.time);
            const lastHistTime = mergedHistory[mergedHistory.length - 1].time;
            const firstNewTime = newKlines[0].time;

            if (firstNewTime > lastHistTime) {
                offset = mergedHistory.length;
                mergedHistory.push(...newKlines);
                isAppend = true;
            } else if (firstNewTime === lastHistTime && newKlines.length === 1) {
                offset = mergedHistory.length - 1;
                mergedHistory[mergedHistory.length - 1] = newKlines[0];
                isAppend = true;
            } else if (firstNewTime >= lastHistTime) {
                for (const k of newKlines) {
                    if (k.time === lastHistTime) {
                        mergedHistory[mergedHistory.length - 1] = k;
                    } else if (k.time > lastHistTime) {
                        mergedHistory.push(k);
                    }
                }
                isAppend = false;
            } else {
                const merged: Kline[] = [];
                let i = 0, j = 0;
                while (i < mergedHistory.length && j < newKlines.length) {
                    if (mergedHistory[i].time < newKlines[j].time) merged.push(mergedHistory[i++]);
                    else if (mergedHistory[i].time > newKlines[j].time) merged.push(newKlines[j++]);
                    else { merged.push(newKlines[j++]); i++; }
                }
                while (i < mergedHistory.length) merged.push(mergedHistory[i++]);
                while (j < newKlines.length) merged.push(newKlines[j++]);
                mergedHistory = merged;
                isAppend = false;
            }

            if (mergedHistory.length > effectiveLimit) {
                mergedHistory = mergedHistory.slice(-effectiveLimit);
                isAppend = false;
            }
        }
    }

    return { history: mergedHistory, offset, isAppend };
  }

  private writeToBuffer(backing: KlineBuffers, history: Kline[], neededLen: number, offset: number, isAppend: boolean) {
    if (isAppend) {
        for (let i = offset; i < neededLen; i++) {
            const k = history[i];
            backing.times[i] = k.time;
            backing.opens[i] = k.open.toNumber();
            backing.highs[i] = k.high.toNumber();
            backing.lows[i] = k.low.toNumber();
            backing.closes[i] = k.close.toNumber();
            backing.volumes[i] = k.volume.toNumber();
        }
    } else {
        for (let i = 0; i < neededLen; i++) {
            const k = history[i];
            backing.times[i] = k.time;
            backing.opens[i] = k.open.toNumber();
            backing.highs[i] = k.high.toNumber();
            backing.lows[i] = k.low.toNumber();
            backing.closes[i] = k.close.toNumber();
            backing.volumes[i] = k.volume.toNumber();
        }
    }
  }
}
