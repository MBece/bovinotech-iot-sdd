// Storage adapters of the sync state: in-memory (tests) and IndexedDB (browser).
// Both expose putMany, getAll, add and deleteKeys.
import { SYNC_DB_NAME, SYNC_DB_SCHEMA, SYNC_DB_VERSION } from './syncDbSchema.js';

export const createMemorySyncStore = (schema = SYNC_DB_SCHEMA) => {
  const tables = new Map(Object.keys(schema).map((name) => [name, new Map()]));
  let sequence = 0;
  const table = (name) => {
    const rows = tables.get(name);
    if (!rows) throw new Error(`Unknown store ${name}`);
    return rows;
  };

  return {
    async putMany(storeName, values) {
      const { keyPath } = schema[storeName];
      for (const value of values) table(storeName).set(value[keyPath], structuredClone(value));
    },
    async getAll(storeName) {
      return [...table(storeName).values()].map((value) => structuredClone(value));
    },
    async add(storeName, value) {
      const { keyPath, autoIncrement } = schema[storeName];
      const record = structuredClone(value);
      if (autoIncrement) {
        sequence += 1;
        record[keyPath] = sequence;
      }
      table(storeName).set(record[keyPath], record);
      return record[keyPath];
    },
    async deleteKeys(storeName, keys) {
      for (const key of keys) table(storeName).delete(key);
    },
  };
};

const promisify = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const createIndexedDbSyncStore = ({
  name = SYNC_DB_NAME,
  version = SYNC_DB_VERSION,
  schema = SYNC_DB_SCHEMA,
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
            const store = database.createObjectStore(storeName, {
              keyPath: definition.keyPath,
              autoIncrement: Boolean(definition.autoIncrement),
            });
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

  // One transaction per call: either every write lands or none does.
  const write = async (storeName, operation) => {
    const database = await open();
    const transaction = database.transaction(storeName, 'readwrite');
    const done = new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
    });
    const result = operation(transaction.objectStore(storeName));
    const value = result ? await promisify(result) : undefined;
    await done;
    return value;
  };

  return {
    putMany: (storeName, values) =>
      write(storeName, (store) => {
        values.forEach((value) => store.put(value));
        return null;
      }),
    async getAll(storeName) {
      const database = await open();
      return promisify(database.transaction(storeName, 'readonly').objectStore(storeName).getAll());
    },
    add: (storeName, value) => write(storeName, (store) => store.add(value)),
    deleteKeys: (storeName, keys) =>
      write(storeName, (store) => {
        keys.forEach((key) => store.delete(key));
        return null;
      }),
  };
};
