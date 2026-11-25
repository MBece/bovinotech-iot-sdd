const DB_NAME = 'bovinotech_offline';
const DB_VERSION = 1;
const STORE_NAME = 'sanitary_events';

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'clientEventId' });
        store.createIndex('status', 'status');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async (mode, operation) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const offlineEventRepository = {
  save(event) {
    return withStore('readwrite', (store) => store.put(event));
  },

  getAll() {
    return withStore('readonly', (store) => store.getAll());
  },

  async updateStatus(clientEventId, syncStatus, detail = null) {
    const event = await withStore('readonly', (store) => store.get(clientEventId));
    if (!event) return null;
    const legacyStatus = {
      PENDIENTE_SINCRONIZACION: 'PENDING_SYNC',
      SINCRONIZADO: 'SYNCED',
      DUPLICADO: 'SYNCED',
      FALLIDO: 'REJECTED',
    }[syncStatus] || event.status;
    const updated = { ...event, syncStatus, status: legacyStatus, syncDetail: detail };
    await this.save(updated);
    return updated;
  },
};
