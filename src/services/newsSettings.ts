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

/**
 * The settings slice newsService reads, behind a provider so the service never
 * imports a store. It lives in its own leaf module (not in newsService) to
 * break the `newsService → appAuth → settings → newsService` import cycle:
 * installing the reader must not evaluate newsService's body again.
 *
 * The settings store installs a live reader at module load; absent fields fall
 * back to the same defaults the direct reads used.
 */
export interface NewsSettings {
  cryptoPanicApiKey?: string;
  cryptoPanicPlan?: string;
  cryptoPanicFilter?: string;
  newsApiKey?: string;
  discordBotToken?: string;
  discordChannels?: string[];
  rssPresets?: string[];
  customRssFeeds?: string[];
  rssFilterBySymbol?: boolean;
  aiProvider?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  geminiModel?: string;
  openaiModel?: string;
}

let provideNewsSettings: () => NewsSettings | undefined = () => undefined;

export function setNewsSettingsProvider(provider: () => NewsSettings | undefined): void {
  provideNewsSettings = provider;
}

export function readNewsSettings(): NewsSettings | undefined {
  return provideNewsSettings();
}
