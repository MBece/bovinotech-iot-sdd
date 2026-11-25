import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkBatches, selectDueEvents, toCapturedPayload } from './queueSelection.js';
import { AUTHOR, capturedEvent } from './testDoubles.js';

const now = new Date('2026-11-24T12:00:00Z');
const state = (id, status, overrides = {}) => [id, { client_event_id: id, status, ...overrides }];

test('events without state or pending are due; final states are excluded', () => {
  const events = [1, 2, 3, 4, 5].map((index) => capturedEvent(index));
  const statusMap = new Map([
    state(events[1].clientEventId, 'pending'),
    state(events[2].clientEventId, 'synced'),
    state(events[3].clientEventId, 'duplicate'),
    state(events[4].clientEventId, 'failed', { failure_kind: 'final' }),
  ]);

  const due = selectDueEvents(events, statusMap, now, { authorEmail: AUTHOR });

  assert.deepEqual(due.map((event) => event.clientEventId), [events[0].clientEventId, events[1].clientEventId]);
});

test('only events of the signed-in author are sent', () => {
  const mine = capturedEvent(1);
  const theirs = capturedEvent(2, { authorEmail: 'vet@bovinotech.co' });

  assert.deepEqual(selectDueEvents([mine, theirs], new Map(), now, { authorEmail: AUTHOR }), [mine]);
});

test('orders by capture time, then by clientEventId', () => {
  const sameTime = '2026-11-23T05:00:00.000Z';
  const b = capturedEvent(9, { fieldOccurredAt: sameTime });
  const a = capturedEvent(8, { fieldOccurredAt: sameTime });
  const oldest = capturedEvent(20, { fieldOccurredAt: '2026-11-22T00:00:00.000Z' });

  const due = selectDueEvents([b, a, oldest], new Map(), now, { authorEmail: AUTHOR });

  assert.deepEqual(due.map((event) => event.clientEventId), [oldest.clientEventId, a.clientEventId, b.clientEventId]);
});

test('chunkBatches splits 120 events into 50 + 50 + 20', () => {
  const events = Array.from({ length: 120 }, (_, index) => capturedEvent(index));

  assert.deepEqual(chunkBatches(events).map((batch) => batch.length), [50, 50, 20]);
  assert.deepEqual(chunkBatches([]), []);
});

test('the payload drops client-only fields of HU-02', () => {
  const payload = toCapturedPayload(capturedEvent(1, { savedAt: 'x' }));

  assert.equal('animalName' in payload, false);
  assert.equal('savedAt' in payload, false);
  assert.equal(payload.clientEventId, capturedEvent(1).clientEventId);
  assert.equal(payload.origin, 'OFFLINE_CAPTURE');
});
