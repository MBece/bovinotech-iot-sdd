// Browser wiring of the module: one IndexedDB store shared by the repositories.
import { createCaptureRepository } from './captureRepository.js';
import { createCatalogRepository } from './catalogRepository.js';
import { createCatalogService } from './catalogService.js';
import { createIndexedDbStore } from './indexedDbStore.js';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const store = createIndexedDbStore();

export const captureRepository = createCaptureRepository(store);
export const catalogRepository = createCatalogRepository(store);
export const catalogService = createCatalogService({ repository: catalogRepository, apiUrl: API_URL });

// Volume generator, never shipped to production builds (quickstart step 11).
if (import.meta.env.DEV) {
  import('./devSeed.js').then(({ registerDevSeed }) =>
    registerDevSeed({ captureRepository, catalogRepository }),
  );
}
