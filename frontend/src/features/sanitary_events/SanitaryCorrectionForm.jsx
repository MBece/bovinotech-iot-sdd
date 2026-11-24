import { useState } from 'react';

const toLocalDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const createClientEventId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
};

export function SanitaryCorrectionForm({ event, saving, onCancel, onSave }) {
  const [eventType, setEventType] = useState(event.eventType);
  const [occurredAt, setOccurredAt] = useState(() =>
    toLocalDateTime(event.fieldOccurredAt),
  );
  const [dose, setDose] = useState(event.dose ?? '');
  const [notes, setNotes] = useState(event.notes ?? '');
  const [reason, setReason] = useState('');
  const [withdrawalUntil, setWithdrawalUntil] = useState('');
  const [formError, setFormError] = useState('');

  const submit = (submitEvent) => {
    submitEvent.preventDefault();
    if (!reason.trim()) {
      setFormError('El motivo de la corrección es obligatorio.');
      return;
    }
    setFormError('');
    onSave({
      clientEventId: createClientEventId(),
      eventType,
      fieldOccurredAt: new Date(occurredAt).toISOString(),
      dose: dose === '' ? null : Number(dose),
      notes: notes.trim() || null,
      reason: reason.trim(),
      withdrawalUntil: withdrawalUntil
        ? new Date(withdrawalUntil).toISOString()
        : null,
    });
  };

  return (
    <form className="sanitary-correction-form" onSubmit={submit}>
      <h3>Nueva anotación de corrección</h3>
      <label>
        Tipo de evento
        <select value={eventType} onChange={(change) => setEventType(change.target.value)}>
          <option value="VACCINATION">Vacunación</option>
          <option value="TREATMENT">Tratamiento</option>
          <option value="CHECKUP">Chequeo</option>
        </select>
      </label>
      <label>
        Fecha del evento
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(change) => setOccurredAt(change.target.value)}
          required
        />
      </label>
      <label>
        Dosis
        <input
          type="number"
          min="0.01"
          step="any"
          inputMode="decimal"
          value={dose}
          onChange={(change) => setDose(change.target.value)}
        />
      </label>
      <label>
        Observación
        <textarea value={notes} onChange={(change) => setNotes(change.target.value)} />
      </label>
      <label>
        Motivo obligatorio
        <textarea
          value={reason}
          onChange={(change) => setReason(change.target.value)}
          maxLength={500}
          required
        />
      </label>
      <label>
        Vigencia del tiempo de retiro (si aplica)
        <input
          type="datetime-local"
          value={withdrawalUntil}
          onChange={(change) => setWithdrawalUntil(change.target.value)}
        />
      </label>
      {formError && <p className="sanitary-error" role="alert">{formError}</p>}
      <div className="sanitary-form-actions">
        <button type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Anexar corrección'}
        </button>
      </div>
    </form>
  );
}
