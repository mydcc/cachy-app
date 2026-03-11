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
import { marked } from 'marked';

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
        let originalWindow: any;

        beforeEach(() => {
            originalWindow = global.window;
            global.window = {} as any;
        });

        afterEach(() => {
            global.window = originalWindow;
            vi.clearAllMocks();
        });

        it('should return empty string for empty input', () => {
            expect(renderSafeMarkdown('')).toBe('');
            expect(renderSafeMarkdown(null as any)).toBe('');
            expect(renderSafeMarkdown(undefined as any)).toBe('');
        });

        it('should return empty string during SSR', () => {
            const temp = global.window;
            // @ts-ignore
            delete global.window;

            expect(renderSafeMarkdown('# Hello')).toBe('');

            global.window = temp;
        });

        it('should return DocumentFragment on the client', () => {
            const result = renderSafeMarkdown('# Hello');
            expect(typeof result).toBe('object');
            expect((result as any)._isFragment).toBe(true);
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
