import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ownerScope, sessionOwner } from './genealogySession.js';

const b64url = (value) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const tokenFor = (claims) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.signature`;

describe('genealogy session owner (H-01, H-03)', () => {
  it('reads user and active farm from the session token', () => {
    const token = tokenFor({ sub: 'operario@bovinotech.co', role: 'OPERARIO', farm_id: 1, exp: 1 });
    assert.deepEqual(sessionOwner(token), { userId: 'operario@bovinotech.co', farmId: 1 });
  });

  it('decodes non-ASCII claims (base64url, UTF-8)', () => {
    const token = tokenFor({ sub: 'veterinaría@bovinotech.co', farm_id: 2 });
    assert.deepEqual(sessionOwner(token), { userId: 'veterinaría@bovinotech.co', farmId: 2 });
  });

  it('returns null without user or active farm, or with a malformed token', () => {
    assert.equal(sessionOwner(tokenFor({ sub: 'x@y.co', farm_id: null })), null);
    assert.equal(sessionOwner(tokenFor({ farm_id: 1 })), null);
    assert.equal(sessionOwner('not-a-jwt'), null);
    assert.equal(sessionOwner('a.%%%.c'), null);
    assert.equal(sessionOwner(undefined), null);
  });

  it('builds a stable scope per user and farm', () => {
    assert.equal(ownerScope({ userId: 'a@b.co', farmId: 1 }), 'a@b.co|1');
    assert.notEqual(ownerScope({ userId: 'a@b.co', farmId: 1 }), ownerScope({ userId: 'a@b.co', farmId: 2 }));
    assert.equal(ownerScope(null), null);
  });
});
