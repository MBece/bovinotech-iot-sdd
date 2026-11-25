// Last animals / tree / evaluation consulted, shown offline as "dato en caché".
// Partitioned by session scope (user + farm): a single scope is kept on the
// device and claiming it for another session purges the previous one (H-03).
export const GENEALOGY_CACHE_KEY = 'bovinotech_genealogy_cache';
const LEGACY_KEYS = ['bovinotech_genealogy_animals_cache', 'bovinotech_genealogy_view_cache'];

const safeGet = (storage, key) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const safeSet = (storage, key, value) => {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage unavailable or full: the view keeps working without cache.
  }
};

const safeRemove = (storage, key) => {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage unavailable.
  }
};

const readStore = (storage) => {
  const raw = safeGet(storage, GENEALOGY_CACHE_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && typeof value.scope === 'string'
        && value.entries && typeof value.entries === 'object') {
      return value;
    }
  } catch {
    // Corrupt cache: treated as empty (H-05); it is overwritten on next write.
  }
  return null;
};

export const createGenealogyCache = ({
  storage = globalThis.localStorage,
  scope,
  now = () => new Date(),
} = {}) => ({
  /** Takes the device cache for this session, purging other sessions' data. */
  claim() {
    for (const key of LEGACY_KEYS) safeRemove(storage, key);
    const store = readStore(storage);
    if (safeGet(storage, GENEALOGY_CACHE_KEY) !== null && (!store || store.scope !== scope)) {
      safeRemove(storage, GENEALOGY_CACHE_KEY);
    }
  },

  read(kind, key) {
    if (!scope) return null;
    const store = readStore(storage);
    if (!store || store.scope !== scope) return null;
    return store.entries[`${kind}:${key}`] ?? null;
  },

  write(kind, key, data) {
    const entry = { data, savedAt: now().toISOString() };
    if (!scope) return entry;
    const store = readStore(storage);
    const entries = store && store.scope === scope ? store.entries : {};
    entries[`${kind}:${key}`] = entry;
    safeSet(storage, GENEALOGY_CACHE_KEY, JSON.stringify({ scope, entries }));
    return entry;
  },
});

export const formatCachedAt = (iso) => new Date(iso).toLocaleString('es-CO');
