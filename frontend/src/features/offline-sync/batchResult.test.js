import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyBatchResult } from './batchResult.js';
import { capturedEvent } from './testDoubles.js';

const cases = Object.fromEntries(
  JSON.parse(
    readFileSync(new URL('../../../../specs/003-offline-batch-sync/contracts/sync-batch.cases.json', import.meta.url), 'utf8'),
  ).cases.map((item) => [item.id, item]),
);
const now = new Date('2026-11-24T12:00:00Z');
const half = () => 0.5;

const result = (index, event, status, extra = {}) => ({
  index,
  clientEventId: event.clientEventId,
  status,
  retryable: null,
  errorCode: null,
  detail: null,
  receivedAt: status === 'FALLIDO' ? null : '2026-11-24T11:59:00Z',
  requiresTimestampReview: false,
  ...extra,
});
const ok = (results) => ({ ok: true, status: 200, body: { batchId: 1, serverTime: now.toISOString(), results } });

test('AC1: one batch yields synced, duplicate and final failure', () => {
  const events = [capturedEvent(1), capturedEvent(2), capturedEvent(3)];
  const expected = cases.AC1_batch_mixed_states.expected;
  const response = ok([
    result(0, events[0], 'SINCRONIZADO'),
    result(1, events[1], 'DUPLICADO'),
    result(2, events[2], 'FALLIDO', { retryable: false, errorCode: 'CLIENT_EVENT_ID_CONFLICT', detail: 'El identificador del evento ya se usó con datos distintos.' }),
  ]);

  const { states, outcome } = applyBatchResult(events, new Map(), response, now, half);

  assert.equal(outcome, 'ok');
  assert.deepEqual(
    states.map((state) => (state.failure_kind ? `${state.status}/${state.failure_kind}` : state.status)),
    expected.map((item) => item.local),
  );
  assert.equal(states[2].next_attempt_at, null);
  assert.equal(states[2].error_code, 'CLIENT_EVENT_ID_CONFLICT');
  assert.equal(states[2].error_message, 'El identificador del evento ya se usó con datos distintos.');
});

test('AC4: retryable failures become transient with attempts and next attempt', () => {
  const events = Array.from({ length: 10 }, (_, index) => capturedEvent(index));
  const failing = new Set([3, 8]);
  const response = ok(
    events.map((event, index) =>
      failing.has(index)
        ? result(index, event, 'FALLIDO', { retryable: true, errorCode: 'STORAGE_BUSY', detail: 'El servidor no pudo registrar el evento. Se reintentará.' })
        : result(index, event, 'SINCRONIZADO'),
    ),
  );

  const { states } = applyBatchResult(events, new Map(), response, now, half);

  const transient = states.filter((state) => state.failure_kind === 'transient');
  assert.equal(states.filter((state) => state.status === 'synced').length, cases.AC4_two_of_ten_transient.expected_summary.synced);
  assert.deepEqual(transient.map((state) => state.client_event_id), [events[3].clientEventId, events[8].clientEventId]);
  assert.equal(transient[0].attempts, 1);
  assert.equal(transient[0].next_attempt_at, '2026-11-24T12:00:02.000Z');
});

test('consecutive transient failures increase attempts and the wait', () => {
  const [event] = [capturedEvent(1)];
  const previous = new Map([[event.clientEventId, { client_event_id: event.clientEventId, status: 'failed', failure_kind: 'transient', attempts: 3 }]]);

  const { states } = applyBatchResult([event], previous, { ok: false, status: 503, body: null }, now, half);

  assert.equal(states[0].attempts, 4);
  assert.equal(states[0].next_attempt_at, '2026-11-24T12:00:16.000Z');
});

test('network error returns the batch to pending without consuming attempts (R9, FR-026)', () => {
  const events = [capturedEvent(1), capturedEvent(2)];
  const previous = new Map([[events[1].clientEventId, { client_event_id: events[1].clientEventId, status: 'failed', failure_kind: 'transient', attempts: 3, next_attempt_at: '2026-11-24T11:59:00.000Z' }]]);
  const { states, outcome } = applyBatchResult(events, previous, { transportError: 'NETWORK' }, now, half);
  assert.equal(outcome, 'offline');
  assert.ok(states.every((state) => state.status === 'pending' && state.failure_kind === null));
  assert.ok(states.every((state) => state.next_attempt_at === null), 'no backoff is scheduled');
  assert.deepEqual(states.map((state) => state.attempts), [0, 3]);
  assert.equal(cases.network_error_whole_batch.expected_summary.stop_reason, 'offline');
});

// QA-12: the server may be reachable but slow; resending every tick without
// backoff would overload it and leave the operator with no visible reason.
test('timeout is a transient failure with backoff and a visible reason (R9, FR-026, FR-028)', () => {
  const events = [capturedEvent(1), capturedEvent(2)];
  const previous = new Map([[events[1].clientEventId, { client_event_id: events[1].clientEventId, status: 'failed', failure_kind: 'transient', attempts: 3 }]]);
  const { states, outcome } = applyBatchResult(events, previous, { transportError: 'TIMEOUT' }, now, half);
  assert.equal(outcome, 'server_error');
  assert.ok(states.every((state) => state.status === 'failed' && state.failure_kind === 'transient'));
  assert.deepEqual(states.map((state) => state.attempts), [1, 4]);
  assert.deepEqual(states.map((state) => state.next_attempt_at), ['2026-11-24T12:00:02.000Z', '2026-11-24T12:00:16.000Z']);
  assert.ok(states.every((state) => state.error_code === 'TIMEOUT'));
  assert.ok(states.every((state) => state.error_message === 'El servidor tardó demasiado en responder. Se reintentará.'));
  const spec = cases.timeout_whole_batch;
  assert.equal(spec.expected_summary.stop_reason, 'server_error');
  assert.equal(spec.expected_local.error_code, 'TIMEOUT');
  assert.equal(spec.expected_local.attempts, 1);
});

test('5xx and 429 make the whole batch transient', () => {
  for (const status of [500, 503, 429]) {
    const { states, outcome } = applyBatchResult([capturedEvent(1)], new Map(), { ok: false, status, body: null }, now, half);
    assert.equal(outcome, 'server_error');
    assert.equal(states[0].error_code, 'SERVER_UNAVAILABLE');
    assert.equal(states[0].failure_kind, 'transient');
  }
});

test('401 and 403 pause: back to pending without consuming attempts (FR-020)', () => {
  const event = capturedEvent(1);
  const previous = new Map([[event.clientEventId, { client_event_id: event.clientEventId, status: 'failed', failure_kind: 'transient', attempts: 2 }]]);
  for (const status of [401, 403]) {
    const { states, outcome } = applyBatchResult([event], previous, { ok: false, status, body: null }, now, half);
    assert.equal(outcome, cases.unauthorized_pauses.expected_summary.stop_reason);
    assert.equal(states[0].status, 'pending');
    assert.equal(states[0].attempts, 2);
  }
});

test('422 and 413 ask the engine to split the batch', () => {
  for (const status of [413, 422]) {
    const { outcome } = applyBatchResult([capturedEvent(1), capturedEvent(2)], new Map(), { ok: false, status, body: null }, now, half);
    assert.equal(outcome, 'split');
  }
});

test('confirmation after retries resets attempts (FR-024)', () => {
  const event = capturedEvent(1);
  const previous = new Map([[event.clientEventId, { client_event_id: event.clientEventId, status: 'failed', failure_kind: 'transient', attempts: 5 }]]);

  const { states } = applyBatchResult([event], previous, ok([result(0, event, 'DUPLICADO')]), now, half);

  assert.equal(states[0].status, 'duplicate');
  assert.equal(states[0].attempts, 0);
  assert.equal(states[0].failure_kind, null);
});

const mismatchResponse = (event) =>
  ok([
    result(0, event, 'FALLIDO', { retryable: false, errorCode: 'AUTHOR_MISMATCH', detail: 'El evento pertenece a otro usuario y solo puede sincronizarlo su autor.' }),
  ]);

test('QA-02: AUTHOR_MISMATCH on an event of another author than the sender goes back to pending', () => {
  const event = capturedEvent(1, { authorEmail: 'operario@bovinotech.co' });
  const previous = new Map([[event.clientEventId, { client_event_id: event.clientEventId, status: 'failed', failure_kind: 'transient', attempts: 2 }]]);

  const { states, outcome } = applyBatchResult([event], previous, mismatchResponse(event), now, half, { senderEmail: 'veterinario@bovinotech.co' });

  assert.equal(outcome, 'ok');
  assert.equal(states[0].status, 'pending');
  assert.equal(states[0].failure_kind, null);
  assert.equal(states[0].attempts, 2, 'no attempt is consumed');
});

test('AUTHOR_MISMATCH on an event sent by its own author stays a final failure', () => {
  const event = capturedEvent(1, { authorEmail: 'operario@bovinotech.co' });

  const { states } = applyBatchResult([event], new Map(), mismatchResponse(event), now, half, { senderEmail: 'operario@bovinotech.co' });

  assert.equal(states[0].status, 'failed');
  assert.equal(states[0].failure_kind, 'final');
});
