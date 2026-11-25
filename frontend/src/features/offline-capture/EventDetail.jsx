import { describeSyncState, FailedEventDetail } from '../offline-sync';
import { buildEventDetail } from './eventDetailModel.js';
import { styles } from './styles.js';

const BADGE_BY_KIND = {
  sync: styles.syncBadge,
  validation: styles.validationBadge,
  author: styles.authorBadge,
};

/** Read-only detail with both states as explicit text (FR-012, FR-016). */
export function EventDetail({ event, syncState, onClose }) {
  const detail = buildEventDetail(event, { syncLabelOf: () => describeSyncState(syncState).label });

  return (
    <article style={styles.detail} aria-labelledby={`detail-${detail.clientEventId}`}>
      <h4 id={`detail-${detail.clientEventId}`} style={{ margin: 0, fontSize: 17 }}>
        {detail.typeLabel} · {detail.animalLabel}
      </h4>
      <p style={styles.itemMeta}>Capturado: {detail.capturedAtLabel}</p>
      {detail.legacyLabel && <span style={styles.legacyBadge}>{detail.legacyLabel}</span>}

      <dl style={styles.detailGrid}>
        {detail.states.map((state) => (
          <div key={state.kind} style={{ display: 'contents' }}>
            <dt style={styles.detailLabel}>{state.title}</dt>
            <dd style={{ margin: 0 }}>
              <span style={BADGE_BY_KIND[state.kind]}>{state.label}</span>
            </dd>
          </div>
        ))}
        {detail.fields.map((field) => (
          <div key={field.label} style={{ display: 'contents' }}>
            <dt style={styles.detailLabel}>{field.label}</dt>
            <dd style={{ margin: 0 }}>{field.value}</dd>
          </div>
        ))}
        <dt style={styles.detailLabel}>Identificador</dt>
        <dd style={{ margin: 0, fontSize: 13, wordBreak: 'break-all' }}>{detail.clientEventId}</dd>
      </dl>
      <FailedEventDetail state={syncState} />

      <p style={styles.muted}>
        Los eventos no se pueden editar ni borrar. Las correcciones se registran como un evento nuevo
        vinculado.
      </p>
      <button type="button" onClick={onClose} style={styles.secondaryButton}>
        Cerrar detalle
      </button>
    </article>
  );
}
