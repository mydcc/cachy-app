
import { describe, it, expect } from 'vitest';
import { getPresetUrls, RSS_PRESETS } from './rssPresets';

describe('rssPresets', () => {
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
