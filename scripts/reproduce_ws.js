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

import WebSocket from 'ws';

const WS_PUBLIC_URL = "wss://fapi.bitunix.com/public/";

const ws = new WebSocket(WS_PUBLIC_URL);

ws.on('open', () => {
    console.log('Connected to Bitunix WS');

    // Subscribe to BTCUSDT ticker
    const payload = { op: "subscribe", args: [{ symbol: "BTCUSDT", ch: "ticker" }] };
    ws.send(JSON.stringify(payload));
    console.log('Sent subscribe payload:', JSON.stringify(payload));
});

ws.on('message', (data) => {
    console.log('Received message:', data.toString());
    // Close after receiving one message to finish test
    ws.close();
});

ws.on('error', (err) => {
    console.error('WebSocket error:', err);
});

ws.on('close', () => {
    console.log('WebSocket closed');
});
