/*
 * Copyright (C) 2026 MYDCT
 *
 * CircularBuffer Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { CircularBuffer } from '../../src/utils/circularBuffer';

describe('CircularBuffer', () => {
    describe('Basic Operations', () => {
        it('should maintain fixed capacity', () => {
            const buffer = new CircularBuffer<number>(3);
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            buffer.push(4); // Overwrites 1
            
            expect(buffer.getSize()).toBe(3);
            expect(buffer.toArray()).toEqual([2, 3, 4]);
        });

        it('should provide O(1) access', () => {
            const buffer = new CircularBuffer<number>(100);
            for (let i = 0; i < 100; i++) {
                buffer.push(i);
            }
            
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                buffer.get(50);
            }
            const elapsed = performance.now() - start;
            
            // 1000 accesses should be < 1ms
            expect(elapsed).toBeLessThan(1);
        });

        it('should handle empty buffer', () => {
            const buffer = new CircularBuffer<number>(5);
            
            expect(buffer.isEmpty()).toBe(true);
            expect(buffer.getSize()).toBe(0);
            expect(buffer.getLast()).toBeUndefined();
            expect(buffer.getFirst()).toBeUndefined();
            expect(buffer.toArray()).toEqual([]);
        });

        it('should handle single element', () => {
            const buffer = new CircularBuffer<number>(5);
            buffer.push(42);
            
            expect(buffer.getSize()).toBe(1);
            expect(buffer.getLast()).toBe(42);
            expect(buffer.getFirst()).toBe(42);
            expect(buffer.get(0)).toBe(42);
        });
    });

    describe('Overflow Behavior', () => {
        it('should overwrite oldest elements when full', () => {
            const buffer = new CircularBuffer<string>(3);
            buffer.push('a');
            buffer.push('b');
            buffer.push('c');
            buffer.push('d'); // Overwrites 'a'
            buffer.push('e'); // Overwrites 'b'
            
            expect(buffer.toArray()).toEqual(['c', 'd', 'e']);
            expect(buffer.getFirst()).toBe('c');
            expect(buffer.getLast()).toBe('e');
        });

        it('should handle continuous overflow', () => {
            const buffer = new CircularBuffer<number>(3);
            
            for (let i = 0; i < 100; i++) {
                buffer.push(i);
            }
            
            expect(buffer.getSize()).toBe(3);
            expect(buffer.toArray()).toEqual([97, 98, 99]);
        });
    });

    describe('Update Operations', () => {
        it('should update last element in-place', () => {
            const buffer = new CircularBuffer<{ price: number }>(3);
            buffer.push({ price: 100 });
            buffer.push({ price: 101 });
            buffer.push({ price: 102 });
            
            const updated = buffer.updateLast({ price: 103 });
            
            expect(updated).toBe(true);
            expect(buffer.getLast()?.price).toBe(103);
            expect(buffer.getSize()).toBe(3); // Size unchanged
        });

        it('should return false when updating empty buffer', () => {
            const buffer = new CircularBuffer<number>(5);
            const updated = buffer.updateLast(42);
            
            expect(updated).toBe(false);
        });
    });

    describe('Iteration', () => {
        it('should iterate in correct order', () => {
            const buffer = new CircularBuffer<number>(5);
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            
            const items: number[] = [];
            buffer.forEach((item: number) => items.push(item));
            
            expect(items).toEqual([1, 2, 3]);
        });

        it('should map correctly', () => {
            const buffer = new CircularBuffer<number>(5);
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            
            const doubled = buffer.map((x: number) => x * 2);
            
            expect(doubled).toEqual([2, 4, 6]);
        });

        it('should iterate after overflow', () => {
            const buffer = new CircularBuffer<number>(3);
            for (let i = 0; i < 5; i++) {
                buffer.push(i);
            }
            
            const items: number[] = [];
            buffer.forEach((item: number) => items.push(item));
            
            expect(items).toEqual([2, 3, 4]);
        });
    });

    describe('Clear Operation', () => {
        it('should clear buffer', () => {
            const buffer = new CircularBuffer<number>(5);
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            
            buffer.clear();
            
            expect(buffer.isEmpty()).toBe(true);
            expect(buffer.getSize()).toBe(0);
            expect(buffer.toArray()).toEqual([]);
        });

        it('should allow reuse after clear', () => {
            const buffer = new CircularBuffer<number>(3);
            buffer.push(1);
            buffer.push(2);
            buffer.clear();
            buffer.push(3);
            buffer.push(4);
            
            expect(buffer.toArray()).toEqual([3, 4]);
        });
    });

    describe('Edge Cases', () => {
        it('should throw on invalid capacity', () => {
            expect(() => new CircularBuffer<number>(0)).toThrow();
            expect(() => new CircularBuffer<number>(-1)).toThrow();
        });

        it('should handle capacity of 1', () => {
            const buffer = new CircularBuffer<number>(1);
            buffer.push(1);
            buffer.push(2);
            buffer.push(3);
            
            expect(buffer.getSize()).toBe(1);
            expect(buffer.getLast()).toBe(3);
        });

        it('should return undefined for out-of-bounds access', () => {
            const buffer = new CircularBuffer<number>(5);
            buffer.push(1);
            buffer.push(2);
            
            expect(buffer.get(-1)).toBeUndefined();
            expect(buffer.get(2)).toBeUndefined();
            expect(buffer.get(100)).toBeUndefined();
        });
    });

    describe('Memory Efficiency', () => {
        it('should not resize internal array', () => {
            const buffer = new CircularBuffer<number>(100);
            
            // Fill buffer multiple times
            for (let i = 0; i < 1000; i++) {
                buffer.push(i);
            }
            
            // Capacity should remain constant
            expect(buffer.getCapacity()).toBe(100);
            expect(buffer.getSize()).toBe(100);
        });

        it('should handle large capacity efficiently', () => {
            const buffer = new CircularBuffer<number>(10000);
            
            const start = performance.now();
            for (let i = 0; i < 10000; i++) {
                buffer.push(i);
            }
            const elapsed = performance.now() - start;
            
            // 10k pushes should be < 10ms
            expect(elapsed).toBeLessThan(10);
        });
    });
});
