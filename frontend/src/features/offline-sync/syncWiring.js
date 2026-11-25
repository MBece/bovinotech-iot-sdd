// Wiring of engine + transport + controller, without browser globals, so the
// whole chain (including the real HTTP transport) is testable in Node.
import { createSyncController } from './syncController.js';
import { createSyncEngine } from './syncEngine.js';
import { createSyncTransport } from './syncTransport.js';

export const createSyncWiring = ({
  apiUrl,
  captureRepository,
  stateRepository,
  connectivity,
  lock,
  fetchImpl,
  timerMs,
  windowImpl,
}) => {
  const engine = createSyncEngine({
    captureRepository,
    stateRepository,
    transport: createSyncTransport({ apiUrl, fetchImpl }),
  });

  const syncController = createSyncController({
    engine,
    connectivity,
    lock,
    captureRepository,
    stateRepository,
    timerMs,
    windowImpl,
  });

  // No module-level token: each run carries its own session (QA-02).
  const setSyncSession = (session) => syncController.setSession(session);

  return { engine, syncController, setSyncSession };
};
