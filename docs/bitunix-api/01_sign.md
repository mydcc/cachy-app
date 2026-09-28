# Signature (Sign)

Source: https://www.bitunix.com/api-docs/futures/common/sign.html

## Restful API Signature – Public Parameters

### Headers

| Name        | Type   | Mandatory | Description                        |
|-------------|--------|-----------|-------------------------------------|
| `api-key`   | string | Y         | Requested API key                  |
| `nonce`     | string | Y         | 32-char hex string (128-bit random)           |
| `timestamp` | string | Y         | Current timestamp, milliseconds  |
| `sign`      | string | Y         | Signature string                    |

### Signature steps

1. All `queryParams` are sorted ascending by the ASCII value of the key.
   Example: `String queryParams = "id1uid200"`
2. Body parameters are compressed into a string – **remove all spaces**. Example:
   `String body = {"uid":"2899","arr":[{"id":1,"name":"maple"},{"id":2,"name":"lily"}]}`
   > **Caution**: The request body format must match the signature string
   > exactly.
3. Signature – double encryption required:
   - `digest = SHA256(nonce + timestamp + api-key + queryParams + body)`
   - `sign = SHA256(digest + secretKey)`
   - Note: `secretKey` is issued together with the API key when applying. Store
     it securely, do not share it.

### Signature example (Go)

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

### Signature example (Python)

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

> Always sign the exact serialized body string sent on the wire; pretty-printing invalidates the signature.

## WebSocket API Signature Parameters

WebSocket API requests require authentication. The following fields must be
included in all request parameters (`params`):

| Name        | Type   | Mandatory | Description       |
|-------------|--------|-----------|--------------------|
| `apiKey`    | string | Y         | API key            |
| `timestamp` | string | Y         | Timestamp          |
| `nonce`     | string | Y         | Random string      |
| `sign`      | string | Y         | Signature string    |

### Signature steps (WebSocket)

The following applies to `login` (no additional params). Per-channel subscribe frames are unauthenticated.

1. Sort all fields in `params` except `sign` ascending by the ASCII value of the
   key, **remove all spaces**. Example:
   `String params = "apiKey9a25209b66004da404d9ddcb48d1e11fnonce123456symbolBTCtimestamp1724285700000"`
2. Signature – double encryption required:
   - `digest = SHA256(nonce + timestamp + apiKey + params)`
   - `sign = SHA256(digest + secretKey)`
   - Note: `secretKey` is issued together with the `apiKey` when applying. Store
     it securely, do not share it.
