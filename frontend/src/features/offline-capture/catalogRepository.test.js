import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from './memoryStore.js';
import { createCatalogRepository } from './catalogRepository.js';
import { createCatalogService } from './catalogService.js';

const animals = (prefix, count) =>
  Array.from({ length: count }, (_, index) => ({
    din: `DIN-DEMO-${prefix}${String(index).padStart(5, '0')}`,
    name: `Animal ${prefix}${index}`,
  }));

test('replacing a farm removes only that farm animals', async () => {
  const repository = createCatalogRepository(createMemoryStore());
  await repository.replaceFarm(1, animals('1', 3), '2026-11-21T10:00:00.000Z');
  await repository.replaceFarm(2, animals('2', 2), '2026-11-21T10:00:00.000Z');

  await repository.replaceFarm(1, animals('9', 1), '2026-11-21T11:00:00.000Z');

  const farmOne = await repository.listByFarm(1);
  assert.deepEqual(farmOne.map((animal) => animal.din), ['DIN-DEMO-900000']);
  assert.equal(farmOne[0].downloadedAt, '2026-11-21T11:00:00.000Z');
  assert.equal((await repository.listByFarm(2)).length, 2);
});

test('findByDin normalizes case and spaces', async () => {
  const repository = createCatalogRepository(createMemoryStore());
  await repository.replaceFarm(1, [{ din: 'DIN-DEMO-000001', name: 'Luna' }], '2026-11-21T10:00:00.000Z');

  assert.equal((await repository.findByDin(1, ' din-demo-000001 ')).name, 'Luna');
  assert.equal(await repository.findByDin(2, 'DIN-DEMO-000001'), null);
});

test('catalog service stores the downloaded farm', async () => {
  const repository = createCatalogRepository(createMemoryStore());
  const fetchImpl = async (url, options) => {
    assert.match(url, /\/offline-capture\/catalog$/);
    assert.equal(options.headers.Authorization, 'Bearer token-1');
    return {
      ok: true,
      json: async () => ({ farmId: 1, generatedAt: 'x', animals: [{ din: 'DIN-DEMO-000001', name: 'Luna' }] }),
    };
  };
  const service = createCatalogService({ repository, fetchImpl, apiUrl: 'http://api', now: () => new Date('2026-11-21T10:00:00Z') });

  const result = await service.refresh('token-1', 1);

  assert.deepEqual(result, { updated: true, count: 1 });
  assert.equal((await repository.listByFarm(1))[0].downloadedAt, '2026-11-21T10:00:00.000Z');
});

test('catalog service keeps the previous copy when the network fails', async () => {
  const repository = createCatalogRepository(createMemoryStore());
  await repository.replaceFarm(1, [{ din: 'DIN-DEMO-000001', name: 'Luna' }], '2026-11-20T10:00:00.000Z');
  const service = createCatalogService({
    repository,
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
    apiUrl: 'http://api',
  });

  const result = await service.refresh('token-1', 1);

  assert.equal(result.updated, false);
  assert.equal((await repository.listByFarm(1)).length, 1);
});

test('catalog service ignores a response for another farm', async () => {
  const repository = createCatalogRepository(createMemoryStore());
  const service = createCatalogService({
    repository,
    fetchImpl: async () => ({ ok: true, json: async () => ({ farmId: 2, animals: animals('2', 1) }) }),
    apiUrl: 'http://api',
  });

  const result = await service.refresh('token-1', 1);

  assert.equal(result.updated, false);
  assert.equal((await repository.listByFarm(2)).length, 0);
});
