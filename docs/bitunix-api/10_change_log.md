# Change Log

> Upstream crawl log, frozen at crawl date 2026-08-08. Cachy-side amendments live in `INTEGRATION_STATUS.md`, not here.

Source: https://www.bitunix.com/api-docs/futures/log/change_log.html

This page documents updates to the OpenAPI documentation.

## Cachy amendments (since crawl)

- FEAT-0068/0069/0070, BUG-0292/0293, funding-percent finding, and native close-all / flash-close / Safe-Modify wiring landed after the crawl — see `INTEGRATION_STATUS.md` (reviewed 2026-09-05).

## 2026-06-15

### WebSocket Connection Limits

WebSocket connection rate limit documentation added under [WebSocket Preparing for
Access](08_websocket.md).

- The WebSocket server accepts at most **5 messages per second**
- Messages include PING frames, PONG frames and JSON-formatted
  messages (e.g. subscribe/unsubscribe requests)
- If the message rate exceeds this limit, the connection
  is disconnected
- IPs that are disconnected repeatedly may be blocked by the server
