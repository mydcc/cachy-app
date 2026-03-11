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
