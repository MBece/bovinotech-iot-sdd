import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GENEALOGY_CACHE_KEY, createGenealogyCache } from './genealogyCache.js';

const makeStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const fixedNow = () => new Date('2026-11-24T12:00:00Z');

describe('genealogy view cache partitioned by user and farm (H-03)', () => {
  it('returns what the same user and farm cached', () => {
    const storage = makeStorage();
    const cache = createGenealogyCache({ storage, scope: 'vet@b.co|1', now: fixedNow });
    cache.write('tree', 'DIN-DEMO-000101', { name: 'Aurora' });
    assert.deepEqual(cache.read('tree', 'DIN-DEMO-000101'), {
      data: { name: 'Aurora' },
      savedAt: '2026-11-24T12:00:00.000Z',
    });
  });

  it('never returns data cached by another user or farm', () => {
    const storage = makeStorage();
    createGenealogyCache({ storage, scope: 'vet@b.co|1', now: fixedNow }).write('tree', 'X', { a: 1 });
    const otherFarm = createGenealogyCache({ storage, scope: 'vet@b.co|2' });
    const otherUser = createGenealogyCache({ storage, scope: 'op@b.co|1' });
    assert.equal(otherFarm.read('tree', 'X'), null);
    assert.equal(otherUser.read('tree', 'X'), null);
  });

  it('claiming the cache for another session purges the previous session entries', () => {
    const storage = makeStorage();
    createGenealogyCache({ storage, scope: 'vet@b.co|1' }).write('animals', 'all', [{ din: 'X' }]);
    createGenealogyCache({ storage, scope: 'op@b.co|2' }).claim();
    assert.equal(storage.values.has(GENEALOGY_CACHE_KEY), false);
    assert.equal(createGenealogyCache({ storage, scope: 'vet@b.co|1' }).read('animals', 'all'), null);
  });

  it('removes the legacy unpartitioned caches when claimed', () => {
    const storage = makeStorage({
      bovinotech_genealogy_animals_cache: '[{"din":"X"}]',
      bovinotech_genealogy_view_cache: '{"tree:X":{}}',
    });
    createGenealogyCache({ storage, scope: 'vet@b.co|1' }).claim();
    assert.equal(storage.values.has('bovinotech_genealogy_animals_cache'), false);
    assert.equal(storage.values.has('bovinotech_genealogy_view_cache'), false);
  });

  it('does not cache anything without a session scope', () => {
    const storage = makeStorage();
    const cache = createGenealogyCache({ storage, scope: null });
    cache.write('tree', 'X', { a: 1 });
    assert.equal(cache.read('tree', 'X'), null);
    assert.equal(storage.values.size, 0);
  });

  it('tolerates corrupt JSON and unavailable storage (H-05)', () => {
    const corrupt = makeStorage({ [GENEALOGY_CACHE_KEY]: '{truncated' });
    const cache = createGenealogyCache({ storage: corrupt, scope: 'vet@b.co|1' });
    assert.equal(cache.read('tree', 'X'), null);
    cache.write('tree', 'X', { ok: true });
    assert.deepEqual(cache.read('tree', 'X').data, { ok: true });

    const broken = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceeded'); },
      removeItem: () => { throw new Error('SecurityError'); },
    };
    const safe = createGenealogyCache({ storage: broken, scope: 'vet@b.co|1' });
    assert.doesNotThrow(() => safe.claim());
    assert.doesNotThrow(() => safe.write('tree', 'X', {}));
    assert.equal(safe.read('tree', 'X'), null);
  });
});
