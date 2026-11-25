import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countUnconfirmed, describeSyncState } from './syncStateLabels.js';
import { AUTHOR, capturedEvent } from './testDoubles.js';

const tz = { timeZone: 'America/Bogota' };

test('explicit Spanish labels for every state (UI-003)', () => {
  const label = (status, extra = {}) => describeSyncState({ status, ...extra }, tz).label;

  assert.equal(describeSyncState(undefined, tz).label, 'Pendiente de sincronización');
  assert.equal(label('pending'), 'Pendiente de sincronización');
  assert.equal(label('syncing'), 'Enviando');
  assert.equal(label('synced'), 'Sincronizado');
  assert.equal(label('duplicate'), 'Duplicado (ya estaba en el servidor)');
  assert.equal(label('failed', { failure_kind: 'transient' }), 'Fallido');
});

test('a transient failure explains the reason, the automatic retry and its time (FR-028)', () => {
  const described = describeSyncState(
    {
      status: 'failed',
      failure_kind: 'transient',
      error_message: 'Sin conexión con el servidor. Se reintentará.',
      next_attempt_at: '2026-11-24T13:45:00.000Z',
    },
    tz,
  );

  assert.equal(described.reason, 'Sin conexión con el servidor. Se reintentará.');
  assert.equal(described.retryLabel, 'Se reintentará automáticamente');
  assert.match(described.nextAttemptLabel, /8:45/);
});

test('a final failure says it will not be retried automatically', () => {
  const described = describeSyncState(
    { status: 'failed', failure_kind: 'final', error_message: 'Ya no tiene acceso a la finca de este evento.' },
    tz,
  );

  assert.equal(described.retryLabel, 'No se reintentará automáticamente');
  assert.equal(described.nextAttemptLabel, null);
  assert.equal(described.reason, 'Ya no tiene acceso a la finca de este evento.');
});

test('timestamp review is shown on synced events', () => {
  assert.equal(
    describeSyncState({ status: 'synced', requires_timestamp_review: true }, tz).reviewLabel,
    'Hora pendiente de revisión',
  );
  assert.equal(describeSyncState({ status: 'synced' }, tz).reviewLabel, null);
});

test('countUnconfirmed counts pending, syncing, failed and stateless events of the author (FR-027)', () => {
  const events = [1, 2, 3, 4, 5, 6].map((index) => capturedEvent(index));
  events.push(capturedEvent(7, { authorEmail: 'vet@bovinotech.co' }));
  const statusMap = new Map([
    [events[1].clientEventId, { status: 'syncing' }],
    [events[2].clientEventId, { status: 'failed', failure_kind: 'final' }],
    [events[3].clientEventId, { status: 'synced' }],
    [events[4].clientEventId, { status: 'duplicate' }],
    [events[5].clientEventId, { status: 'pending' }],
  ]);

  assert.equal(countUnconfirmed(events, statusMap, AUTHOR), 4);
});
