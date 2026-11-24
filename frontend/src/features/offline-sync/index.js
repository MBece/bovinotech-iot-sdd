// Public surface of the offline-sync module (contracts/offline-sync-api.md §2).
export { OfflineSyncProvider } from './OfflineSyncProvider.jsx';
export { useSyncStatus } from './useSyncStatus.js';
export { syncStateRepository } from './syncServices.js';
export { SyncStatusBadge } from './SyncStatusBadge.jsx';
export { SyncNowButton } from './SyncNowButton.jsx';
export { FailedEventDetail } from './FailedEventDetail.jsx';
export { describeSyncState, countUnconfirmed } from './syncStateLabels.js';
