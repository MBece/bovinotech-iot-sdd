// Local animal catalog per farm (FR-009, research R7).
import { CATALOG_STORE } from './captureDbSchema.js';
import { normalizeDin } from './eventValidation.js';

export const createCatalogRepository = (store) => ({
  /** Replaces the farm's animals in a single transaction. */
  replaceFarm(farmId, animals, downloadedAt) {
    const rows = animals.map((animal) => ({
      farmId,
      din: normalizeDin(animal.din),
      name: animal.name,
      downloadedAt,
    }));
    return store.replaceAllInIndex(CATALOG_STORE, 'byFarm', farmId, rows);
  },

  async listByFarm(farmId) {
    const rows = await store.getAllFromIndex(CATALOG_STORE, 'byFarm', farmId);
    return rows.sort((a, b) => a.din.localeCompare(b.din));
  },

  async findByDin(farmId, din) {
    return (await store.get(CATALOG_STORE, [farmId, normalizeDin(din)])) ?? null;
  },
});
