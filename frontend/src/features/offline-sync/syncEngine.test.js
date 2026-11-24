import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from './syncEngine.js';
import {
  AUTHOR,
  capturedEvent,
  captureRepositoryOf,
  createFakeServer,
  newStateRepository,
  transportFor,
} from './testDoubles.js';

const session = { authorEmail: AUTHOR, token: 'token-1' };
const fixedNow = () => new Date('2026-11-24T12:00:00Z');

const setup = (events, { server = createFakeServer(), states = newStateRepository(), now = fixedNow, random = () => 0.5 } = {}) => {
  const captureRepository = captureRepositoryOf(events);
  const engine = createSyncEngine({
    captureRepository,
    stateRepository: states,
    transport: transportFor(server),
    now,
    random,
  });
  return { engine, server, states, captureRepository };
};

const countBy = (map, status) => [...map.values()].filter((state) => state.status === status).length;

// --- US1 -------------------------------------------------------------------

test('10 pending events are sent in one batch and confirmed', async () => {
  const events = Array.from({ length: 10 }, (_, index) => capturedEvent(index));
  const { engine, server, states } = setup(events);

  const summary = await engine.runSync({ session, trigger: 'reconnect' });

  const map = await states.getStatusMap();
  assert.equal(server.requests.length, 1);
  assert.equal(summary.synced, 10);
  assert.equal(summary.stop_reason, 'queue_empty');
  assert.equal(countBy(map, 'synced'), 10);
  const one = map.get(events[0].clientEventId);
  assert.equal(one.confirmed_at, '2026-11-24T12:00:00.000Z');
  assert.equal(one.server_received_at, '2026-11-24T12:00:00.000Z');
  assert.equal(one.attempts, 0);
});

test('120 pending events go in 3 sequential batches', async () => {
  const events = Array.from({ length: 120 }, (_, index) => capturedEvent(index));
  const { engine, server } = setup(events);

  const summary = await engine.runSync({ session, trigger: 'timer' });

  assert.deepEqual(server.requests.map((batch) => batch.length), [50, 50, 20]);
  assert.equal(summary.batches, 3);
});

test('events are marked syncing while their batch is in flight', async () => {
  const events = [capturedEvent(1)];
  const states = newStateRepository();
  let seen = null;
  const engine = createSyncEngine({
    captureRepository: captureRepositoryOf(events),
    stateRepository: states,
    transport: {
      async send(items) {
        seen = (await states.getStatusMap()).get(items[0].clientEventId).status;
        return { ok: true, status: 200, body: createFakeServer().handle(items) };
      },
    },
    now: fixedNow,
    random: () => 0.5,
  });

  await engine.runSync({ session, trigger: 'manual' });

  assert.equal(seen, 'syncing');
});

test('interrupted syncing states go back to pending and are resent on start', async () => {
  const events = [capturedEvent(1)];
  const states = newStateRepository();
  await states.saveStates([{ client_event_id: events[0].clientEventId, author_email: AUTHOR, status: 'syncing', attempts: 0 }]);
  const { engine } = setup(events, { states });

  const recovered = await engine.recoverInterrupted();
  assert.equal(recovered, 1);
  assert.equal((await states.getStatusMap()).get(events[0].clientEventId).status, 'pending');

  await engine.runSync({ session, trigger: 'reconnect' });
  assert.equal((await states.getStatusMap()).get(events[0].clientEventId).status, 'synced');
});

test('24-hour outage with 200 events: all confirmed, none lost, none duplicated', async () => {
  const events = Array.from({ length: 200 }, (_, index) =>
    capturedEvent(index, { fieldOccurredAt: new Date(Date.UTC(2026, 10, 23) + index * 432_000).toISOString() }),
  );
  const { engine, server, states } = setup(events);

  await engine.runSync({ session, trigger: 'reconnect' });

  const map = await states.getStatusMap();
  assert.equal(server.records.size, 200);
  assert.equal(countBy(map, 'synced'), 200);
  const sent = server.requests.flat();
  assert.equal(new Set(sent).size, sent.length, 'no event sent twice');
});

test('the engine never writes HU-02 events', async () => {
  const { engine, captureRepository } = setup([capturedEvent(1), capturedEvent(2)]);

  await engine.runSync({ session, trigger: 'reconnect' });

  assert.equal(captureRepository.writes, 0);
});

test('every run is recorded', async () => {
  const { engine, states } = setup([capturedEvent(1)]);

  await engine.runSync({ session, trigger: 'login' });

  const [run] = await states.listRuns();
  assert.equal(run.trigger, 'login');
  assert.equal(run.synced, 1);
  assert.equal(run.stop_reason, 'queue_empty');
  assert.ok(run.started_at && run.finished_at);
});

// --- US2 -------------------------------------------------------------------

test('a cut mid-response leaves events pending; the next run confirms them as duplicates', async () => {
  const events = [capturedEvent(1), capturedEvent(2)];
  const server = createFakeServer();
  server.lostResponses = 1;
  const { engine, states } = setup(events, { server });

  await engine.runSync({ session, trigger: 'reconnect' });
  const afterCut = await states.getStatusMap();
  assert.equal(server.records.size, 2, 'the server stored the batch');
  assert.notEqual(afterCut.get(events[0].clientEventId).status, 'synced');
  assert.notEqual(afterCut.get(events[0].clientEventId).status, 'syncing');

  await engine.runSync({ session, trigger: 'manual', manual: true });
  const map = await states.getStatusMap();
  assert.equal(map.get(events[0].clientEventId).status, 'duplicate');
  assert.equal(map.get(events[1].clientEventId).status, 'duplicate');
  assert.equal(server.records.size, 2);
});

test('confirmed events are never sent again', async () => {
  const events = [capturedEvent(1), capturedEvent(2)];
  const { engine, server } = setup(events);

  await engine.runSync({ session, trigger: 'reconnect' });
  await engine.runSync({ session, trigger: 'timer' });
  await engine.runSync({ session, trigger: 'manual', manual: true });

  assert.equal(server.requests.length, 1);
});

// --- US3 -------------------------------------------------------------------

test('AC4 end to end: 8 confirmed, only 2 stay queued and later succeed', async () => {
  const events = Array.from({ length: 10 }, (_, index) => capturedEvent(index));
  const server = createFakeServer();
  server.transientIds = new Set([events[3].clientEventId, events[8].clientEventId]);
  let clock = new Date('2026-11-24T12:00:00Z');
  const { engine, states } = setup(events, { server, now: () => clock });

  await engine.runSync({ session, trigger: 'reconnect' });
  let map = await states.getStatusMap();
  assert.equal(countBy(map, 'synced'), 8);
  assert.equal(countBy(map, 'failed'), 2);

  server.transientIds.clear();
  await engine.runSync({ session, trigger: 'timer' });
  assert.equal(server.requests.length, 1, 'not due yet: the wait is respected');

  clock = new Date('2026-11-24T12:00:05Z');
  await engine.runSync({ session, trigger: 'timer' });
  map = await states.getStatusMap();
  assert.deepEqual(server.requests.at(-1), [events[3].clientEventId, events[8].clientEventId]);
  assert.equal(countBy(map, 'synced'), 10);
});

test('manual sync ignores the scheduled wait (FR-002)', async () => {
  const events = [capturedEvent(1)];
  const server = createFakeServer();
  server.transientIds = new Set([events[0].clientEventId]);
  const { engine, states } = setup(events, { server });
  await engine.runSync({ session, trigger: 'reconnect' });
  server.transientIds.clear();

  await engine.runSync({ session, trigger: 'manual', manual: true });

  assert.equal((await states.getStatusMap()).get(events[0].clientEventId).status, 'synced');
});

test('401 stops the run as auth_paused without consuming attempts (FR-020)', async () => {
  const events = Array.from({ length: 60 }, (_, index) => capturedEvent(index));
  const server = createFakeServer();
  server.nextStatus = 401;
  const { engine, states } = setup(events, { server });

  const summary = await engine.runSync({ session, trigger: 'timer' });

  const map = await states.getStatusMap();
  assert.equal(summary.stop_reason, 'auth_paused');
  assert.equal(server.requests.length, 1, 'stops after the first batch');
  assert.ok([...map.values()].every((state) => state.status === 'pending' && state.attempts === 0));
});

test('422 splits the batch until the offending event is isolated as a final failure', async () => {
  const events = Array.from({ length: 4 }, (_, index) => capturedEvent(index));
  const bad = events[2].clientEventId;
  const server = createFakeServer();
  const states = newStateRepository();
  const engine = createSyncEngine({
    captureRepository: captureRepositoryOf(events),
    stateRepository: states,
    transport: {
      async send(items) {
        server.requests.push(items.map((item) => item.clientEventId));
        if (items.some((item) => item.clientEventId === bad)) return { ok: false, status: 422, body: null };
        return { ok: true, status: 200, body: server.handle(items) };
      },
    },
    now: fixedNow,
    random: () => 0.5,
  });

  await engine.runSync({ session, trigger: 'reconnect' });

  const map = await states.getStatusMap();
  assert.equal(countBy(map, 'synced'), 3);
  assert.equal(map.get(bad).status, 'failed');
  assert.equal(map.get(bad).failure_kind, 'final');
  assert.equal(map.get(bad).error_code, 'REQUEST_REJECTED');
});
