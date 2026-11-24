import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncController } from './syncController.js';
import { createSyncLock } from './syncLock.js';
import { capturedEvent, captureRepositoryOf, newStateRepository } from './testDoubles.js';

const fakeEngine = (stopReason = 'queue_empty') => ({
  runs: [],
  recovered: 0,
  async recoverInterrupted() {
    this.recovered += 1;
    return 0;
  },
  async runSync(args) {
    this.runs.push(args);
    return { stop_reason: stopReason, synced: 0 };
  },
});

const setup = ({ online = true, engine = fakeEngine() } = {}) => {
  const connectivity = { browserOnline: () => online, probe: async () => online };
  const controller = createSyncController({
    engine,
    connectivity,
    lock: createSyncLock({ locks: null }),
    captureRepository: captureRepositoryOf([capturedEvent(1)]),
    stateRepository: newStateRepository(),
    timerMs: 60_000,
    windowImpl: null,
  });
  return { controller, engine, connectivity };
};

const session = { authorEmail: 'operario@bovinotech.co', token: 't1' };

test('starting a session recovers interrupted states and syncs once', async (t) => {
  const { controller, engine } = setup();
  t.after(() => controller.stop());

  await controller.setSession(session);

  assert.equal(engine.recovered, 1);
  assert.deepEqual(engine.runs.map((run) => run.trigger), ['reconnect']);
  assert.equal(controller.getSnapshot().events.length, 1);
});

test('without connectivity nothing runs and no attempt is consumed (FR-026)', async (t) => {
  const { controller, engine } = setup({ online: false });
  t.after(() => controller.stop());

  await controller.setSession(session);
  await controller.syncNow();

  assert.equal(engine.runs.length, 0);
  assert.equal(controller.getSnapshot().online, false);
});

test('a sync paused by 401 resumes with the login trigger after a new token', async (t) => {
  const engine = fakeEngine('auth_paused');
  const { controller } = setup({ engine });
  t.after(() => controller.stop());

  await controller.setSession(session);
  await controller.setSession({ ...session, token: 't2' });

  assert.deepEqual(engine.runs.map((run) => run.trigger), ['reconnect', 'login']);
});

test('manual sync passes manual: true', async (t) => {
  const { controller, engine } = setup();
  t.after(() => controller.stop());
  await controller.setSession(session);

  await controller.syncNow();

  assert.deepEqual(engine.runs.at(-1), { session, trigger: 'manual', manual: true });
});

test('the lock lets only one run at a time (FR-004)', async () => {
  const lock = createSyncLock({ locks: null });
  let release;
  const first = lock.run(() => new Promise((resolve) => { release = resolve; }));

  const second = await lock.run(async () => 'second');
  release('first');

  assert.deepEqual(second, { skipped: true });
  assert.deepEqual(await first, { skipped: false, value: 'first' });
});
