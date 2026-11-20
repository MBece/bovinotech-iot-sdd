export const FeverAlertCard = ({ alert, onAttendClick, canAttend }) => {
  const isCritical = alert.severity === 'CRITICAL';
  const isAttended = alert.status === 'ATTENDED';

  return (
    <div
      style={{
        border: isAttended ? '1px solid #10b981' : isCritical ? '2px solid #ef4444' : '1px solid #d1d5db',
        backgroundColor: isAttended ? '#f0fdf4' : isCritical ? '#fef2f2' : '#ffffff',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span
            style={{
              fontWeight: 'bold',
              fontSize: '1.1rem',
              color: isAttended ? '#166534' : isCritical ? '#991b1b' : '#1f2937',
            }}
          >
            🚨 Alerta de Fiebre: {alert.sinigan_code}
          </span>
          <span
            style={{
              marginLeft: '0.75rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: '700',
              backgroundColor: isAttended ? '#22c55e' : '#ef4444',
              color: '#ffffff',
            }}
          >
            {alert.status === 'ACTIVE' ? 'ACTIVA (CRÍTICA)' : 'ATENDIDA'}
          </span>
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#b91c1c' }}>
          🌡️ {alert.temperature.toFixed(1)} °C
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
        <p style={{ margin: '0.2rem 0' }}>
          <strong>Collar IoT:</strong> {alert.collar_id} |{' '}
          <strong>Detectado:</strong> {new Date(alert.detected_at).toLocaleString()}
        </p>
      </div>

      {alert.attentions && alert.attentions.length > 0 && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem',
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            border: '1px solid #bbf7d0',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ fontWeight: '600', color: '#15803d', marginBottom: '0.25rem' }}>
            🩺 Historial de Atención Veterinaria (Append-Only):
          </div>
          {alert.attentions.map((att) => (
            <div key={att.id} style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: '#4b5563' }}>
                [{new Date(att.attended_at).toLocaleTimeString()}] {att.veterinarian_email}:
              </span>{' '}
              <strong>{att.clinical_notes}</strong>
              {att.treatment_applied && (
                <span style={{ color: '#0369a1' }}> | Tx: {att.treatment_applied}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!isAttended && canAttend && (
        <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
          <button
            onClick={() => onAttendClick(alert)}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.4rem 0.8rem',
              fontWeight: '600',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Registrar Atención Clínica
          </button>
        </div>
      )}
    </div>
  );
};

export default FeverAlertCard;
