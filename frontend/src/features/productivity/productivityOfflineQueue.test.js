import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProductivityOfflineQueue, PRODUCTIVITY_QUEUE_KEY } from './productivityOfflineQueue.js';

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

describe('productivity offline queue', () => {
  it('stores the standard pending event shape using the productivity key', () => {
    const storage = makeStorage();
    const repository = createProductivityOfflineQueue({
      storage,
      now: () => new Date('2026-11-24T12:00:00Z'),
      createId: () => 'event-1',
    });

    repository.enqueue({ kind: 'weighing' });
    const [item] = repository.list();

    assert.equal(PRODUCTIVITY_QUEUE_KEY, 'bovinotech_offline_productivity_queue');
    assert.deepEqual(item, {
      client_event_id: 'event-1',
      timestamp_utc: '2026-11-24T12:00:00.000Z',
      status: 'pending',
      payload: { kind: 'weighing' },
    });
  });

  it('does not add duplicate client event ids and clears synchronized items', async () => {
    const storage = makeStorage();
    const repository = createProductivityOfflineQueue({ storage });
    repository.enqueue({ id: 1 }, 'event-1');
    repository.enqueue({ id: 2 }, 'event-1');
    let sent = 0;

    await repository.synchronize(async () => { sent += 1; });

    assert.equal(sent, 1);
    assert.deepEqual(repository.list(), []);
  });

  it('retains failed uploads with a failed status', async () => {
    const repository = createProductivityOfflineQueue({ storage: makeStorage() });
    repository.enqueue({ id: 1 }, 'event-1');

    await repository.synchronize(async () => { throw new Error('offline'); });

    assert.equal(repository.list()[0].status, 'failed');
  });

  it('surfaces corrupt queue data rather than silently treating it as empty', () => {
    const storage = {
      getItem: () => '{invalid-json',
      setItem: () => {},
    };
    const repository = createProductivityOfflineQueue({ storage });

    assert.throws(() => repository.list(), SyntaxError);
  });
});
