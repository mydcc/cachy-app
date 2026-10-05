// @vitest-environment node
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

import { describe, it, expect } from 'vitest';
import { ChannelWindow } from '../../lib/windows/implementations/ChannelWindow.svelte';
import { windowRegistry } from '../../lib/windows/WindowRegistry.svelte';

describe('ChannelWindow Initial Dimensions and Aspect Ratio', () => {
  it('should register channel window type with 640x360 layout, top-left position (20, 60), and 16:9 ratio', () => {
    const config = windowRegistry.getConfig('channel');
    expect(config.layout.x).toBe(20);
    expect(config.layout.y).toBe(60);
    expect(config.layout.width).toBe(640);
    expect(config.layout.height).toBe(360);
    expect(config.layout.aspectRatio).toBeCloseTo(16 / 9);
  });

  it('should instantiate ChannelWindow with 640 width, top-left position (20, 60), and 16:9 content aspect ratio', () => {
    const win = new ChannelWindow(
      'https://space.cachy.app/index.php?plot_id=genesis',
      'Cachy Space',
      'genesis'
    );

    expect(win.x).toBe(20);
    expect(win.y).toBe(60);
    expect(win.width).toBe(640);
    expect(win.aspectRatio).toBeCloseTo(16 / 9);
    // Total window height includes 44px header -> 360 + 44 = 404px
    // Content height (win.height - 44) is exactly 360px.
    const contentHeight = win.height - 44;
    expect(contentHeight).toBe(360);
    expect(win.width / contentHeight).toBeCloseTo(16 / 9);
  });

  it('should restrict fullscreen permission in iframe componentProps to prevent auto-fullscreen', () => {
    const win = new ChannelWindow(
      'https://space.cachy.app/index.php?plot_id=BTC',
      'BTC Channel',
      'channel-BTC'
    );

    const props = win.componentProps as { allow?: string };
    expect(props.allow).toBeDefined();
    expect(props.allow).not.toContain('fullscreen');
  });

  it('should sandbox the channel iframe without allow-modals to suppress embedded alert() popups', () => {
    const win = new ChannelWindow(
      'https://space.cachy.app/index.php?plot_id=BTC',
      'BTC Channel',
      'channel-BTC'
    );

    const props = win.componentProps as { sandbox?: string };
    expect(props.sandbox).toBeDefined();
    expect(props.sandbox).toContain('allow-scripts');
    expect(props.sandbox).toContain('allow-same-origin');
    expect(props.sandbox).not.toContain('allow-modals');
  });

  it('ignores unity-info aspect reports deviating from 16:9', () => {
    const win = new ChannelWindow(
      'https://space.cachy.app/index.php?plot_id=BTC',
      'BTC Channel',
      'channel-BTC'
    );

    const before = win.aspectRatio;
    const handleMessage = (win as unknown as { handleUnityMessage: (e: unknown) => void }).handleUnityMessage;
    // 640x404 includes window chrome — must not corrupt the 16:9 lock.
    handleMessage({ origin: 'https://space.cachy.app', data: { type: 'unity-info', width: 640, height: 404 } });
    expect(win.aspectRatio).toBe(before);
  });

  it('applies unity-info aspect reports at 16:9', () => {
    const win = new ChannelWindow(
      'https://space.cachy.app/index.php?plot_id=BTC',
      'BTC Channel',
      'channel-BTC'
    );

    const handleMessage = (win as unknown as { handleUnityMessage: (e: unknown) => void }).handleUnityMessage;
    handleMessage({ origin: 'https://space.cachy.app', data: { type: 'unity-info', width: 1280, height: 720 } });
    expect(win.aspectRatio).toBeCloseTo(16 / 9);
    expect(win.height).toBe(Math.round(win.width / (16 / 9)) + 44);
  });
});
