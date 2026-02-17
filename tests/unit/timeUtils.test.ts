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

/*
 * Copyright (C) 2026 MYDCT
 *
 * timeUtils Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRelativeTimeString, formatGermanDate } from '../../src/lib/utils/timeUtils';

describe('timeUtils', () => {
    const MOCK_NOW = new Date('2026-05-25T12:00:00Z');

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(MOCK_NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('getRelativeTimeString', () => {
        describe('German (de)', () => {
            it('should return "gerade eben" for current time', () => {
                expect(getRelativeTimeString(MOCK_NOW.toISOString(), 'de')).toBe('gerade eben');
            });

            it('should return "gerade eben" for future dates', () => {
                const future = new Date(MOCK_NOW.getTime() + 1000).toISOString();
                expect(getRelativeTimeString(future, 'de')).toBe('gerade eben');
            });

            it('should handle singular time units', () => {
                const cases = [
                    { offset: 1000, expected: 'vor 1 Sekunde' },
                    { offset: 60 * 1000, expected: 'vor 1 Minute' },
                    { offset: 60 * 60 * 1000, expected: 'vor 1 Stunde' },
                    { offset: 24 * 60 * 60 * 1000, expected: 'vor 1 Tag' },
                    { offset: 7 * 24 * 60 * 60 * 1000, expected: 'vor 1 Woche' },
                    { offset: 30 * 24 * 60 * 60 * 1000, expected: 'vor 1 Monat' },
                    { offset: 365 * 24 * 60 * 60 * 1000, expected: 'vor 1 Jahr' },
                ];

                cases.forEach(({ offset, expected }) => {
                    const date = new Date(MOCK_NOW.getTime() - offset).toISOString();
                    expect(getRelativeTimeString(date, 'de')).toBe(expected);
                });
            });

            it('should handle plural time units', () => {
                const cases = [
                    { offset: 2 * 1000, expected: 'vor 2 Sekunden' },
                    { offset: 2 * 60 * 1000, expected: 'vor 2 Minuten' },
                    { offset: 2 * 60 * 60 * 1000, expected: 'vor 2 Stunden' },
                    { offset: 2 * 24 * 60 * 60 * 1000, expected: 'vor 2 Tagen' },
                    { offset: 2 * 7 * 24 * 60 * 60 * 1000, expected: 'vor 2 Wochen' },
                    { offset: 2 * 30 * 24 * 60 * 60 * 1000, expected: 'vor 2 Monaten' },
                    { offset: 2 * 365 * 24 * 60 * 60 * 1000, expected: 'vor 2 Jahren' },
                ];

                cases.forEach(({ offset, expected }) => {
                    const date = new Date(MOCK_NOW.getTime() - offset).toISOString();
                    expect(getRelativeTimeString(date, 'de')).toBe(expected);
                });
            });

            it('should return "unbekannt" for invalid dates', () => {
                expect(getRelativeTimeString('invalid-date', 'de')).toBe('unbekannt');
            });
        });

        describe('English (en)', () => {
            it('should return "just now" for current time', () => {
                expect(getRelativeTimeString(MOCK_NOW.toISOString(), 'en')).toBe('just now');
            });

            it('should return "just now" for future dates', () => {
                const future = new Date(MOCK_NOW.getTime() + 1000).toISOString();
                expect(getRelativeTimeString(future, 'en')).toBe('just now');
            });

            it('should handle singular time units', () => {
                const cases = [
                    { offset: 1000, expected: '1 second ago' },
                    { offset: 60 * 1000, expected: '1 minute ago' },
                    { offset: 60 * 60 * 1000, expected: '1 hour ago' },
                    { offset: 24 * 60 * 60 * 1000, expected: '1 day ago' },
                    { offset: 7 * 24 * 60 * 60 * 1000, expected: '1 week ago' },
                    { offset: 30 * 24 * 60 * 60 * 1000, expected: '1 month ago' },
                    { offset: 365 * 24 * 60 * 60 * 1000, expected: '1 year ago' },
                ];

                cases.forEach(({ offset, expected }) => {
                    const date = new Date(MOCK_NOW.getTime() - offset).toISOString();
                    expect(getRelativeTimeString(date, 'en')).toBe(expected);
                });
            });

            it('should handle plural time units', () => {
                const cases = [
                    { offset: 2 * 1000, expected: '2 seconds ago' },
                    { offset: 2 * 60 * 1000, expected: '2 minutes ago' },
                    { offset: 2 * 60 * 60 * 1000, expected: '2 hours ago' },
                    { offset: 2 * 24 * 60 * 60 * 1000, expected: '2 days ago' },
                    { offset: 2 * 7 * 24 * 60 * 60 * 1000, expected: '2 weeks ago' },
                    { offset: 2 * 30 * 24 * 60 * 60 * 1000, expected: '2 months ago' },
                    { offset: 2 * 365 * 24 * 60 * 60 * 1000, expected: '2 years ago' },
                ];

                cases.forEach(({ offset, expected }) => {
                    const date = new Date(MOCK_NOW.getTime() - offset).toISOString();
                    expect(getRelativeTimeString(date, 'en')).toBe(expected);
                });
            });

            it('should return "unknown" for invalid dates', () => {
                expect(getRelativeTimeString('invalid-date', 'en')).toBe('unknown');
            });
        });
    });

    describe('formatGermanDate', () => {
        it('should format date correctly', () => {
            const date = '2026-01-19T23:00:00Z';
            // result depends on timezone of the environment.
            // Since we use de-DE locale, we expect a specific format.
            // Using a regex to be timezone-independent for the hour/minute part if necessary,
            // but usually servers run in UTC.
            const formatted = formatGermanDate(date);
            expect(formatted).toMatch(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/);
            expect(formatted).toContain('19.01.2026');
        });

        it('should return original string for invalid dates', () => {
            const invalid = 'not-a-date';
            expect(formatGermanDate(invalid)).toBe(invalid);
        });
    });
});
