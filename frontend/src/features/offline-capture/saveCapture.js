// Save flow: validate → build → store, without touching the network
// (FR-003, FR-004). A lock prevents a double tap from storing two events.
import { buildCapturedEvent } from './buildCapturedEvent.js';
import { ERROR_MESSAGES, validateCapturedEvent } from './eventValidation.js';

export const createCaptureSaver = ({ repository, now = () => new Date(), uuid } = {}) => {
  let saving = false;

  return {
    get saving() {
      return saving;
    },

    /**
     * Returns `{ ok: true, event }`, `{ ok: false, errors, message }`, or
     * `{ ok: false, busy: true }` while another save is in progress.
     */
    async save({ form, session, catalog, animal = null }) {
      if (saving) return { ok: false, busy: true, errors: [] };
      saving = true;
      try {
        const event = buildCapturedEvent({ form, session, animal, now, uuid });
        const errors = validateCapturedEvent(event, { now: now(), catalog });
        if (errors.length) return { ok: false, errors };
        try {
          await repository.add(event);
        } catch {
          return {
            ok: false,
            errors: ['STORAGE_WRITE_FAILED'],
            message: ERROR_MESSAGES.STORAGE_WRITE_FAILED,
          };
        }
        return { ok: true, event };
      } finally {
        saving = false;
      }
    },
  };
};
