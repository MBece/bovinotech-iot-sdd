import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRetryDelay, MAX_DELAY_MS, BASE_DELAY_MS, baseDelay } from './retryPolicy.js';

test('without jitter the delay doubles from 2 s up to the 15 min cap', () => {
  const delays = Array.from({ length: 12 }, (_, index) => computeRetryDelay(index + 1, () => 0.5));

  assert.equal(BASE_DELAY_MS, 2_000);
  assert.equal(MAX_DELAY_MS, 15 * 60_000);
  assert.deepEqual(delays.slice(0, 5), [2_000, 4_000, 8_000, 16_000, 32_000]);
  assert.equal(delays.at(-1), MAX_DELAY_MS);
});

test('the lower bound grows strictly until the cap', () => {
  let previous = 0;
  for (let attempt = 1; baseDelay(attempt) < MAX_DELAY_MS; attempt += 1) {
    const lowest = computeRetryDelay(attempt, () => 0);
    assert.ok(lowest > previous, `attempt ${attempt}`);
    previous = lowest;
  }
});

test('jitter stays within ±50 % of the base', () => {
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      const delay = computeRetryDelay(attempt, () => value);
      assert.ok(delay >= baseDelay(attempt) * 0.5, `${attempt}/${value}`);
      assert.ok(delay <= baseDelay(attempt) * 1.5, `${attempt}/${value}`);
    }
  }
});

/** Deterministic PRNG (mulberry32) so the simulation is reproducible. */
const seeded = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('100 devices reconnecting together never put more than 10 % of retries in one second (SC-007)', () => {
  const retriesPerSecond = new Map();
  let total = 0;
  for (let device = 0; device < 100; device += 1) {
    const random = seeded(device + 1);
    let at = 0;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      at += computeRetryDelay(attempt, random);
      const second = Math.floor(at / 1000);
      retriesPerSecond.set(second, (retriesPerSecond.get(second) ?? 0) + 1);
      total += 1;
    }
  }

  const busiest = Math.max(...retriesPerSecond.values());
  assert.ok(busiest / total <= 0.1, `busiest second has ${busiest} of ${total}`);
});
