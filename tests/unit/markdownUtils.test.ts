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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderSafeMarkdown } from '../../src/utils/markdownUtils';
import DOMPurify from 'dompurify';

// Mock DOMPurify as we are in a non-browser environment
vi.mock('dompurify', () => {
    return {
        default: {
            sanitize: vi.fn((raw, options) => {
                if (options?.RETURN_DOM_FRAGMENT) {
                    return { nodeType: 11, _isFragment: true } as unknown as DocumentFragment;
                }
                return raw;
            })
        }
    };
});

describe('markdownUtils', () => {
    describe('renderSafeMarkdown', () => {
        let originalWindow: Window & typeof globalThis;

        beforeEach(() => {
            originalWindow = global.window;
            global.window = {} as unknown as Window & typeof globalThis;
        });

        afterEach(() => {
            global.window = originalWindow;
            vi.clearAllMocks();
        });

        it('should return empty string for empty input', () => {
            expect(renderSafeMarkdown('')).toBe('');
            expect(renderSafeMarkdown(null as unknown as string)).toBe('');
            expect(renderSafeMarkdown(undefined as unknown as string)).toBe('');
        });

        it('should return empty string during SSR', () => {
            const temp = global.window;
            // @ts-expect-error -- global.window is not optional; deleted to simulate a server environment
            delete global.window;

            expect(renderSafeMarkdown('# Hello')).toBe('');

            global.window = temp;
        });

        it('should return DocumentFragment on the client', () => {
            const result = renderSafeMarkdown('# Hello');
            expect(typeof result).toBe('object');
            expect((result as unknown as { _isFragment?: boolean })._isFragment).toBe(true);
            expect(DOMPurify.sanitize).toHaveBeenCalledWith(expect.any(String), { RETURN_DOM_FRAGMENT: true });
        });

        it('should fail-close (return empty string) if error occurs', () => {
            // Mock DOMPurify to throw to simulate an error in the try-catch block
            vi.mocked(DOMPurify.sanitize).mockImplementationOnce(() => {
                throw new Error('Mock sanitize error');
            });

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const result = renderSafeMarkdown('# Hello');

            expect(result).toBe(''); // Must not return the raw '# Hello'
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });
});
