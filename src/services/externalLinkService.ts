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

export class ExternalLinkService {
  private static instance: ExternalLinkService;

  private constructor() {}

  public static getInstance(): ExternalLinkService {
    if (!ExternalLinkService.instance) {
      ExternalLinkService.instance = new ExternalLinkService();
    }
    return ExternalLinkService.instance;
  }

  /**
   * Opens a URL in a new window or focuses the existing window if it's already open.
   * Relying on the browser's native named window lookup mechanism (window.open(url, name)).
   *
   * @param url The URL to open.
   * @param key A unique key to identify the window context (e.g., "tv_BTCUSDT").
   */
  public openOrFocus(url: string, key: string): void {
    // We rely on the browser to find the existing window with this 'key' (name).
    // If it exists, the browser reuses it. If not, it opens a new one.
    // We attempt to focus it, though modern browsers may block focus() if not triggered by direct user action.
    const win = window.open(url, key);
    if (win) {
      win.focus();
    }
  }
}

export const externalLinkService = ExternalLinkService.getInstance();
