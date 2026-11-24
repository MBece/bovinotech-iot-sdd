// Browser wiring: one controller per page, shared by every sync component.
import { API_URL, captureRepository } from '../offline-capture/captureServices.js';
import { createConnectivity } from './connectivity.js';
import { createSyncController } from './syncController.js';
import { createSyncEngine } from './syncEngine.js';
import { createSyncLock } from './syncLock.js';
import { createSyncStateRepository } from './syncStateRepository.js';
import { createIndexedDbSyncStore } from './syncStore.js';
import { createSyncTransport } from './syncTransport.js';

let currentToken = null;

export const syncStateRepository = createSyncStateRepository(createIndexedDbSyncStore());

const engine = createSyncEngine({
  captureRepository,
  stateRepository: syncStateRepository,
  transport: createSyncTransport({ apiUrl: API_URL, getToken: () => currentToken }),
});

export const syncController = createSyncController({
  engine,
  connectivity: createConnectivity({ apiUrl: API_URL }),
  lock: createSyncLock(),
  captureRepository,
  stateRepository: syncStateRepository,
});

export const setSyncSession = (session) => {
  currentToken = session?.token ?? null;
  return syncController.setSession(session);
};
