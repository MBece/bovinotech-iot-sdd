import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GENEALOGY_CORRUPT_SUFFIX, createGenealogyOfflineQueue } from './genealogyOfflineQueue.js';
import { GENEALOGY_QUEUE_KEY, GENEALOGY_REJECTED_KEY } from './genealogyConstants.js';

const makeStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

const OPERATOR = { userId: 'operario@bovinotech.co', farmId: 1 };
const VET = { userId: 'vet@bovinotech.co', farmId: 1 };
const OPERATOR_FARM_2 = { userId: 'operario@bovinotech.co', farmId: 2 };

const httpError = (status, code, message) =>
  Object.assign(new Error(message), { status, code });

const linkPayload = (id) => ({ kind: 'LINK', body: { clientEventId: id } });

const queueFor = (owner, storage, extra = {}) =>
  createGenealogyOfflineQueue({ storage, owner, ...extra });

describe('genealogy offline queue', () => {
  it('stores the standard Offline Hub shape with the capturing owner in the payload', () => {
    const storage = makeStorage();
    const queue = queueFor(OPERATOR, storage, {
      now: () => new Date('2026-11-24T12:00:00Z'),
      createId: () => 'event-1',
    });

    queue.enqueue(linkPayload('event-1'));

    assert.equal(GENEALOGY_QUEUE_KEY, 'bovinotech_offline_genealogy_queue');
    assert.deepEqual(JSON.parse(storage.values.get(GENEALOGY_QUEUE_KEY)), [
      {
        client_event_id: 'event-1',
        timestamp_utc: '2026-11-24T12:00:00.000Z',
        status: 'pending',
        payload: { ...linkPayload('event-1'), owner: OPERATOR },
      },
    ]);
  });

  it('refuses to enqueue without a session owner', () => {
    const queue = queueFor(null, makeStorage());
    assert.throws(() => queue.enqueue(linkPayload('a'), 'a'), /sesión/i);
  });

  it('deduplicates by client_event_id and counts pending items', () => {
    const queue = queueFor(OPERATOR, makeStorage());
    queue.enqueue(linkPayload('a'), 'a');
    queue.enqueue(linkPayload('a'), 'a');
    queue.enqueue(linkPayload('b'), 'b');

    assert.equal(queue.list().length, 2);
    assert.equal(queue.pendingCount(), 2);
  });

  it('synchronizes in FIFO order and removes 201/200 responses', async () => {
    const queue = queueFor(OPERATOR, makeStorage());
    queue.enqueue({ kind: 'ANIMAL', body: {} }, 'first');
    queue.enqueue(linkPayload('second'), 'second');
    const sent = [];

    await queue.synchronize(async (payload) => {
      sent.push(payload.kind);
      return { syncStatus: sent.length === 1 ? 'SYNCED' : 'DUPLICADO' };
    });

    assert.deepEqual(sent, ['ANIMAL', 'LINK']);
    assert.deepEqual(queue.list(), []);
    assert.equal(queue.pendingCount(), 0);
  });

  it('keeps network errors and 5xx as failed and retryable', async () => {
    const queue = queueFor(OPERATOR, makeStorage());
    queue.enqueue(linkPayload('a'), 'a');
    queue.enqueue(linkPayload('b'), 'b');

    await queue.synchronize(async () => { throw new TypeError('Failed to fetch'); });
    assert.equal(queue.list()[0].status, 'failed');
    assert.equal(queue.list().length, 2);

    await queue.synchronize(async () => { throw httpError(503, undefined, 'caído'); });
    assert.equal(queue.list()[0].status, 'failed');
    assert.equal(queue.pendingCount(), 2);

    await queue.synchronize(async () => ({ syncStatus: 'SYNCED' }));
    assert.deepEqual(queue.list(), []);
  });

  it('moves 4xx business rejections to the rejected list with code and message', async () => {
    const storage = makeStorage();
    const queue = queueFor(OPERATOR, storage);
    queue.enqueue(linkPayload('bad'), 'bad');
    queue.enqueue(linkPayload('good'), 'good');

    await queue.synchronize(async (payload) => {
      if (payload.body.clientEventId === 'bad') {
        throw httpError(409, 'PARENT_ALREADY_REGISTERED', 'Ya existe un padre vigente.');
      }
      return { syncStatus: 'SYNCED' };
    });

    assert.deepEqual(queue.list(), []);
    const [rejected] = queue.listRejected();
    assert.equal(rejected.client_event_id, 'bad');
    assert.deepEqual(rejected.payload, { ...linkPayload('bad'), owner: OPERATOR });
    assert.deepEqual(rejected.error, {
      code: 'PARENT_ALREADY_REGISTERED',
      message: 'Ya existe un padre vigente.',
    });
    assert.ok(rejected.timestamp_utc);
    assert.equal(GENEALOGY_REJECTED_KEY, 'bovinotech_offline_genealogy_rejected');
    assert.equal(JSON.parse(storage.values.get(GENEALOGY_REJECTED_KEY)).length, 1);
  });
});

describe('genealogy offline queue - ownership (H-01)', () => {
  it('never sends entries captured by another user with the current session', async () => {
    const storage = makeStorage();
    queueFor(OPERATOR, storage).enqueue(linkPayload('op-link'), 'op-link');
    const vetQueue = queueFor(VET, storage);
    let sent = 0;

    const result = await vetQueue.synchronize(async () => { sent += 1; });

    assert.equal(sent, 0);
    assert.equal(result.synced, 0);
    assert.equal(vetQueue.pendingCount(), 0);
    assert.equal(vetQueue.foreignCount(), 1);
    assert.equal(queueFor(OPERATOR, storage).pendingCount(), 1);
    assert.equal(queueFor(OPERATOR, storage).list()[0].status, 'pending');
  });

  it('never sends entries captured in another farm by the same user', async () => {
    const storage = makeStorage();
    queueFor(OPERATOR, storage).enqueue(linkPayload('farm-1'), 'farm-1');
    let sent = 0;

    await queueFor(OPERATOR_FARM_2, storage).synchronize(async () => { sent += 1; });

    assert.equal(sent, 0);
    assert.equal(queueFor(OPERATOR, storage).pendingCount(), 1);
  });

  it('sends only its own entries in FIFO order and keeps the foreign ones untouched', async () => {
    const storage = makeStorage();
    queueFor(OPERATOR, storage).enqueue(linkPayload('op-1'), 'op-1');
    queueFor(VET, storage).enqueue(linkPayload('vet-1'), 'vet-1');
    queueFor(OPERATOR, storage).enqueue(linkPayload('op-2'), 'op-2');
    const sent = [];

    await queueFor(OPERATOR, storage).synchronize(async (payload) => {
      sent.push(payload.body.clientEventId);
    });

    assert.deepEqual(sent, ['op-1', 'op-2']);
    const remaining = queueFor(VET, storage).list();
    assert.deepEqual(remaining.map((item) => [item.client_event_id, item.status]), [['vet-1', 'pending']]);
  });

  it('treats legacy entries without owner as foreign (never sent)', async () => {
    const storage = makeStorage({
      [GENEALOGY_QUEUE_KEY]: JSON.stringify([
        { client_event_id: 'old', timestamp_utc: 'x', status: 'pending', payload: linkPayload('old') },
      ]),
    });
    let sent = 0;
    const queue = queueFor(VET, storage);
    await queue.synchronize(async () => { sent += 1; });
    assert.equal(sent, 0);
    assert.equal(queue.foreignCount(), 1);
  });

  it('lists only the rejections of the current owner', async () => {
    const storage = makeStorage();
    const operator = queueFor(OPERATOR, storage);
    operator.enqueue(linkPayload('bad'), 'bad');
    await operator.synchronize(async () => { throw httpError(422, 'GENEALOGY_CYCLE', 'Ciclo.'); });
    assert.equal(operator.listRejected().length, 1);
    assert.equal(queueFor(VET, storage).listRejected().length, 0);
  });
});

describe('genealogy offline queue - auth and transient statuses (H-02)', () => {
  for (const status of [401, 403]) {
    it(`pauses on ${status} keeping the entries pending and not rejected`, async () => {
      const queue = queueFor(OPERATOR, makeStorage());
      queue.enqueue(linkPayload('a'), 'a');
      queue.enqueue(linkPayload('b'), 'b');
      let calls = 0;

      const result = await queue.synchronize(async () => {
        calls += 1;
        throw httpError(status, status === 401 ? undefined : 'ROLE_NOT_ALLOWED', 'No autorizado');
      });

      assert.equal(calls, 1);
      assert.equal(result.paused, 'AUTH');
      assert.deepEqual(queue.list().map((item) => item.status), ['pending', 'pending']);
      assert.deepEqual(queue.listRejected(), []);
    });
  }

  for (const status of [408, 429]) {
    it(`treats ${status} as transient: failed, retryable and not rejected`, async () => {
      const queue = queueFor(OPERATOR, makeStorage());
      queue.enqueue(linkPayload('a'), 'a');

      const result = await queue.synchronize(async () => { throw httpError(status, undefined, 'Más tarde'); });

      assert.equal(result.paused, null);
      assert.equal(queue.list()[0].status, 'failed');
      assert.deepEqual(queue.listRejected(), []);
      await queue.synchronize(async () => ({ syncStatus: 'SYNCED' }));
      assert.deepEqual(queue.list(), []);
    });
  }
});

describe('genealogy offline queue - tolerant reads (H-05)', () => {
  it('sets corrupt queue content aside instead of breaking the view', () => {
    const storage = makeStorage({ [GENEALOGY_QUEUE_KEY]: '{truncated' });
    const queue = queueFor(OPERATOR, storage);

    assert.doesNotThrow(() => queue.pendingCount());
    assert.deepEqual(queue.list(), []);
    assert.equal(queue.hasCorruptData(), true);
    assert.equal(storage.values.get(`${GENEALOGY_QUEUE_KEY}${GENEALOGY_CORRUPT_SUFFIX}`), '{truncated');
    queue.enqueue(linkPayload('a'), 'a');
    assert.equal(queue.pendingCount(), 1);
  });

  it('sets aside a non-array value and corrupt rejected lists', () => {
    const storage = makeStorage({
      [GENEALOGY_QUEUE_KEY]: '{"not":"an array"}',
      [GENEALOGY_REJECTED_KEY]: 'nope',
    });
    const queue = queueFor(OPERATOR, storage);
    assert.deepEqual(queue.list(), []);
    assert.deepEqual(queue.listRejected(), []);
    assert.equal(storage.values.get(`${GENEALOGY_REJECTED_KEY}${GENEALOGY_CORRUPT_SUFFIX}`), 'nope');
  });

  it('drops malformed entries inside a valid array', () => {
    const storage = makeStorage({
      [GENEALOGY_QUEUE_KEY]: JSON.stringify([null, 7, { client_event_id: 'ok', status: 'pending', payload: { ...linkPayload('ok'), owner: OPERATOR } }]),
    });
    assert.deepEqual(queueFor(OPERATOR, storage).list().map((item) => item.client_event_id), ['ok']);
  });

  it('does not throw when storage itself is unavailable', () => {
    const storage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} };
    const queue = queueFor(OPERATOR, storage);
    assert.equal(queue.pendingCount(), 0);
    assert.deepEqual(queue.listRejected(), []);
  });
});
