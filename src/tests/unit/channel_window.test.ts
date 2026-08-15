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
    // Total window height includes 41px header -> 360 + 41 = 401px
    // Content height (win.height - 41) is exactly 360px.
    const contentHeight = win.height - 41;
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
});
