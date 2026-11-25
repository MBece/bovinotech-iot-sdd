import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimalRecordForm, ParentLinkForm } from './ParentLinkForm.jsx';
import { MatingEvaluation } from './MatingEvaluation.jsx';
import { TreeExplorer } from './PedigreeTree.jsx';
import {
  ANIMAL_WRITE_ROLES,
  ASSESSMENT_ROLES,
  LINK_CAPTURE_ROLES,
  LINK_CURATION_ROLES,
} from './genealogyConstants.js';
import { createGenealogyCache } from './genealogyCache.js';
import { createGenealogyOfflineQueue } from './genealogyOfflineQueue.js';
import { genealogyService, sendQueuedGenealogyPayload } from './genealogyService.js';
import { ownerScope, sessionOwner } from './genealogySession.js';
import './genealogy.css';

/**
 * Local data (queue and cache) is partitioned by the session owner (user +
 * active farm, from the token). The inner view is keyed by that scope so a
 * session change never reuses another session's state.
 */
export function GenealogyView({ token, role }) {
  const owner = useMemo(() => sessionOwner(token), [token]);
  const scope = ownerScope(owner) ?? 'sin-sesion';
  return <GenealogySession key={scope} token={token} role={role} owner={owner} />;
}

function GenealogySession({ token, role, owner }) {
  const queue = useMemo(() => createGenealogyOfflineQueue({ owner }), [owner]);
  const cache = useMemo(() => {
    const instance = createGenealogyCache({ scope: ownerScope(owner) });
    instance.claim();
    return instance;
  }, [owner]);
  const canCaptureLinks = LINK_CAPTURE_ROLES.includes(role) && Boolean(owner);
  const canRegisterAnimals = ANIMAL_WRITE_ROLES.includes(role) && Boolean(owner);
  const canCurate = LINK_CURATION_ROLES.includes(role);
  const canAssess = ASSESSMENT_ROLES.includes(role);
  const tabs = useMemo(
    () =>
      [
        { id: 'tree', label: 'Árbol' },
        canCaptureLinks && { id: 'register', label: 'Registrar' },
        canAssess && { id: 'mating', label: 'Evaluar cruce' },
      ].filter(Boolean),
    [canCaptureLinks, canAssess],
  );
  const [tab, setTab] = useState(tabs[0]?.id ?? null);
  const [animals, setAnimals] = useState(() => {
    const cached = cache.read('animals', 'all')?.data;
    return Array.isArray(cached) ? cached : [];
  });
  const [pending, setPending] = useState(() => queue.pendingCount());
  const [foreign, setForeign] = useState(() => queue.foreignCount());
  const [rejected, setRejected] = useState(() => queue.listRejected());
  const [corrupt] = useState(() => queue.hasCorruptData());
  const [syncMessage, setSyncMessage] = useState(null);
  const [correctionTarget, setCorrectionTarget] = useState(null);

  const storeAnimals = useCallback(
    (items) => {
      setAnimals(items);
      cache.write('animals', 'all', items);
    },
    [cache],
  );

  const refreshAnimals = useCallback(async () => {
    try {
      const { items } = await genealogyService.listAnimals({}, token);
      storeAnimals(items);
    } catch {
      // Offline: keep this session's cached animals for local pre-validation.
    }
  }, [token, storeAnimals]);

  const synchronize = useCallback(async () => {
    try {
      const result = await queue.synchronize((payload) => sendQueuedGenealogyPayload(payload, token));
      if (result.paused === 'AUTH') {
        setSyncMessage(
          'Sincronización en pausa: la sesión expiró o no tiene permiso. Los registros se conservan; vuelva a iniciar sesión para enviarlos.',
        );
      } else if (result.remaining > 0) {
        setSyncMessage('Sin conexión o servidor no disponible: los registros siguen pendientes en el dispositivo.');
      } else {
        setSyncMessage(`Sincronización completa: ${result.synced} enviados, ${result.rejected} rechazados.`);
      }
      if (result.synced > 0) await refreshAnimals();
    } catch (error) {
      setSyncMessage(error.message);
    }
    setPending(queue.pendingCount());
    setForeign(queue.foreignCount());
    setRejected(queue.listRejected());
  }, [queue, token, refreshAnimals]);

  useEffect(() => {
    let active = true;
    genealogyService
      .listAnimals({}, token)
      .then(({ items }) => {
        if (active) storeAnimals(items);
      })
      .catch(() => {});
    const onOnline = () => synchronize();
    globalThis.addEventListener?.('online', onOnline);
    return () => {
      active = false;
      globalThis.removeEventListener?.('online', onOnline);
    };
  }, [token, synchronize, storeAnimals]);

  const onQueued = () => {
    setPending(queue.pendingCount());
    setCorrectionTarget(null);
    if (globalThis.navigator?.onLine !== false) synchronize();
  };

  return (
    <section className="genealogy" aria-labelledby="genealogy-title">
      <header className="genealogy-header">
        <h2 id="genealogy-title">🧬 Genealogía y consanguinidad</h2>
        <div className="genealogy-sync">
          <span className="genealogy-badge" aria-live="polite">
            Pendientes de sincronizar: <strong>{pending}</strong>
          </span>
          <button type="button" className="genealogy-btn" onClick={synchronize} disabled={!owner}>
            Sincronizar ahora
          </button>
        </div>
      </header>
      {syncMessage && <p className="genealogy-hint" role="status">{syncMessage}</p>}
      {!owner && (
        <p className="genealogy-error" role="alert">
          La sesión no tiene una finca activa: solo se permite la consulta.
        </p>
      )}
      {foreign > 0 && (
        <p className="genealogy-hint" role="status">
          Hay {foreign} registro(s) capturados en este dispositivo por otro usuario o en otra finca.
          Solo se enviarán cuando esa misma sesión vuelva a iniciar.
        </p>
      )}
      {corrupt && (
        <p className="genealogy-error" role="alert">
          Se encontró información local dañada de genealogía; se apartó sin borrarla y la vista
          continúa funcionando. Avise a soporte si faltan registros.
        </p>
      )}

      {tabs.length > 0 && (
        <div className="genealogy-tabs" role="tablist" aria-label="Secciones de genealogía">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className="genealogy-tab"
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'tree' && (
        <TreeExplorer
          token={token}
          cache={cache}
          canCurate={canCurate}
          onCorrect={(link) => {
            setCorrectionTarget(link);
            setTab('register');
          }}
        />
      )}

      {tab === 'register' && canCaptureLinks && (
        <div className="genealogy-grid">
          <ParentLinkForm
            animals={animals}
            queue={queue}
            correctionTarget={correctionTarget}
            onCancelCorrection={() => setCorrectionTarget(null)}
            onQueued={onQueued}
          />
          {canRegisterAnimals && <AnimalRecordForm queue={queue} onQueued={onQueued} />}
          {role === 'OPERARIO' && (
            <p className="genealogy-hint">
              Los vínculos que registre quedarán pendientes de validación veterinaria.
            </p>
          )}
        </div>
      )}

      {tab === 'mating' && canAssess && <MatingEvaluation token={token} animals={animals} cache={cache} />}

      {rejected.length > 0 && (
        <section className="genealogy-card genealogy-rejected" aria-labelledby="genealogy-rejected-title">
          <h3 id="genealogy-rejected-title">Rechazados al sincronizar ({rejected.length})</h3>
          <ul>
            {rejected.map((item) => (
              <li key={item.client_event_id}>
                <strong>{item.error.message}</strong>{' '}
                <span className="genealogy-hint">
                  ({item.error.code}) · {item.payload.body?.offspringDin ?? item.payload.body?.din ?? ''}{' '}
                  {item.payload.body?.parentDin ? `← ${item.payload.body.parentDin}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
