// Browser wiring: one controller per page, shared by every sync component.
import { API_URL, captureRepository } from '../offline-capture/captureServices.js';
import { createConnectivity } from './connectivity.js';
import { createSyncLock } from './syncLock.js';
import { createSyncStateRepository } from './syncStateRepository.js';
import { createIndexedDbSyncStore } from './syncStore.js';
import { createSyncWiring } from './syncWiring.js';

export const syncStateRepository = createSyncStateRepository(createIndexedDbSyncStore());

const wiring = createSyncWiring({
  apiUrl: API_URL,
  captureRepository,
  stateRepository: syncStateRepository,
  connectivity: createConnectivity({ apiUrl: API_URL }),
  lock: createSyncLock(),
});

export const syncController = wiring.syncController;

export const setSyncSession = wiring.setSyncSession;
