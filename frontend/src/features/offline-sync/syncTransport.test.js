import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncTransport } from './syncTransport.js';

const recordingFetch = (calls) => async (url, options) => {
  calls.push({ url, options });
  return { ok: true, status: 200, json: async () => ({ results: [] }) };
};

test('QA-02: the batch goes with the token of the session that started the run', async () => {
  const calls = [];
  const transport = createSyncTransport({ apiUrl: 'http://api.test', fetchImpl: recordingFetch(calls) });

  await transport.send([{ clientEventId: 'a' }], 'token-A');
  await transport.send([{ clientEventId: 'b' }], 'token-B');

  assert.deepEqual(calls.map((call) => call.options.headers.Authorization), ['Bearer token-A', 'Bearer token-B']);
  assert.equal(calls[0].url, 'http://api.test/offline-sync/batches');
  assert.deepEqual(JSON.parse(calls[0].options.body), { items: [{ clientEventId: 'a' }] });
});

test('network failures come back as transportError instead of throwing', async () => {
  const transport = createSyncTransport({
    apiUrl: 'http://api.test',
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
  });

  assert.deepEqual(await transport.send([], 'token-A'), { transportError: 'NETWORK' });
});

test('an aborted request after the timeout comes back as TIMEOUT', async () => {
  const transport = createSyncTransport({
    apiUrl: 'http://api.test',
    timeoutMs: 5,
    fetchImpl: (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }),
  });

  assert.deepEqual(await transport.send([], 'token-A'), { transportError: 'TIMEOUT' });
});
