// One sync run: recover → select → mark syncing → send batches → apply results
// → record the run. Every dependency is injected so it is tested without a
// browser. It only reads HU-02 events; it never writes them (FR-007).
import {
  applyBatchResult,
  finalFailure,
  recoverInterrupted,
  syncingStates,
  TRANSPORT_MESSAGES,
} from './batchResult.js';
import { chunkBatches, selectDueEvents, toCapturedPayload } from './queueSelection.js';
import { SYNC_STATE } from './syncDbSchema.js';

const emptySummary = () => ({ batches: 0, synced: 0, duplicate: 0, failed_transient: 0, failed_final: 0 });

const tally = (summary, states) => {
  for (const state of states) {
    if (state.status === SYNC_STATE.SYNCED) summary.synced += 1;
    else if (state.status === SYNC_STATE.DUPLICATE) summary.duplicate += 1;
    else if (state.status === SYNC_STATE.FAILED && state.failure_kind === 'final') summary.failed_final += 1;
    else if (state.status === SYNC_STATE.FAILED) summary.failed_transient += 1;
  }
};

export const createSyncEngine = ({
  captureRepository,
  stateRepository,
  transport,
  now = () => new Date(),
  random = Math.random,
}) => {
  const recover = async () => {
    const recovered = recoverInterrupted([...(await stateRepository.getStatusMap()).values()]);
    if (recovered.length) await stateRepository.saveStates(recovered);
    return recovered.length;
  };

  const sendBatch = async (batch, session) => {
    const statusMap = await stateRepository.getStatusMap();
    await stateRepository.saveStates(syncingStates(batch, statusMap, now()));
    const response = await transport.send(batch.map(toCapturedPayload), session.token);
    const { states, outcome } = applyBatchResult(batch, statusMap, response, now(), random);
    await stateRepository.saveStates(states);
    return { states, outcome };
  };

  return {
    recoverInterrupted: recover,

    async runSync({ session, trigger, manual = false }) {
      const summary = { ...emptySummary(), trigger, started_at: now().toISOString() };
      await recover();
      const events = await captureRepository.getAll();
      const due = selectDueEvents(events, await stateRepository.getStatusMap(), now(), {
        authorEmail: session.authorEmail,
        manual,
      });

      let stopReason = 'queue_empty';
      const queue = chunkBatches(due);
      while (queue.length) {
        const batch = queue.shift();
        const { states, outcome } = await sendBatch(batch, session);
        summary.batches += 1;
        if (outcome === 'split') {
          // 413/422: halve until the offending event is isolated (R5).
          if (batch.length === 1) {
            const failed = [
              finalFailure(batch[0], null, now(), 'REQUEST_REJECTED', TRANSPORT_MESSAGES.REQUEST_REJECTED),
            ];
            await stateRepository.saveStates(failed);
            tally(summary, failed);
          } else {
            const middle = Math.ceil(batch.length / 2);
            queue.unshift(batch.slice(0, middle), batch.slice(middle));
          }
          continue;
        }
        tally(summary, states);
        if (outcome !== 'ok') {
          stopReason = outcome;
          break;
        }
      }

      summary.stop_reason = stopReason;
      summary.finished_at = now().toISOString();
      await stateRepository.recordRun(summary);
      return summary;
    },
  };
};
