import { useEffect, useMemo, useState } from 'react';
import { describeSyncState, useSyncStatus } from '../offline-sync';
import { EventDetail } from './EventDetail.jsx';
import { buildPendingTray } from './pendingTrayModel.js';
import { styles } from './styles.js';

/** Pending tray of the user in the active farm, newest first (FR-011). */
export function PendingTray({ events, authorEmail, farmId }) {
  const [openId, setOpenId] = useState(null);
  // Real sync state from HU-03 (offline-sync), refreshed when events change.
  const { statusMap, refresh } = useSyncStatus();
  useEffect(() => {
    refresh();
  }, [events.length, refresh]);
  const items = useMemo(
    () =>
      buildPendingTray(events, {
        authorEmail,
        farmId,
        syncLabelOf: (event) => describeSyncState(statusMap.get(event.clientEventId)).label,
      }),
    [events, authorEmail, farmId, statusMap],
  );
  const eventsById = useMemo(
    () => new Map(events.map((event) => [event.clientEventId, event])),
    [events],
  );

  return (
    <section style={styles.section} aria-labelledby="pending-tray-title">
      <h3 id="pending-tray-title" style={styles.sectionTitle}>
        Eventos en este dispositivo ({items.length})
      </h3>
      {items.length === 0 ? (
        <p style={styles.muted}>Aún no hay eventos capturados en esta finca.</p>
      ) : (
        <ul style={styles.list}>
          {items.map((item) => (
            <li key={item.clientEventId}>
              <button
                type="button"
                style={styles.item}
                aria-expanded={openId === item.clientEventId}
                onClick={() => setOpenId(openId === item.clientEventId ? null : item.clientEventId)}
              >
                <span>
                  <strong>{item.typeLabel}</strong> · {item.animalLabel}
                  <span style={{ ...styles.itemMeta, display: 'block' }}>Capturado: {item.capturedAtLabel}</span>
                </span>
                <span style={styles.badges}>
                  <span style={styles.syncBadge}>{item.syncLabel}</span>
                  <span style={styles.validationBadge}>{item.validationLabel}</span>
                  {item.authorLabel && <span style={styles.authorBadge}>{item.authorLabel}</span>}
                  {item.legacyLabel && <span style={styles.legacyBadge}>{item.legacyLabel}</span>}
                </span>
              </button>
              {openId === item.clientEventId && eventsById.has(item.clientEventId) && (
                <EventDetail
                  event={eventsById.get(item.clientEventId)}
                  syncState={statusMap.get(item.clientEventId)}
                  onClose={() => setOpenId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
