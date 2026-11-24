// Minimal IndexedDB adapter for `bovinotech_offline_capture` (research R2).
// Same contract as memoryStore.js. Each operation is a single transaction, so
// an abrupt close leaves either the whole write or nothing (FR-010).
import { CAPTURE_DB_NAME, CAPTURE_DB_SCHEMA, CAPTURE_DB_VERSION } from './captureDbSchema.js';

const promisify = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });

export const createIndexedDbStore = ({
  name = CAPTURE_DB_NAME,
  version = CAPTURE_DB_VERSION,
  schema = CAPTURE_DB_SCHEMA,
  indexedDBImpl = globalThis.indexedDB,
} = {}) => {
  let databasePromise = null;

  const open = () => {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDBImpl.open(name, version);
        request.onupgradeneeded = () => {
          const database = request.result;
          for (const [storeName, definition] of Object.entries(schema)) {
            if (database.objectStoreNames.contains(storeName)) continue;
            const store = database.createObjectStore(storeName, { keyPath: definition.keyPath });
            for (const [indexName, keyPath] of Object.entries(definition.indexes ?? {})) {
              store.createIndex(indexName, keyPath);
            }
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          databasePromise = null;
          reject(request.error);
        };
      });
    }
    return databasePromise;
  };

  const run = async (storeName, mode, operation) => {
    const database = await open();
    const transaction = database.transaction(storeName, mode);
    const result = operation(transaction.objectStore(storeName));
    const value = result instanceof IDBRequest ? promisify(result) : Promise.resolve(result);
    const [resolved] = await Promise.all([value, transactionDone(transaction)]);
    return resolved;
  };

  return {
    add: (storeName, value) => run(storeName, 'readwrite', (store) => store.add(value)),

    get: (storeName, key) => run(storeName, 'readonly', (store) => store.get(key)),

    getAll: (storeName) => run(storeName, 'readonly', (store) => store.getAll()),

    getAllFromIndex: (storeName, indexName, query) =>
      run(storeName, 'readonly', (store) => store.index(indexName).getAll(query)),

    replaceAllInIndex: (storeName, indexName, query, values) =>
      run(storeName, 'readwrite', (store) => {
        const cursorRequest = store.index(indexName).openCursor(IDBKeyRange.only(query));
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
            return;
          }
          values.forEach((value) => store.put(value));
        };
        return undefined;
      }),
  };
};
