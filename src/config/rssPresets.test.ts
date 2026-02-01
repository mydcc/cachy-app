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


import { describe, it, expect } from 'vitest';
import { getPresetUrls, getRSSUrlsByIds, RSS_PRESETS } from './rssPresets';

describe('rssPresets', () => {
  describe('getPresetUrls', () => {
    it('should return correct URLs for existing IDs', () => {
      const ids = ['coindesk', 'decrypt'];
      const urls = getPresetUrls(ids);
      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://www.coindesk.com/arc/outboundfeeds/rss/');
      expect(urls).toContain('https://decrypt.co/feed');
    });

    it('should ignore non-existent IDs', () => {
      const ids = ['coindesk', 'fake-id'];
      const urls = getPresetUrls(ids);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://www.coindesk.com/arc/outboundfeeds/rss/');
    });

    it('should return empty array for empty input', () => {
      const urls = getPresetUrls([]);
      expect(urls).toEqual([]);
    });

    it('should preserve order based on presets list (not input ids)', () => {
      // RSS_PRESETS order: coindesk, cointelegraph, decrypt...
      // Input IDs: decrypt, coindesk
      const ids = ['decrypt', 'coindesk'];
      const urls = getPresetUrls(ids);

      // Should match RSS_PRESETS order: coindesk first, then decrypt
      const coindeskUrl = RSS_PRESETS.find(p => p.id === 'coindesk')!.url;
      const decryptUrl = RSS_PRESETS.find(p => p.id === 'decrypt')!.url;

      expect(urls[0]).toBe(coindeskUrl);
      expect(urls[1]).toBe(decryptUrl);
    });
  });

  describe('getRSSUrlsByIds', () => {
    it('should return correct URLs for existing IDs', () => {
      const ids = ['coindesk', 'decrypt'];
      const urls = getRSSUrlsByIds(ids);
      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://www.coindesk.com/arc/outboundfeeds/rss/');
      expect(urls).toContain('https://decrypt.co/feed');
    });

    it('should ignore non-existent IDs', () => {
      const ids = ['coindesk', 'fake-id'];
      const urls = getRSSUrlsByIds(ids);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://www.coindesk.com/arc/outboundfeeds/rss/');
    });

    it('should return empty array for empty input', () => {
      const urls = getRSSUrlsByIds([]);
      expect(urls).toEqual([]);
    });

    it('should preserve order based on presets list', () => {
      const ids = ['decrypt', 'coindesk'];
      const urls = getRSSUrlsByIds(ids);

      const coindeskUrl = RSS_PRESETS.find(p => p.id === 'coindesk')!.url;
      const decryptUrl = RSS_PRESETS.find(p => p.id === 'decrypt')!.url;

      expect(urls[0]).toBe(coindeskUrl);
      expect(urls[1]).toBe(decryptUrl);
    });
  });
});
