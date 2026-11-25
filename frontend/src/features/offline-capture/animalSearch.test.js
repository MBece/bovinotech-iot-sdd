import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchAnimals, SUGGESTION_LIMIT } from './animalSearch.js';

const catalog = [
  { din: 'DIN-DEMO-000001', name: 'Luna' },
  { din: 'DIN-DEMO-000002', name: 'Canela' },
  { din: 'DIN-DEMO-000003', name: 'Ángela' },
  { din: 'DIN-DEMO-000004', name: 'Media Luna' },
];

test('matches by din ignoring case', () => {
  assert.deepEqual(searchAnimals(catalog, 'din-demo-000002').map((a) => a.name), ['Canela']);
});

test('matches by name ignoring case and accents', () => {
  assert.deepEqual(searchAnimals(catalog, 'angela').map((a) => a.din), ['DIN-DEMO-000003']);
  assert.deepEqual(searchAnimals(catalog, 'ÁNGEL').map((a) => a.din), ['DIN-DEMO-000003']);
});

test('matches at the start come first', () => {
  assert.deepEqual(searchAnimals(catalog, 'luna').map((a) => a.name), ['Luna', 'Media Luna']);
});

test('returns at most 10 suggestions', () => {
  const many = Array.from({ length: 30 }, (_, index) => ({
    din: `DIN-DEMO-${String(index).padStart(6, '0')}`,
    name: `Vaca ${index}`,
  }));

  assert.equal(SUGGESTION_LIMIT, 10);
  assert.equal(searchAnimals(many, 'vaca').length, 10);
});

test('blank query returns no suggestions', () => {
  assert.deepEqual(searchAnimals(catalog, '   '), []);
});

test('never auto-selects: a single exact match is still only a suggestion list', () => {
  const result = searchAnimals(catalog, 'DIN-DEMO-000001');

  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
});

test('searches 5,000 animals in under 50 ms (SC-001)', () => {
  const big = Array.from({ length: 5000 }, (_, index) => ({
    din: `DIN-DEMO-${String(index).padStart(6, '0')}`,
    name: `Animal número ${index}`,
  }));
  searchAnimals(big, 'warm-up');

  const started = performance.now();
  searchAnimals(big, 'numero 49');
  const elapsed = performance.now() - started;

  assert.ok(elapsed < 50, `took ${elapsed} ms`);
});
