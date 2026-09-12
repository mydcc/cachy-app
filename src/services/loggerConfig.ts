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
 * The slice of settings the logger needs, behind a provider so the logger never
 * imports a store. It lives in its own leaf module rather than in `logger.ts`
 * because the settings store installs the reader: if the setter came from
 * `logger.ts`, every test that partially mocks the logger and still loads the
 * real settings store would fail on the missing export.
 */
export interface LoggerConfig {
  debugMode?: boolean;
  logSettings?: Partial<Record<string, boolean>>;
}

let provideLoggerConfig: () => LoggerConfig | undefined = () => undefined;

export function setLoggerConfigProvider(provider: () => LoggerConfig | undefined): void {
  provideLoggerConfig = provider;
}

export function readLoggerConfig(): LoggerConfig | undefined {
  return provideLoggerConfig();
}
