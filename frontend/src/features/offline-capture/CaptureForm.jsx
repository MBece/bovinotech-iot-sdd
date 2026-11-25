import { useState } from 'react';
import { AnimalSearch } from './AnimalSearch.jsx';
import { DOSE_UNITS, EVENT_TYPES, FIELD_LABELS, fieldsForType } from './eventTypes.js';
import { ERROR_FIELDS, ERROR_MESSAGES } from './eventValidation.js';
import { mergeStyles, styles } from './styles.js';

const emptyDetails = { product: '', doseQuantity: '', doseUnit: '', reason: '', finding: '', notes: '' };

/**
 * Capture form (FR-001, FR-015). There is no time field: the event takes the
 * device instant when saved (FR-006).
 */
export function CaptureForm({ animals, catalog, saver, session, onSaved }) {
  const [eventType, setEventType] = useState('VACCINATION');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(emptyDetails);
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const visibleFields = fieldsForType(eventType);

  const updateDetail = (name) => (event) => setDetails((current) => ({ ...current, [name]: event.target.value }));

  const handleQueryChange = (value) => {
    setQuery(value);
    setSelected(null);
  };

  const handleSelect = (animal) => {
    setSelected(animal);
    setQuery(animal.din);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await saver.save({
        form: { eventType, din: selected?.din ?? query, ...details },
        session,
        catalog,
        animal: selected,
      });
      if (result.busy) return;
      if (!result.ok) {
        const errors = {};
        const general = [];
        for (const code of result.errors) {
          const field = ERROR_FIELDS[code];
          const shown = field === 'din' || field === 'notes' || visibleFields.includes(field);
          if (shown) errors[field] ??= ERROR_MESSAGES[code];
          else general.push(ERROR_MESSAGES[code]);
        }
        setFieldErrors(errors);
        if (general.length) setMessage({ type: 'error', text: general.join(' ') });
        return;
      }
      setFieldErrors({});
      setDetails(emptyDetails);
      setQuery('');
      setSelected(null);
      setMessage({
        type: 'success',
        text: 'Evento guardado en el dispositivo. Queda pendiente de sincronización y de validación veterinaria.',
      });
      onSaved?.(result.event);
    } finally {
      setSaving(false);
    }
  };

  const textInput = (name, { multiline = false } = {}) => {
    const error = fieldErrors[name];
    const Tag = multiline ? 'textarea' : 'input';
    return (
      <>
        <label htmlFor={`offline-capture-${name}`} style={styles.label}>
          {FIELD_LABELS[name]}
          {name === 'notes' ? ' (opcional)' : ''}
        </label>
        <Tag
          id={`offline-capture-${name}`}
          value={details[name]}
          onChange={updateDetail(name)}
          maxLength={name === 'notes' ? 500 : undefined}
          rows={multiline ? 3 : undefined}
          aria-invalid={Boolean(error)}
          style={mergeStyles(styles.input, error && styles.inputError)}
        />
        {error && (
          <span role="alert" style={styles.fieldError}>
            {error}
          </span>
        )}
      </>
    );
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form} noValidate>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={styles.label}>Tipo de evento</legend>
        <div style={styles.typeGroup}>
          {EVENT_TYPES.map((type) => (
            <button
              key={type.code}
              type="button"
              aria-pressed={eventType === type.code}
              onClick={() => {
                setEventType(type.code);
                setFieldErrors({});
              }}
              style={mergeStyles(styles.typeButton, eventType === type.code && styles.typeButtonActive)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </fieldset>

      <AnimalSearch
        animals={animals}
        query={query}
        selected={selected}
        onQueryChange={handleQueryChange}
        onSelect={handleSelect}
        error={fieldErrors.din}
      />

      {visibleFields.includes('product') && textInput('product')}

      {visibleFields.includes('doseQuantity') && (
        <div style={styles.doseRow}>
          <div>
            <label htmlFor="offline-capture-doseQuantity" style={styles.label}>
              {FIELD_LABELS.doseQuantity}
            </label>
            <input
              id="offline-capture-doseQuantity"
              type="text"
              inputMode="decimal"
              value={details.doseQuantity}
              onChange={updateDetail('doseQuantity')}
              aria-invalid={Boolean(fieldErrors.doseQuantity)}
              style={mergeStyles(styles.input, fieldErrors.doseQuantity && styles.inputError)}
            />
            {fieldErrors.doseQuantity && (
              <span role="alert" style={styles.fieldError}>
                {fieldErrors.doseQuantity}
              </span>
            )}
          </div>
          <div>
            <label htmlFor="offline-capture-doseUnit" style={styles.label}>
              {FIELD_LABELS.doseUnit}
            </label>
            <select
              id="offline-capture-doseUnit"
              value={details.doseUnit}
              onChange={updateDetail('doseUnit')}
              aria-invalid={Boolean(fieldErrors.doseUnit)}
              style={mergeStyles(styles.input, fieldErrors.doseUnit && styles.inputError)}
            >
              <option value="">Elegir…</option>
              {DOSE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            {fieldErrors.doseUnit && (
              <span role="alert" style={styles.fieldError}>
                {fieldErrors.doseUnit}
              </span>
            )}
          </div>
        </div>
      )}

      {visibleFields.includes('reason') && textInput('reason')}
      {visibleFields.includes('finding') && textInput('finding', { multiline: true })}
      {textInput('notes', { multiline: true })}

      <button
        type="submit"
        disabled={saving}
        style={mergeStyles(styles.primaryButton, saving && styles.disabled)}
      >
        {saving ? 'Guardando…' : 'Guardar evento'}
      </button>

      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'} style={message.type === 'error' ? styles.error : styles.success}>
          {message.text}
        </div>
      )}
    </form>
  );
}
