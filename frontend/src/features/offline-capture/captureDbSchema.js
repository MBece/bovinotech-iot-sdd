// Schema of the module's own IndexedDB database (research R2).
// Shared by the IndexedDB adapter and the in-memory store used in tests.

export const CAPTURE_DB_NAME = 'bovinotech_offline_capture';
export const CAPTURE_DB_VERSION = 1;

export const EVENTS_STORE = 'events';
export const CATALOG_STORE = 'catalog';

export const CAPTURE_DB_SCHEMA = {
  [EVENTS_STORE]: {
    keyPath: 'clientEventId',
    indexes: { byAuthorFarm: ['authorEmail', 'farmId'] },
  },
  [CATALOG_STORE]: {
    keyPath: ['farmId', 'din'],
    indexes: { byFarm: 'farmId' },
  },
};
