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

// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { fireStore } from './fireStore.svelte';

describe('fireStore', () => {
    beforeEach(() => {
        fireStore.clear();
    });

    describe('updateElement', () => {
        it('should add a new element with default values', () => {
            fireStore.updateElement('el1', { width: 100, height: 100 });

            const el = fireStore.elements.get('el1');
            expect(el).toBeDefined();
            expect(el).toEqual({
                id: 'el1',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                intensity: 1.0,
                color: "#ffaa00",
                layer: "tiles"
            });
        });

        it('should update an existing element with new data', () => {
            fireStore.updateElement('el1', { width: 100, height: 100 });

            const originalEl = fireStore.elements.get('el1');

            fireStore.updateElement('el1', { x: 50, color: "#ff0000" });

            const updatedEl = fireStore.elements.get('el1');
            expect(updatedEl).toBeDefined();
            expect(updatedEl?.width).toBe(100);
            expect(updatedEl?.x).toBe(50);
            expect(updatedEl?.color).toBe("#ff0000");
            expect(updatedEl).not.toBe(originalEl); // Object reference should change
        });

        it('should not update an existing element if data is identical (no-op)', () => {
            fireStore.updateElement('el1', { width: 100, height: 100, color: "#ffaa00" });

            const originalEl = fireStore.elements.get('el1');

            fireStore.updateElement('el1', { width: 100, height: 100, color: "#ffaa00" });

            const updatedEl = fireStore.elements.get('el1');
            expect(updatedEl).toBe(originalEl); // Object reference should be exactly the same
        });
    });

    describe('removeElement', () => {
        it('should remove an existing element by id', () => {
            fireStore.updateElement('el1', { width: 100, height: 100 });
            fireStore.updateElement('el2', { width: 200, height: 200 });

            expect(fireStore.elements.size).toBe(2);

            fireStore.removeElement('el1');

            expect(fireStore.elements.size).toBe(1);
            expect(fireStore.elements.get('el1')).toBeUndefined();
            expect(fireStore.elements.get('el2')).toBeDefined();
        });

        it('should do nothing if removing a non-existent element', () => {
            fireStore.updateElement('el1', { width: 100, height: 100 });

            expect(fireStore.elements.size).toBe(1);

            fireStore.removeElement('non-existent');

            expect(fireStore.elements.size).toBe(1);
            expect(fireStore.elements.get('el1')).toBeDefined();
        });
    });

    describe('clear', () => {
        it('should remove all elements', () => {
            fireStore.updateElement('el1', { width: 100, height: 100 });
            fireStore.updateElement('el2', { width: 200, height: 200 });
            fireStore.updateElement('el3', { width: 300, height: 300 });

            expect(fireStore.elements.size).toBe(3);

            fireStore.clear();

            expect(fireStore.elements.size).toBe(0);
        });
    });
});
