import { useState } from 'react';

export const AttendAlertModal = ({ alert, onClose, onSave, loading }) => {
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [treatmentApplied, setTreatmentApplied] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!clinicalNotes || clinicalNotes.trim().length < 5) {
      setError('Las notas clínicas deben contener al menos 5 caracteres.');
      return;
    }
    setError(null);
    onSave({
      clinical_notes: clinicalNotes.trim(),
      treatment_applied: treatmentApplied.trim() || undefined,
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          padding: '1.5rem',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', color: '#1f2937' }}>
          Atención Clínica de Fiebre Bovina
        </h3>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#4b5563' }}>
          Bovino: <strong>{alert.sinigan_code}</strong> | Temperatura: <strong>{alert.temperature.toFixed(1)} °C</strong>
        </p>

        {error && (
          <div
            style={{
              padding: '0.5rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '4px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.25rem' }}>
              Notas Clínicas y Diagnóstico *
            </label>
            <textarea
              rows={3}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Describa el estado clínico, signos observados y evolución..."
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
              disabled={loading}
              required
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.25rem' }}>
              Tratamiento Farmacológico / Manejo Aplicado (Opcional)
            </label>
            <input
              type="text"
              value={treatmentApplied}
              onChange={(e) => setTreatmentApplied(e.target.value)}
              placeholder="Ej: Dipirona 50% 20ml IM, aislamiento en sombra..."
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
              disabled={loading}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '6px',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.5rem 1rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {loading ? 'Guardando...' : 'Confirmar Atención'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendAlertModal;
