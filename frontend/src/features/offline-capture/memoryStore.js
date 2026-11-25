// In-memory store with the same contract as indexedDbStore.js (research R6).
// Values are cloned on the way in and out, like IndexedDB does.
import { CAPTURE_DB_SCHEMA } from './captureDbSchema.js';

const pick = (value, path) =>
  Array.isArray(path) ? path.map((part) => value[part]) : value[path];

const serialize = (key) => JSON.stringify(key);

export const createMemoryStore = (schema = CAPTURE_DB_SCHEMA) => {
  const tables = new Map(Object.keys(schema).map((name) => [name, new Map()]));

  const table = (name) => {
    const rows = tables.get(name);
    if (!rows) throw new Error(`Unknown store ${name}`);
    return rows;
  };

  const matchesIndex = (storeName, indexName, query) => (value) =>
    serialize(pick(value, schema[storeName].indexes[indexName])) === serialize(query);

  return {
    async add(storeName, value) {
      const rows = table(storeName);
      const key = serialize(pick(value, schema[storeName].keyPath));
      if (rows.has(key)) {
        const error = new Error('Key already exists in the object store.');
        error.name = 'ConstraintError';
        throw error;
      }
      rows.set(key, structuredClone(value));
    },

    async get(storeName, key) {
      const value = table(storeName).get(serialize(key));
      return value === undefined ? undefined : structuredClone(value);
    },

    async getAll(storeName) {
      return [...table(storeName).values()].map((value) => structuredClone(value));
    },

    async getAllFromIndex(storeName, indexName, query) {
      return [...table(storeName).values()]
        .filter(matchesIndex(storeName, indexName, query))
        .map((value) => structuredClone(value));
    },

    /** Deletes every value matching the index query and adds `values`, atomically. */
    async replaceAllInIndex(storeName, indexName, query, values) {
      const rows = table(storeName);
      const matches = matchesIndex(storeName, indexName, query);
      const next = new Map([...rows].filter(([, value]) => !matches(value)));
      for (const value of values) {
        next.set(serialize(pick(value, schema[storeName].keyPath)), structuredClone(value));
      }
      rows.clear();
      next.forEach((value, key) => rows.set(key, value));
    },
  };
};
