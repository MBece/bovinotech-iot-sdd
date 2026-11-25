import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncLock } from './syncLock.js';
import { createSyncWiring } from './syncWiring.js';
import { capturedEvent, captureRepositoryOf, newStateRepository } from './testDoubles.js';

const USER_A = 'operario@bovinotech.co';
const USER_B = 'veterinario@bovinotech.co';
const TOKEN_A = 'token-A';
const TOKEN_B = 'token-B';
const sessionA = { authorEmail: USER_A, token: TOKEN_A };
const sessionB = { authorEmail: USER_B, token: TOKEN_B };

/**
 * Fake HTTP backend behind the real transport: authenticates by the bearer
 * token and answers AUTHOR_MISMATCH (final) like authorization.py does.
 * `holdFirst` keeps the first request in flight until `release()`.
 */
const fakeHttpServer = ({ holdFirst = false } = {}) => {
  const owners = { [TOKEN_A]: USER_A, [TOKEN_B]: USER_B };
  const records = new Set();
  let release = () => {};
  const held = new Promise((resolve) => { release = resolve; });
  const server = {
    requests: [],
    release: () => release(),
    async fetchImpl(url, options) {
      const token = options.headers.Authorization.replace('Bearer ', '');
      const { items } = JSON.parse(options.body);
      server.requests.push({ token, authors: [...new Set(items.map((item) => item.authorEmail))], size: items.length });
      if (holdFirst && server.requests.length === 1) await held;
      const results = items.map((item, index) => {
        if (item.authorEmail !== owners[token]) {
          return { index, clientEventId: item.clientEventId, status: 'FALLIDO', retryable: false, errorCode: 'AUTHOR_MISMATCH', detail: 'El evento pertenece a otro usuario y solo puede sincronizarlo su autor.' };
        }
        const status = records.has(item.clientEventId) ? 'DUPLICADO' : 'SINCRONIZADO';
        records.add(item.clientEventId);
        return { index, clientEventId: item.clientEventId, status, retryable: null, errorCode: null, detail: null, receivedAt: '2026-11-24T12:00:00Z', requiresTimestampReview: false };
      });
      return { ok: true, status: 200, json: async () => ({ batchId: server.requests.length, serverTime: '2026-11-24T12:00:00Z', results }) };
    },
  };
  return server;
};

const until = async (condition) => {
  for (let i = 0; i < 1000 && !condition(); i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(condition(), 'condition not reached');
};

const setup = (events, server) => {
  const stateRepository = newStateRepository();
  const wiring = createSyncWiring({
    apiUrl: 'http://api.test',
    captureRepository: captureRepositoryOf(events),
    stateRepository,
    connectivity: { browserOnline: () => true, probe: async () => true },
    lock: createSyncLock({ locks: null }),
    fetchImpl: (...args) => server.fetchImpl(...args),
    timerMs: 60_000,
    windowImpl: null,
  });
  return { ...wiring, stateRepository };
};

test('QA-02: user B signs in during batch 1 of user A; A batches never go with B token and none of A events fail for good', async (t) => {
  const eventsA = Array.from({ length: 120 }, (_, index) => capturedEvent(index, { authorEmail: USER_A }));
  const eventsB = Array.from({ length: 3 }, (_, index) => capturedEvent(500 + index, { authorEmail: USER_B }));
  const server = fakeHttpServer({ holdFirst: true });
  const { setSyncSession, syncController, stateRepository } = setup([...eventsA, ...eventsB], server);
  t.after(() => syncController.stop());

  const runA = setSyncSession(sessionA);
  await until(() => server.requests.length === 1);
  await setSyncSession(sessionB);
  server.release();
  await runA;
  await until(() => !syncController.getSnapshot().running);

  const requestsWithA = server.requests.filter((request) => request.authors.includes(USER_A));
  assert.ok(requestsWithA.every((request) => request.token === TOKEN_A), JSON.stringify(server.requests));
  assert.ok(server.requests.every((request) => request.authors.length === 1), 'one author per batch');

  const statesA = eventsA.map((event) => (async () => (await stateRepository.getStatusMap()).get(event.clientEventId))());
  const resolved = await Promise.all(statesA);
  const finalFailures = resolved.filter((state) => state?.failure_kind === 'final');
  assert.equal(finalFailures.length, 0, 'no event of A ends as a final failure');
  const notSent = resolved.filter((state) => !state || state.status === 'pending');
  assert.equal(notSent.length, 70, 'unsent events of A stay pending');
  assert.ok(notSent.every((state) => !state || state.attempts === 0), 'without consuming attempts');

  // A signs in again later: everything of A is confirmed.
  await setSyncSession(sessionA);
  const map = await stateRepository.getStatusMap();
  assert.ok(eventsA.every((event) => ['synced', 'duplicate'].includes(map.get(event.clientEventId)?.status)));
});
