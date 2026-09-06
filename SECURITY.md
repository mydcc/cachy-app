# Security Policy

Cachy is a local-first app: journal, settings, exchange API keys, presets and
private notes stay in the browser (`localStorage`, encrypted at rest) and never
leave the device — see `docs/adr/0001-local-first-boundary.md`. The bundled
server only proxies exchange and AI requests and mints anonymous,
self-issued client tokens (see `docs/adr/0002-api-authentication-fails-closed.md`).

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.6.x (current beta line) | :white_check_mark: |
| < 1.6 | :x: |

Security fixes ship on the current `1.6.x` beta line via `develop` and are
released with semantic-release. Older lines are not patched — please upgrade.

## Reporting a Vulnerability

**Do not open a public issue for a suspected vulnerability.**

- Use GitHub's **private vulnerability reporting** on this repository
  (Security tab → Report a vulnerability), or contact the maintainers through
  the channel listed on the repository profile.
- Include: affected version/commit, steps to reproduce, impact assessment
  (especially anything touching the Local-First boundary, exchange request
  signing, or the client-token model), and optionally a suggested fix.
- Expect an initial acknowledgement within 72 hours. Accepted reports are
  fixed on `develop`, covered by a regression test where possible, and
  credited in the release notes unless you prefer to stay anonymous.
- Reports about `.env.example`, deployment headers (`server-headers.js`), or
  reverse-proxy configuration are welcome — misconfigured `ADDRESS_HEADER` /
  `XFF_DEPTH` directly affects rate-limit correctness.
