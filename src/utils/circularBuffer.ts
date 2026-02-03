/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * Circular Buffer (Ring Buffer) Implementation
 * 
 * Fixed-size buffer with O(1) push and get operations.
 * Automatically overwrites oldest data when capacity is reached.
 * 
 * Use cases:
 * - Price history storage (max 200 candles)
 * - Indicator state management (e.g., RSI periods)
 * - Memory-efficient time series data
 * 
 * Performance:
 * - Push: O(1)
 * - Get: O(1)
 * - Memory: Fixed allocation, no resizing
 */
export class CircularBuffer<T> {
    private buffer: T[];
    private head: number = 0;  // Index of oldest element
    private tail: number = 0;  // Index where next element will be written
    private size: number = 0;  // Current number of elements
    
    constructor(private capacity: number) {
        if (capacity <= 0) {
            throw new Error('CircularBuffer capacity must be positive');
        }
        this.buffer = new Array(capacity);
    }
    
    /**
     * Add element to buffer. Overwrites oldest if at capacity.
     * O(1) operation.
     */
    push(item: T): void {
        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.capacity;
        
        if (this.size < this.capacity) {
            this.size++;
        } else {
            // Buffer is full, move head forward (overwrite oldest)
            this.head = (this.head + 1) % this.capacity;
        }
    }
    
    /**
     * Get element at index (0 = oldest, size-1 = newest).
     * O(1) operation.
     */
    get(index: number): T | undefined {
        if (index < 0 || index >= this.size) {
            return undefined;
        }
        return this.buffer[(this.head + index) % this.capacity];
    }
    
    /**
     * Get the most recently added element.
     * O(1) operation.
     */
    getLast(): T | undefined {
        if (this.size === 0) return undefined;
        const lastIndex = (this.tail - 1 + this.capacity) % this.capacity;
        return this.buffer[lastIndex];
    }
    
    /**
     * Get the oldest element.
     * O(1) operation.
     */
    getFirst(): T | undefined {
        if (this.size === 0) return undefined;
        return this.buffer[this.head];
    }
    
    /**
     * Convert buffer to array (oldest to newest).
     * O(n) operation - use sparingly.
     */
    toArray(): T[] {
        const result: T[] = [];
        for (let i = 0; i < this.size; i++) {
            result.push(this.buffer[(this.head + i) % this.capacity]!);
        }
        return result;
    }
    
    /**
     * Get current number of elements.
     */
    getSize(): number {
        return this.size;
    }
    
    /**
     * Get maximum capacity.
     */
    getCapacity(): number {
        return this.capacity;
    }
    
    /**
     * Check if buffer is full.
     */
    isFull(): boolean {
        return this.size === this.capacity;
    }
    
    /**
     * Check if buffer is empty.
     */
    isEmpty(): boolean {
        return this.size === 0;
    }
    
    /**
     * Clear all elements.
     * O(1) operation (just resets pointers).
     */
    clear(): void {
        this.head = 0;
        this.tail = 0;
        this.size = 0;
        // Note: We don't clear the array itself to avoid GC pressure
    }
    
    /**
     * Update the last element in-place (useful for updating current candle).
     * Returns true if successful, false if buffer is empty.
     */
    updateLast(item: T): boolean {
        if (this.size === 0) return false;
        const lastIndex = (this.tail - 1 + this.capacity) % this.capacity;
        this.buffer[lastIndex] = item;
        return true;
    }
    
    /**
     * Iterate over all elements (oldest to newest).
     */
    forEach(callback: (item: T, index: number) => void): void {
        for (let i = 0; i < this.size; i++) {
            callback(this.buffer[(this.head + i) % this.capacity]!, i);
        }
    }
    
    /**
     * Map over all elements and return new array.
     */
    map<U>(callback: (item: T, index: number) => U): U[] {
        const result: U[] = [];
        for (let i = 0; i < this.size; i++) {
            result.push(callback(this.buffer[(this.head + i) % this.capacity]!, i));
        }
        return result;
    }
}
