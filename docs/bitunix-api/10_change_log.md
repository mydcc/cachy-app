# Change Log

Quelle: https://www.bitunix.com/api-docs/futures/log/change_log.html

Diese Seite dokumentiert Updates an der OpenAPI-Dokumentation.

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
