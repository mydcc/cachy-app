## 2026-05-18 - [Secure Sync Endpoint]
**Vulnerability:** Duplicated signature generation logic and missing input validation in `src/routes/api/sync/+server.ts` allowed potentially bypassing security controls and accepting invalid inputs.
**Learning:** Always centralize critical security logic (like crypto signatures) to prevent drift and ensure consistent validation. Manual implementations are prone to errors and omissions.
**Prevention:** Use Zod for strict schema validation on all API inputs. Reuse validated helper functions for sensitive operations instead of reimplementing them.
