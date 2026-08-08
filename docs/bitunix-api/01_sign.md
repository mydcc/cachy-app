# Signature (Sign)

Quelle: https://www.bitunix.com/api-docs/futures/common/sign.html

## Restful API Signature – Public Parameters

### Headers

| Name        | Type   | Mandatory | Description                        |
|-------------|--------|-----------|-------------------------------------|
| `api-key`   | string | Y         | Beantragter API-Key                 |
| `nonce`     | string | Y         | Zufälliger String, 32-Bit           |
| `timestamp` | string | Y         | Aktueller Timestamp, Millisekunden  |
| `sign`      | string | Y         | Signatur-String                     |

### Signatur-Schritte

1. Alle `queryParams` werden aufsteigend nach ASCII-Wert des Keys sortiert.
   Beispiel: `String queryParams = "id1uid200"`
2. Parameter im Body werden zu einem String komprimiert – **alle Leerzeichen
   entfernen**. Beispiel:
   `String body = {"uid":"2899","arr":[{"id":1,"name":"maple"},{"id":2,"name":"lily"}]}`
   > **Achtung**: Das Request-Body-Format muss exakt mit dem Signatur-String
   > übereinstimmen.
3. Signatur – zweifache Verschlüsselung nötig:
   - `digest = SHA256(nonce + timestamp + api-key + queryParams + body)`
   - `sign = SHA256(digest + secretKey)`
   - Hinweis: `secretKey` wird zusammen mit dem API-Key beim Beantragen
     ausgegeben. Sicher aufbewahren, nicht weitergeben.

### Signatur-Beispiel (Go)

```go
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

func main() {
	nonce := "123456"
	timestamp := "20241120123045"
	apiKey := "yourApiKey"
	secretKey := "yourSecretKey"
	queryParams := "id1uid200"
	body := "{\"uid\":\"2899\",\"arr\":[{\"id\":1,\"name\":\"maple\"},{\"id\":2,\"name\":\"lily\"}]}"

	digestInput := nonce + timestamp + apiKey + queryParams + body

	digest := sha256Hex(digestInput)

	signInput := digest + secretKey
	sign := sha256Hex(signInput)

	fmt.Println("Digest:", digest)
	fmt.Println("Sign:", sign)
}

func sha256Hex(input string) string {
	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:])
}
```

### Signatur-Beispiel (Python)

```python
import hashlib

def sha256_hex(input_string):
    return hashlib.sha256(input_string.encode('utf-8')).hexdigest()

def main():
    nonce = "123456"
    timestamp = "20241120123045"
    api_key = "yourApiKey"
    secret_key = "yourSecretKey"
    query_params = "id1uid200"
    body = '{"uid":"2899","arr":[{"id":1,"name":"maple"},{"id":2,"name":"lily"}]}'

    digest_input = nonce + timestamp + api_key + query_params + body

    digest = sha256_hex(digest_input)

    sign_input = digest + secret_key
    sign = sha256_hex(sign_input)

    print("Digest:", digest)
    print("Sign:", sign)

if __name__ == "__main__":
    main()
```

## WebSocket API Signature Parameters

WebSocket-API-Requests erfordern Authentifizierung. Folgende Felder müssen in
allen Request-Parametern (`params`) enthalten sein:

| Name        | Type   | Mandatory | Description       |
|-------------|--------|-----------|--------------------|
| `apiKey`    | string | Y         | API Key            |
| `timestamp` | string | Y         | Timestamp          |
| `nonce`     | string | Y         | Zufälliger String  |
| `sign`      | string | Y         | Signatur-String    |

### Signatur-Schritte (WebSocket)

1. Alle Felder in `params` außer `sign` aufsteigend nach ASCII-Wert des Keys
   sortieren, **alle Leerzeichen entfernen**. Beispiel:
   `String params = "apiKey9a25209b66004da404d9ddcb48d1e11fnonce123456symbolBTCtimestamp1724285700000"`
2. Signatur – zweifache Verschlüsselung nötig:
   - `digest = SHA256(nonce + timestamp + apiKey + params)`
   - `sign = SHA256(digest + secretKey)`
   - Hinweis: `secretKey` wird zusammen mit dem `apiKey` beim Beantragen
     ausgegeben. Sicher aufbewahren, nicht weitergeben.
