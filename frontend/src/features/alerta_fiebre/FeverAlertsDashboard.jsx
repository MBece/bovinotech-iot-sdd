import { useState, useEffect, useCallback } from 'react';
import { alertaFiebreService } from './services/alertaFiebreService';
import { offlineQueueService } from './services/offlineQueueService';
import { FeverAlertCard } from './components/FeverAlertCard';
import { AttendAlertModal } from './components/AttendAlertModal';

export const FeverAlertsDashboard = ({ token, userRole }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [savingAttention, setSavingAttention] = useState(false);

  // Simulador de telemetría para pruebas en vivo
  const [simTemperature, setSimTemperature] = useState('39.8');
  const [simSinigan, setSimSinigan] = useState('CO-BOV-1024');
  const [simCollar, setSimCollar] = useState('COL-08');
  const [simMessage, setSimMessage] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  // Cola offline
  const [queueCount, setQueueCount] = useState(offlineQueueService.getQueue().length);

  const fetchAlerts = useCallback(async () => {
    if (!token || userRole !== 'VETERINARIO') return;
    setLoading(true);
    setError(null);
    try {
      const data = await alertaFiebreService.getAlerts(token);
      setAlerts(data);
    } catch (err) {
      setError(err.message || 'Error al cargar alertas');
    } finally {
      setLoading(false);
    }
  }, [token, userRole]);

  useEffect(() => {
    let isMounted = true;
    if (token && userRole === 'VETERINARIO') {
      alertaFiebreService
        .getAlerts(token)
        .then((data) => {
          if (isMounted) setAlerts(data);
        })
        .catch((err) => {
          if (isMounted) setError(err.message || 'Error al cargar alertas');
        });
    }
    return () => {
      isMounted = false;
    };
  }, [token, userRole]);

  const handleSendSimulatedTelemetry = async (forceOffline = false) => {
    setSimLoading(true);
    setSimMessage(null);
    const telemetry = {
      client_event_id: crypto.randomUUID(),
      collar_id: simCollar,
      sinigan_code: simSinigan,
      body_temperature: parseFloat(simTemperature),
      measured_at: new Date().toISOString(),
    };

    if (forceOffline) {
      offlineQueueService.enqueue(telemetry);
      setQueueCount(offlineQueueService.getQueue().length);
      setSimMessage('Telemetría guardada en la cola offline local.');
      setSimLoading(false);
      return;
    }

    try {
      const res = await alertaFiebreService.sendTelemetry(telemetry);
      setSimMessage(`Telemetría procesada (${res.processing_time_ms.toFixed(1)}ms): ${res.message}`);
      if (res.alert_generated) {
        fetchAlerts();
      }
    } catch (err) {
      // Fallback a cola offline si falla la conexión
      offlineQueueService.enqueue(telemetry);
      setQueueCount(offlineQueueService.getQueue().length);
      setSimMessage(`Error de red. Telemetría resguardada en cola offline: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const handleSyncOfflineQueue = async () => {
    setSimLoading(true);
    try {
      const res = await offlineQueueService.syncQueue((item) =>
        alertaFiebreService.sendTelemetry(item)
      );
      setQueueCount(offlineQueueService.getQueue().length);
      setSimMessage(`Sincronización completada: ${res.synced} sincronizados, ${res.failed} fallidos.`);
      fetchAlerts();
    } catch (err) {
      setSimMessage(`Error al sincronizar cola: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const handleAttendAlert = async (attentionData) => {
    if (!selectedAlert) return;
    setSavingAttention(true);
    try {
      await alertaFiebreService.attendAlert(selectedAlert.id, attentionData, token);
      setSelectedAlert(null);
      await fetchAlerts();
    } catch (err) {
      alert(`Error al guardar atención: ${err.message}`);
    } finally {
      setSavingAttention(false);
    }
  };

  return (
    <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#111827' }}>Monitoreo Telemétrico de Fiebre Bovina (HU-06)</h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            Detección automática de cuadros febriles (&gt; 39.5 °C) con soporte de cola offline y resolución append-only.
          </p>
        </div>
        {userRole === 'VETERINARIO' && (
          <button
            onClick={fetchAlerts}
            disabled={loading}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            {loading ? 'Actualizando...' : '🔄 Actualizar Alertas'}
          </button>
        )}
      </div>

      {/* Simulador de Telemetría IoT */}
      <div style={{ padding: '1rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>Simulador de Collar IoT</h4>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.75rem', display: 'block', color: '#6b7280' }}>Código SINIGÁN</label>
            <input
              type="text"
              value={simSinigan}
              onChange={(e) => setSimSinigan(e.target.value)}
              style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #d1d5db', width: '130px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', display: 'block', color: '#6b7280' }}>Collar ID</label>
            <input
              type="text"
              value={simCollar}
              onChange={(e) => setSimCollar(e.target.value)}
              style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #d1d5db', width: '90px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', display: 'block', color: '#6b7280' }}>Temperatura (°C)</label>
            <input
              type="number"
              step="0.1"
              value={simTemperature}
              onChange={(e) => setSimTemperature(e.target.value)}
              style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #d1d5db', width: '90px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              onClick={() => handleSendSimulatedTelemetry(false)}
              disabled={simLoading}
              style={{
                backgroundColor: parseFloat(simTemperature) > 39.5 ? '#dc2626' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.8rem',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.85rem',
              }}
            >
              Emitir Lectura IoT {parseFloat(simTemperature) > 39.5 ? '(Fiebre)' : '(Normal)'}
            </button>
            <button
              onClick={() => handleSendSimulatedTelemetry(true)}
              disabled={simLoading}
              style={{
                backgroundColor: '#f59e0b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.8rem',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.85rem',
              }}
            >
              Simular Captura Offline
            </button>
          </div>
        </div>

        {simMessage && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#047857' }}>
            {simMessage}
          </div>
        )}

        {queueCount > 0 && (
          <div style={{ marginTop: '0.75rem', padding: '0.5rem', backgroundColor: '#fffbeb', borderRadius: '4px', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#b45309' }}>
              ⚠️ Hay <strong>{queueCount}</strong> lecturas pendientes en la cola offline local.
            </span>
            <button
              onClick={handleSyncOfflineQueue}
              disabled={simLoading}
              style={{
                backgroundColor: '#d97706',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '0.3rem 0.6rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Sincronizar Cola Ahora
            </button>
          </div>
        )}
      </div>

      {/* Lista de Alertas */}
      {userRole === 'VETERINARIO' ? (
        <div>
          <h4 style={{ margin: '0 0 1rem 0', color: '#374151' }}>
            Alertas Sanitarias Críticas ({alerts.filter((a) => a.status === 'ACTIVE').length} Activas)
          </h4>
          {error && <div style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</div>}
          {alerts.length === 0 && !loading && (
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>No hay alertas de fiebre registradas.</p>
          )}
          {alerts.map((alert) => (
            <FeverAlertCard
              key={alert.id}
              alert={alert}
              canAttend={userRole === 'VETERINARIO'}
              onAttendClick={(a) => setSelectedAlert(a)}
            />
          ))}
        </div>
      ) : (
        <div style={{ padding: '1rem', backgroundColor: '#e0f2fe', borderRadius: '6px', color: '#0369a1', fontSize: '0.9rem' }}>
          ℹ️ La visualización clínica de alertas críticas y registro de atenciones está reservada al personal <strong>Veterinario</strong>. Como Operario, sus lecturas de campo generan alertas en segundo plano para el equipo clínico.
        </div>
      )}

      {selectedAlert && (
        <AttendAlertModal
          alert={selectedAlert}
          loading={savingAttention}
          onClose={() => setSelectedAlert(null)}
          onSave={handleAttendAlert}
        />
      )}
    </div>
  );
};

export default FeverAlertsDashboard;
