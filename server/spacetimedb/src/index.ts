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

import { schema, table, t } from 'spacetimedb/server';
import { sendMessage } from './reducer';

export const spacetimedb = schema(
  table(
    { name: 'global_message' },
    {
      sender: t.string(),
      text: t.string(),
      sent_at: t.number(), // Timestamp
    }
  )
);

spacetimedb.init((_ctx) => {
  console.info('Module initialized');
});

spacetimedb.clientConnected((ctx) => {
  console.info(`Client connected: ${ctx.sender}`);
});

spacetimedb.clientDisconnected((ctx) => {
  console.info(`Client disconnected: ${ctx.sender}`);
});

// Reducer to send a message
spacetimedb.reducer('send_message', { text: t.string() }, sendMessage);
