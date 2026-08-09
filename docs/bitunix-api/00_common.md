# API Introduction

Quelle: https://www.bitunix.com/api-docs/futures/common/introduction.html

## Übersicht

Willkommen zur Bitunix API-Dokumentation. Diese OpenAPI-Dokumentation bietet
eine umfassende Anleitung zur Integration mit dem Bitunix-System: Endpunkte,
Request-/Response-Formate, Authentifizierungsanforderungen und
Nutzungsbeispiele.

### OpenAPI Demo
Offizielles Demo (API-Key/Secret eintragen zum Testen):
https://github.com/BitunixOfficial/open-api

### Vorbereitung für den Zugriff

1. Auf https://www.bitunix.com/login einloggen.
2. API-Key unter https://www.bitunix.com/account/apiManagement erstellen.
3. Nach Erstellung merken:
   - **APIKey**: Identität für API-Transaktionen (zufällig generiert)
   - **SecretKey**: privater Schlüssel, zufällig generiert, für Signaturerstellung

> ⚠️ **Risiko-Hinweis**: Diese beiden Keys sind sicherheitskritisch für dein
> Konto. Niemals weitergeben. Bei Verdacht auf Leak sofort den API-Key löschen.

## Interface-Typen

### Public Interface
Kann für Konfigurationsinformationen und Marktdaten verwendet werden.
Public-Requests benötigen **keine** Authentifizierung.

### Private Interface
Wird für Order- und Account-Management verwendet. Jeder private Request muss
signiert werden (siehe `01_sign.md`), Authentifizierung via APIKey ist
erforderlich.

## API-Domain

| Domain Name    | REST API                   |
|----------------|-----------------------------|
| Primary Domain | `https://fapi.bitunix.com` |

## API-Validierung

Der Header jedes REST-Requests muss folgende Keys enthalten:

- `api-key`: API-Key des Requests
- `nonce`: Zufälliger String, 32-Bit, vom Aufrufer generiert
- `timestamp`: Aktueller Timestamp in Millisekunden
- `sign`: Signatur-String (siehe `01_sign.md`)
- `Content-Type`: einheitlich `application/json`

## Interaktions-Request

Alle Requests basieren auf HTTPS. Der `Content-Type` im POST-Request-Header
muss `application/json` sein.

### Ablauf
1. **Request-Parameter**: Parameter gemäß Interface-Spezifikation kapseln.
2. **Request absenden**: gekapselte Parameter via GET/POST an Server senden.
3. **Server-Antwort**: Der Server prüft zunächst die Parameter-Sicherheit und
   gibt danach die Antwortdaten im JSON-Format zurück.
4. **Datenverarbeitung**: Antwortdaten vom Server verarbeiten.

### Erfolg
HTTP-Statuscode `200` zeigt eine erfolgreiche Antwort an (kann Inhalt
enthalten).

### Allgemeine Fehlercodes (HTTP)
- `400 Bad Request` – Ungültiges Request-Format
- `403 Forbidden` – Kein Zugriff auf die angeforderte Ressource
- `404 Not Found` – Keine Anfrage gefunden
- `500 Internal Server Error` – Interner Serverfehler; Body enthält ggf.
  Fehlerbeschreibung

Siehe `09_error_codes.md` für die vollständige Liste der Business-Error-Codes.

## Standardisierte Spezifikation

### Timestamp
Der Timestamp in der Request-Signatur ist in Millisekunden angegeben und
bezieht sich einheitlich auf UTC-Zeit.

### Request-Formate
Aktuell gibt es nur zwei Request-Formate: GET und POST.

- **GET**: Parameter werden via `queryString` im Pfad übertragen.
- **POST**: Parameter werden im Body als JSON übertragen.
