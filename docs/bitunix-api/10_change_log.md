# Change Log

> Upstream crawl log, frozen at crawl date 2026-08-08. Cachy-side amendments live in `INTEGRATION_STATUS.md`, not here.

Quelle: https://www.bitunix.com/api-docs/futures/log/change_log.html

Diese Seite dokumentiert Updates an der OpenAPI-Dokumentation.

## Cachy amendments (since crawl)

- FEAT-0068/0069/0070, BUG-0292/0293, funding-percent finding, and native close-all / flash-close / Safe-Modify wiring landed after the crawl — see `INTEGRATION_STATUS.md` (reviewed 2026-09-05).

## 2026-06-15

### WebSocket Connection Limits

WebSocket-Connection-Rate-Limit-Dokumentation unter [WebSocket Preparing for
Access](08_websocket.md) hinzugefügt.

- Der WebSocket-Server akzeptiert maximal **5 Nachrichten pro Sekunde**
- Nachrichten umfassen PING-Frames, PONG-Frames und JSON-formatierte
  Nachrichten (z.B. Subscribe-/Unsubscribe-Requests)
- Überschreitet die Nachrichtenrate dieses Limit, wird die Verbindung
  getrennt
- IPs, die wiederholt getrennt werden, können vom Server blockiert werden
