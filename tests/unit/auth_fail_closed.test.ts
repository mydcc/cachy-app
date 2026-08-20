// @vitest-environment node
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

import { describe, it, expect, beforeEach } from 'vitest';
import { checkClientToken, issueToken, _resetForTests } from '../../src/lib/server/clientToken';

// BUG-0052: checkClientToken replaced checkAppAuth's single shared
// APP_ACCESS_TOKEN with self-issued, per-client tokens. This test used to
// assert that a missing APP_ACCESS_TOKEN fails closed; the equivalent
// guarantee now is that a request with no token — or one this server never
// issued — is denied, never let through. See the ADR-0002 amendment.

describe('checkClientToken fail-closed validation', () => {
  beforeEach(() => {
    _resetForTests();
  });

  it('should DENY access when no client token is provided', () => {
    const request = new Request('http://localhost/api/test', {
      headers: {},
    });

    const result = checkClientToken(request, '127.0.0.1');

    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it('should DENY access when the token was not issued by this server', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'x-app-access-token': 'not-a-token-we-ever-issued' },
    });

    const result = checkClientToken(request, '127.0.0.1');

    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it('should ALLOW access with a token this server issued', () => {
    const token = issueToken();
    const request = new Request('http://localhost/api/test', {
      headers: { 'x-app-access-token': token },
    });

    const result = checkClientToken(request, '127.0.0.1');

    expect(result).toBeNull();
  });
});
