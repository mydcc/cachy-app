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

/**
 * Sliding Window Algorithms
 * Optimized O(N) implementations using Monotonic Queues.
 */

import type { NumberArray } from "./indicators";

/**
 * Calculates the sliding window maximum for the given data.
 * @param data Input array (number[] or Float64Array)
 * @param period Window size
 * @returns Array where result[i] is the max of data[i-period+1 ... i]
 */
export function slidingWindowMax(
  data: NumberArray,
  period: number,
  out?: Float64Array,
): Float64Array {
  const len = data.length;
  const result = (out && out.length === len) ? out : new Float64Array(len);
  result.fill(NaN);

  if (len < period) return result;

  // Ring Buffer Deque
  const bufferSize = period + 1;
  const deque = new Int32Array(bufferSize);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < len; i++) {
    // 1. Remove indices that are out of the current window
    if (head !== tail && deque[head] <= i - period) {
      head++;
      if (head === bufferSize) head = 0;
    }

    if (!isNaN(data[i])) {
      // 2. Maintain monotonic decreasing order in deque
      while (head !== tail) {
        let lastIdx = tail - 1;
        if (lastIdx < 0) lastIdx = bufferSize - 1;

        if (data[deque[lastIdx]] <= data[i]) {
          tail = lastIdx; // Pop back
        } else {
          break;
        }
      }

      // 3. Add current index
      deque[tail] = i;
      tail++;
      if (tail === bufferSize) tail = 0;
    }

    // 4. Set result if we have a full window (only if head is not equal to tail)
    if (i >= period - 1 && head !== tail) {
      result[i] = data[deque[head]];
    }
  }

  return result;
}

/**
 * Calculates the sliding window minimum for the given data.
 * @param data Input array (number[] or Float64Array)
 * @param period Window size
 * @returns Array where result[i] is the min of data[i-period+1 ... i]
 */
export function slidingWindowMin(
  data: NumberArray,
  period: number,
  out?: Float64Array,
): Float64Array {
  const len = data.length;
  const result = (out && out.length === len) ? out : new Float64Array(len);
  result.fill(NaN);

  if (len < period) return result;

  // Ring Buffer Deque
  const bufferSize = period + 1;
  const deque = new Int32Array(bufferSize);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < len; i++) {
    // 1. Remove indices out of window
    if (head !== tail && deque[head] <= i - period) {
      head++;
      if (head === bufferSize) head = 0;
    }

    if (!isNaN(data[i])) {
      // 2. Maintain monotonic increasing order in deque
      while (head !== tail) {
        let lastIdx = tail - 1;
        if (lastIdx < 0) lastIdx = bufferSize - 1;

        if (data[deque[lastIdx]] >= data[i]) {
          tail = lastIdx; // Pop back
        } else {
          break;
        }
      }

      // 3. Add current index
      deque[tail] = i;
      tail++;
      if (tail === bufferSize) tail = 0;
    }

    // 4. Set result (only if head is not equal to tail)
    if (i >= period - 1 && head !== tail) {
      result[i] = data[deque[head]];
    }
  }

  return result;
}
