/*
 * Copyright (C) 2026 MYDCT
 *
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
export function slidingWindowMax(data: NumberArray, period: number, out?: Float64Array): Float64Array {
  const len = data.length;
  const result = out || new Float64Array(len);
  result.fill(NaN);
  const deque: number[] = []; // Stores indices

  if (len < period) return result;

  for (let i = 0; i < len; i++) {
    // 1. Remove indices that are out of the current window
    // The window is [i - period + 1, i]
    // So if deque[0] < i - period + 1, it is out.
    if (deque.length > 0 && deque[0] <= i - period) {
      deque.shift();
    }

    // 2. Maintain monotonic decreasing order in deque
    // Remove elements from the back that are smaller than or equal to current element
    // because they can never be the max if the current element is larger and newer.
    while (deque.length > 0 && data[deque[deque.length - 1]] <= data[i]) {
      deque.pop();
    }

    // 3. Add current index
    deque.push(i);

    // 4. Set result if we have a full window
    if (i >= period - 1) {
      result[i] = data[deque[0]];
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
export function slidingWindowMin(data: NumberArray, period: number, out?: Float64Array): Float64Array {
  const len = data.length;
  const result = out || new Float64Array(len);
  result.fill(NaN);
  const deque: number[] = []; // Stores indices

  if (len < period) return result;

  for (let i = 0; i < len; i++) {
    // 1. Remove indices out of window
    if (deque.length > 0 && deque[0] <= i - period) {
      deque.shift();
    }

    // 2. Maintain monotonic increasing order in deque
    // Remove elements from back that are larger than or equal to current
    while (deque.length > 0 && data[deque[deque.length - 1]] >= data[i]) {
      deque.pop();
    }

    // 3. Add current index
    deque.push(i);

    // 4. Set result
    if (i >= period - 1) {
      result[i] = data[deque[0]];
    }
  }

  return result;
}
