// Session owner (user + active farm) read from the access token claims
// ("sub", "farm_id"). It only partitions local data on the device; the server
// remains the authority and verifies the signature on every request.
const decodeSegment = (segment) => {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(globalThis.atob(padded), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

export const sessionOwner = (token) => {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = decodeSegment(parts[1]);
    const userId = typeof claims?.sub === 'string' && claims.sub ? claims.sub : null;
    const farmId = claims?.farm_id ?? null;
    if (!userId || farmId === null) return null;
    return { userId, farmId };
  } catch {
    return null;
  }
};

export const ownerScope = (owner) => (owner ? `${owner.userId}|${owner.farmId}` : null);

export const sameOwner = (a, b) =>
  Boolean(a && b) && a.userId === b.userId && String(a.farmId) === String(b.farmId);
