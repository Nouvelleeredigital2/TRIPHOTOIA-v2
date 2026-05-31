import { describe, it, expect } from 'vitest';
import { isAuthError, SESSION_EXPIRED_MESSAGE } from '../../lib/auth-errors';

describe('isAuthError (A-50)', () => {
  it('detects 401 status', () => {
    expect(isAuthError({ status: 401 })).toBe(true);
  });

  it('detects PostgREST JWT-expired codes', () => {
    expect(isAuthError({ code: 'PGRST301' })).toBe(true);
    expect(isAuthError({ code: 'PGRST302' })).toBe(true);
  });

  it('detects JWT / session messages', () => {
    expect(isAuthError(new Error('JWT expired'))).toBe(true);
    expect(isAuthError(new Error('Token is expired'))).toBe(true);
    expect(isAuthError(new Error('not authenticated'))).toBe(true);
    expect(isAuthError(new Error('Unauthorized'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isAuthError(new Error('network timeout'))).toBe(false);
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
    expect(isAuthError({ status: 500 })).toBe(false);
  });

  it('exposes a user-facing message', () => {
    expect(SESSION_EXPIRED_MESSAGE).toMatch(/session expir/i);
  });
});
