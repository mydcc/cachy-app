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

import {
  DbConnection,
  tables,
  reducers
} from '../lib/spacetimedb';
import GlobalMessageType from '../lib/spacetimedb/global_message_type';
import type { Infer } from 'spacetimedb';
import { logger } from './logger';
import { settingsState } from '../stores/settings.svelte';

type GlobalMessage = Infer<typeof GlobalMessageType>;

export interface CloudStatus {
  connected: boolean;
  /** Last connection or send failure, or null. Shown in the settings tab. */
  lastError: string | null;
}

class CloudService {
  private conn: DbConnection | null = null;
  private connected = false;
  private lastError: string | null = null;
  private messages: GlobalMessage[] = [];

  // Callback for Svelte to update UI
  private onMessageCallback: ((msgs: GlobalMessage[]) => void) | null = null;
  private onStatusCallback: ((status: CloudStatus) => void) | null = null;

  constructor() { }

  status(): CloudStatus {
    return { connected: this.connected, lastError: this.lastError };
  }

  /**
   * Connects to the Global Chat module.
   *
   * `host` and `dbName` come from settings (`cloudHost`, `cloudDbName`) rather
   * than from constants in this file — the endpoint is the user's choice, not
   * something Cachy points at on their behalf. The old hardcoded
   * `http://127.0.0.1:3000` / `cachy-server` defaults now live in
   * `defaultSettings`, where the user can see and change them.
   *
   * Anonymous access stays prohibited: Class B condition 2 in ADR-0001.
   */
  async connect(host?: string, dbName?: string, token?: string) {
    if (!token) {
      throw new Error('A valid authentication token is required to connect to the cloud service. Anonymous access is strictly prohibited.');
    }
    if (this.connected) return;

    const uri = host || settingsState.cloudHost;
    const moduleName = dbName || settingsState.cloudDbName;

    if (!uri || !moduleName) {
      throw new Error('Global Chat is not configured: set a server address and module name in Settings.');
    }

    logger.log('network', 'Connecting to SpacetimeDB...', uri);

    try {
      this.conn = DbConnection.builder()
        .withUri(uri)
        .withModuleName(moduleName)
        .withToken(token) // Enforce token
        .onConnect((ctx) => {
          logger.log('network', 'Connected to SpacetimeDB!', ctx);
          this.connected = true;
          this.lastError = null;
          if (this.onStatusCallback) this.onStatusCallback(this.status());

          // Subscribe to queries
          const sub = this.conn?.subscriptionBuilder();
          if (sub) {
            sub.onApplied((ctx) => {
              logger.debug('network', 'Subscription applied', ctx);
            })
              .subscribeToAllTables();
          }
        })
        .onDisconnect((ctx) => {
          logger.log('network', 'Disconnected from SpacetimeDB', ctx);
          this.connected = false;
          if (this.onStatusCallback) this.onStatusCallback(this.status());
        })
        .build();
    } catch (e) {
      // Deliberately not rethrown. An unreachable chat server must never take a
      // calculation, a journal entry or a risk figure down with it — ADR-0001
      // requires every core function to work with the network down. The failure
      // is recorded so the settings tab can say so, and nothing else changes.
      this.lastError = e instanceof Error ? e.message : String(e);
      logger.error('network', 'Failed to build/connect SpacetimeDB connection:', e);
      if (this.onStatusCallback) this.onStatusCallback(this.status());
    }

    // Handle row updates with robustness
    try {
      // Try snake_case if camelCase fails, as SpacetimeDB often generates snake_case for tables
      const globalMessageTable = (tables as any).globalMessage || (tables as any).global_message;

      if (globalMessageTable && typeof globalMessageTable.onInsert === 'function') {
        globalMessageTable.onInsert((ctx: any, row: any) => {
          logger.debug('network', 'New Message Received:', row);
          this.messages = [...this.messages, row];
          if (this.onMessageCallback) this.onMessageCallback([...this.messages]);
        });
      } else {
        logger.warn('network', 'SpacetimeDB: globalMessage table handle not found or not initialized yet.');
      }
    } catch (e) {
      logger.error('network', 'Error setting up SpacetimeDB table listeners:', e);
    }
  }

  sendMessage(text: string) {
    if (!this.connected) {
      logger.warn('network', 'Cannot send message: Not connected');
      return;
    }
    try {
      // The reducers object is exported from the generated code and handles calling the server
      (reducers as any).sendMessage(text);
    } catch (e) {
      // Same rule as connect(): a chat failure stays a chat failure.
      this.lastError = e instanceof Error ? e.message : String(e);
      logger.error('network', 'Failed to send message:', e);
      if (this.onStatusCallback) this.onStatusCallback(this.status());
    }
  }

  subscribeMessages(cb: (msgs: GlobalMessage[]) => void) {
    this.onMessageCallback = cb;
    cb(this.messages);
  }

  subscribeStatus(cb: (status: CloudStatus) => void) {
    this.onStatusCallback = cb;
    cb(this.status());
  }
}

export const cloudService = new CloudService();
