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

  const { isCurrent, ...args } = engine.runs.at(-1);
  assert.deepEqual(args, { session, trigger: 'manual', manual: true });
  assert.equal(isCurrent(), true);
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

// --- QA-02 / QA-06 ---------------------------------------------------------

test('QA-06: after a 401 the timer does not send again with the same token', async (t) => {
  const engine = fakeEngine('auth_paused');
  const controller = createSyncController({
    engine,
    connectivity: { browserOnline: () => true, probe: async () => true },
    lock: createSyncLock({ locks: null }),
    captureRepository: captureRepositoryOf([capturedEvent(1)]),
    stateRepository: newStateRepository(),
    timerMs: 5,
    windowImpl: null,
  });
  t.after(() => controller.stop());

  await controller.setSession(session);
  await new Promise((resolve) => setTimeout(resolve, 60));
  await controller.syncNow();

  assert.equal(engine.runs.length, 1, 'only the run that got the 401');

  await controller.setSession({ ...session, token: 't2' });
  assert.deepEqual(engine.runs.map((run) => [run.trigger, run.session.token]), [['reconnect', 't1'], ['login', 't2']]);
});

test('QA-02: the engine is told when the run session stops being the current one', async (t) => {
  const { controller, engine } = setup();
  t.after(() => controller.stop());
  await controller.setSession(session);

  const { isCurrent } = engine.runs[0];
  assert.equal(isCurrent(), true);
  await controller.setSession({ authorEmail: 'veterinario@bovinotech.co', token: 't9' });
  assert.equal(isCurrent(), false);
});

test('QA-02: a run stopped by a session change is followed by a run of the new session', async (t) => {
  const other = { authorEmail: 'veterinario@bovinotech.co', token: 't9' };
  let release;
  const engine = {
    runs: [],
    async recoverInterrupted() {},
    async runSync(args) {
      this.runs.push(args);
      if (this.runs.length === 1) {
        await new Promise((resolve) => { release = resolve; });
        return { stop_reason: args.isCurrent() ? 'queue_empty' : 'session_changed' };
      }
      return { stop_reason: 'queue_empty' };
    },
  };
  const { controller } = setup({ engine });
  t.after(() => controller.stop());

  const first = controller.setSession(session);
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
  await controller.setSession(other);
  release();
  await first;

  assert.deepEqual(engine.runs.map((run) => run.session.token), ['t1', 't9']);
});
