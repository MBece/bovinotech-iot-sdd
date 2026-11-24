import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from './syncStore.js';
import { createSyncStateRepository, RUNS_KEPT } from './syncStateRepository.js';

const state = (id, overrides = {}) => ({
  client_event_id: id,
  author_email: 'operario@bovinotech.co',
  timestamp_utc: '2026-11-24T10:00:00.000Z',
  status: 'pending',
  failure_kind: null,
  error_code: null,
  error_message: null,
  attempts: 0,
  next_attempt_at: null,
  confirmed_at: null,
  server_received_at: null,
  requires_timestamp_review: false,
  ...overrides,
});

test('saveStates writes several states and getStatusMap indexes them by id', async () => {
  const repository = createSyncStateRepository(createMemorySyncStore());

  await repository.saveStates([state('a'), state('b', { status: 'synced' })]);
  const map = await repository.getStatusMap();

  assert.ok(map instanceof Map);
  assert.equal(map.size, 2);
  assert.equal(map.get('b').status, 'synced');
});

test('saving a state again replaces the previous state of that event', async () => {
  const repository = createSyncStateRepository(createMemorySyncStore());
  await repository.saveStates([state('a')]);

  await repository.saveStates([state('a', { status: 'syncing' })]);

  assert.equal((await repository.getStatusMap()).get('a').status, 'syncing');
});

test('only the last 20 runs are kept, newest last', async () => {
  const repository = createSyncStateRepository(createMemorySyncStore());

  for (let index = 0; index < 25; index += 1) {
    await repository.recordRun({ started_at: `run-${index}`, trigger: 'timer' });
  }
  const runs = await repository.listRuns();

  assert.equal(RUNS_KEPT, 20);
  assert.equal(runs.length, 20);
  assert.equal(runs[0].started_at, 'run-5');
  assert.equal(runs.at(-1).started_at, 'run-24');
});

test('the repository cannot delete sync states nor touch HU-02 events', () => {
  const repository = createSyncStateRepository(createMemorySyncStore());

  assert.deepEqual(Object.keys(repository).sort(), ['getStatusMap', 'listRuns', 'recordRun', 'saveStates']);
});
