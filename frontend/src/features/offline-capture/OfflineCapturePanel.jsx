import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { CaptureForm } from './CaptureForm.jsx';
import { createLegacySource, importLegacyEvents } from './legacyImport.js';
import { PendingTray } from './PendingTray.jsx';
import { captureRepository, catalogRepository, catalogService } from './captureServices.js';
import { createCaptureSaver } from './saveCapture.js';
import { styles } from './styles.js';

/** Offline capture of sanitary events (HU-02). Visible only to capture roles. */
export function OfflineCapturePanel() {
  const { user, farmId, canCapture, captureNeedsAuthorVerification } = useAuth();
  const [animals, setAnimals] = useState([]);
  const [catalogStatus, setCatalogStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [storageError, setStorageError] = useState(false);
  const saver = useMemo(() => createCaptureSaver({ repository: captureRepository }), []);

  const catalog = useMemo(() => new Set(animals.map((animal) => animal.din)), [animals]);
  const session = useMemo(
    () => ({
      authorEmail: user?.email,
      farmId,
      authorVerificationPending: captureNeedsAuthorVerification,
    }),
    [user?.email, farmId, captureNeedsAuthorVerification],
  );

  const loadCatalog = useCallback(async () => {
    if (farmId == null) return;
    try {
      setAnimals(await catalogRepository.listByFarm(farmId));
    } catch {
      setAnimals([]);
    }
  }, [farmId]);

  const loadEvents = useCallback(async () => {
    try {
      setEvents(await captureRepository.getAll());
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);

  // Copy the preliminary capture pending events once, then show the tray (FR-019).
  useEffect(() => {
    if (!canCapture || farmId == null || !user?.email) return;
    (async () => {
      try {
        await importLegacyEvents({
          source: createLegacySource(),
          repository: captureRepository,
          session: { authorEmail: user.email, farmId },
        });
      } catch {
        // The legacy copy never blocks the capture (§5.4).
      }
      await loadEvents();
    })();
  }, [canCapture, farmId, user?.email, loadEvents]);

  // Local copy first; refresh from the server only when there is connection.
  useEffect(() => {
    if (!canCapture || farmId == null) return undefined;
    let cancelled = false;
    (async () => {
      await loadCatalog();
      if (!navigator.onLine || !user?.token) return;
      const result = await catalogService.refresh(user.token, farmId);
      if (cancelled) return;
      setCatalogStatus(result.updated ? 'updated' : 'stale');
      if (result.updated) await loadCatalog();
    })();
    return () => {
      cancelled = true;
    };
  }, [canCapture, farmId, user?.token, loadCatalog]);

  if (!canCapture) return null;

  return (
    <section style={styles.card} aria-labelledby="offline-capture-title">
      <div style={styles.headingRow}>
        <div>
          <span style={styles.eyebrow}>Captura en campo · funciona sin conexión</span>
          <h2 id="offline-capture-title" style={styles.title}>
            Registrar evento sanitario
          </h2>
        </div>
        <span style={styles.counter}>{animals.length} animales disponibles sin conexión</span>
      </div>

      <p style={styles.context}>
        Finca activa: <strong>{farmId ?? 'sin finca'}</strong>. El evento se guarda en este dispositivo
        con la hora actual y se sincroniza cuando haya conexión.
      </p>

      {captureNeedsAuthorVerification && (
        <p role="status" style={styles.warning}>
          Su sesión sin conexión venció. Puede seguir registrando; los eventos quedarán pendientes de
          verificación de autor hasta que inicie sesión con conexión.
        </p>
      )}
      {catalogStatus === 'stale' && (
        <p style={styles.muted}>No se pudo actualizar el catálogo; se usa la última copia guardada.</p>
      )}

      {storageError && (
        <p role="alert" style={styles.error}>
          No se pudo leer el almacenamiento del dispositivo. Revise el espacio disponible.
        </p>
      )}

      <CaptureForm animals={animals} catalog={catalog} saver={saver} session={session} onSaved={loadEvents} />

      <PendingTray events={events} authorEmail={user?.email} farmId={farmId} />
    </section>
  );
}
