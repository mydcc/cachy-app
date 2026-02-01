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
