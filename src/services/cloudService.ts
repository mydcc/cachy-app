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

type GlobalMessage = Infer<typeof GlobalMessageType>;

class CloudService {
  private conn: DbConnection | null = null;
  private connected = false;
  private connecting = false;
  private tableListenersRegistered = false;
  private messages: GlobalMessage[] = [];

  // Callback for Svelte to update UI
  private onMessageCallback: ((msgs: GlobalMessage[]) => void) | null = null;

  constructor() { }

  // Callback for Svelte to update UI on connection status changes
  private onConnectionStatusCallback: ((connected: boolean) => void) | null = null;

  async connect(host: string = 'http://127.0.0.1:3000', dbName: string = 'cachy-server', token?: string) {
    if (!token) {
      throw new Error('A valid authentication token is required to connect to the cloud service. Anonymous access is strictly prohibited.');
    }
    if (this.connected || this.connecting) return;
    this.connecting = true;

    logger.log('network', 'Connecting to SpacetimeDB...', host);

    const CONNECTION_TIMEOUT_MS = 15_000;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.connecting = false;
          logger.error('network', 'SpacetimeDB connection timed out after 15s');
          reject(new Error('Connection timed out'));
        }
      }, CONNECTION_TIMEOUT_MS);

      const settleResolve = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      };
      const settleReject = (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(err);
      };

      try {
        this.conn = DbConnection.builder()
          .withUri(host)
          .withModuleName(dbName)
          .withToken(token) // Enforce token
          .onConnect((ctx) => {
            logger.log('network', 'Connected to SpacetimeDB!', ctx);
            this.connected = true;
            this.connecting = false;
            if (this.onConnectionStatusCallback) this.onConnectionStatusCallback(true);

            // Subscribe to queries
            const sub = this.conn?.subscriptionBuilder();
            if (sub) {
              sub.onApplied((ctx) => {
                logger.debug('network', 'Subscription applied', ctx);
              })
                .subscribeToAllTables();
            }

            settleResolve();
          })
          .onDisconnect((ctx) => {
            logger.log('network', 'Disconnected from SpacetimeDB', ctx);
            this.connected = false;
            this.connecting = false;
            if (this.onConnectionStatusCallback) this.onConnectionStatusCallback(false);
          })
          .onConnectError((_ctx, err) => {
            logger.error('network', 'SpacetimeDB connection error:', err);
            this.connecting = false;
            settleReject(err instanceof Error ? err : new Error(String(err)));
          })
          .build();
      } catch (e) {
        logger.error('network', 'Failed to build/connect SpacetimeDB connection:', e);
        this.connecting = false;
        settleReject(e);
        return;
      }

      // Handle row updates with robustness — register only once on the singleton table handle
      if (!this.tableListenersRegistered) {
        try {
          // Try snake_case if camelCase fails, as SpacetimeDB often generates snake_case for tables
          const globalMessageTable = (tables as any).globalMessage || (tables as any).global_message;

          if (globalMessageTable && typeof globalMessageTable.onInsert === 'function') {
            globalMessageTable.onInsert((ctx: any, row: any) => {
              logger.debug('network', 'New Message Received:', row);
              this.messages = [...this.messages, row];
              if (this.onMessageCallback) this.onMessageCallback([...this.messages]);
            });
            this.tableListenersRegistered = true;
          } else {
            logger.warn('network', 'SpacetimeDB: globalMessage table handle not found or not initialized yet.');
          }
        } catch (e) {
          logger.error('network', 'Error setting up SpacetimeDB table listeners:', e);
        }
      }
    });
  }

  subscribeConnectionStatus(cb: (connected: boolean) => void) {
    this.onConnectionStatusCallback = cb;
    cb(this.connected);
  }

  sendMessage(text: string) {
    if (!this.connected) {
      logger.warn('network', 'Cannot send message: Not connected');
      return;
    }
    // The reducers object is exported from the generated code and handles calling the server
    (reducers as any).sendMessage(text);
  }

  subscribeMessages(cb: (msgs: GlobalMessage[]) => void) {
    this.onMessageCallback = cb;
    cb(this.messages);
  }
}

export const cloudService = new CloudService();
