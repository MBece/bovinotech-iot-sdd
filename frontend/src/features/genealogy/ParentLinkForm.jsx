import { useState } from 'react';
import { resolveDin, validateParentLink } from './genealogyValidation.js';

const newEventId = () => globalThis.crypto.randomUUID();

const findAnimal = (animals, din) => animals.find((animal) => animal.din === din) ?? null;

function AnimalHint({ animals, din }) {
  if (!din) return null;
  const animal = findAnimal(animals, din);
  return (
    <span className="genealogy-hint" aria-live="polite">
      {animal
        ? `${animal.din} · ${animal.name} · ${animal.sex === 'MACHO' ? 'Macho' : 'Hembra'} · ${animal.birthDate}`
        : `${din} · sin ficha en caché (el servidor validará)`}
    </span>
  );
}

/**
 * Registers (or corrects) a parent link offline-first: the link is enqueued in
 * the Offline Hub queue and the parent view synchronizes it when online.
 */
export function ParentLinkForm({ animals, queue, correctionTarget, onCancelCorrection, onQueued }) {
  const [offspringText, setOffspringText] = useState('');
  const [parentText, setParentText] = useState('');
  const [parentRole, setParentRole] = useState('SIRE');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const correcting = Boolean(correctionTarget);
  const offspringDin = correcting ? correctionTarget.offspringDin : resolveDin(offspringText);
  const role = correcting ? correctionTarget.parentRole : parentRole;
  const parentDin = resolveDin(parentText);

  const submit = (event) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!offspringDin || !parentDin) {
      setError('Indique la cría y el progenitor.');
      return;
    }
    if (correcting && !reason.trim()) {
      setError('El motivo de la corrección es obligatorio.');
      return;
    }
    const check = validateParentLink({
      offspring: findAnimal(animals, offspringDin),
      parent: findAnimal(animals, parentDin),
      parentRole: role,
    });
    if (!check.valid) {
      setError(check.message);
      return;
    }
    const clientEventId = newEventId();
    const payload = correcting
      ? {
          kind: 'LINK_CORRECTION',
          linkId: correctionTarget.id,
          body: { clientEventId, parentDin, reason: reason.trim() },
        }
      : {
          kind: 'LINK',
          body: { clientEventId, offspringDin, parentDin, parentRole: role },
        };
    try {
      queue.enqueue(payload, clientEventId);
    } catch (err) {
      setError(err.message);
      return;
    }
    setParentText('');
    setReason('');
    if (!correcting) setOffspringText('');
    setNotice('Registro guardado en el dispositivo; se sincronizará al haber conexión.');
    onQueued?.();
  };

  return (
    <form className="genealogy-card" onSubmit={submit} aria-labelledby="genealogy-link-title">
      <h3 id="genealogy-link-title">
        {correcting ? 'Corregir progenitor vigente' : 'Registrar progenitor'}
      </h3>
      {correcting ? (
        <p className="genealogy-hint">
          Cría <strong>{correctionTarget.offspringDin}</strong> ·{' '}
          {correctionTarget.parentRole === 'SIRE' ? 'Padre' : 'Madre'} actual{' '}
          <strong>{correctionTarget.parentDin}</strong>. El vínculo anterior se conserva como
          corregido.
        </p>
      ) : (
        <>
          <label className="genealogy-field">
            Cría (DIN o número)
            <input
              inputMode="numeric"
              autoComplete="off"
              value={offspringText}
              onChange={(event) => setOffspringText(event.target.value)}
              placeholder="Ej. 119"
              required
            />
          </label>
          <AnimalHint animals={animals} din={offspringDin} />
          <fieldset className="genealogy-roles">
            <legend>Rol del progenitor</legend>
            {[
              ['SIRE', 'Padre'],
              ['DAM', 'Madre'],
            ].map(([value, label]) => (
              <label key={value} className="genealogy-choice">
                <input
                  type="radio"
                  name="parentRole"
                  value={value}
                  checked={parentRole === value}
                  onChange={() => setParentRole(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </>
      )}
      <label className="genealogy-field">
        {correcting ? 'Nuevo progenitor (DIN o número)' : 'Progenitor (DIN o número)'}
        <input
          inputMode="numeric"
          autoComplete="off"
          value={parentText}
          onChange={(event) => setParentText(event.target.value)}
          placeholder="Ej. 116"
          required
        />
      </label>
      <AnimalHint animals={animals} din={parentDin} />
      {correcting && (
        <label className="genealogy-field">
          Motivo de la corrección (obligatorio)
          <textarea
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </label>
      )}
      {error && <p className="genealogy-error" role="alert">{error}</p>}
      {notice && <p className="genealogy-success" role="status">{notice}</p>}
      <div className="genealogy-actions">
        <button type="submit" className="genealogy-btn genealogy-btn--primary">
          {correcting ? 'Guardar corrección' : 'Guardar vínculo'}
        </button>
        {correcting && (
          <button type="button" className="genealogy-btn" onClick={onCancelCorrection}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

const emptyAnimal = { number: '', name: '', sex: 'HEMBRA', birthDate: '', origin: 'PROPIO' };

/** Veterinary registration of a genealogical record (offline-first). */
export function AnimalRecordForm({ queue, onQueued }) {
  const [form, setForm] = useState(emptyAnimal);
  const [notice, setNotice] = useState(null);
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const submit = (event) => {
    event.preventDefault();
    const clientEventId = newEventId();
    try {
      queue.enqueue(
      {
        kind: 'ANIMAL',
        body: {
          clientEventId,
          din: resolveDin(form.number),
          name: form.name.trim(),
          sex: form.sex,
          birthDate: form.birthDate,
          origin: form.origin,
        },
      },
      clientEventId,
      );
    } catch (err) {
      setNotice(err.message);
      return;
    }
    setForm(emptyAnimal);
    setNotice('Ficha guardada en el dispositivo; se sincronizará al haber conexión.');
    onQueued?.();
  };

  return (
    <form className="genealogy-card" onSubmit={submit} aria-labelledby="genealogy-animal-title">
      <h3 id="genealogy-animal-title">Registrar ficha genealógica</h3>
      <label className="genealogy-field">
        DIN o número
        <input inputMode="numeric" value={form.number} onChange={update('number')} required />
      </label>
      <label className="genealogy-field">
        Nombre
        <input value={form.name} maxLength={120} onChange={update('name')} required />
      </label>
      <label className="genealogy-field">
        Sexo
        <select value={form.sex} onChange={update('sex')}>
          <option value="HEMBRA">Hembra</option>
          <option value="MACHO">Macho</option>
        </select>
      </label>
      <label className="genealogy-field">
        Fecha de nacimiento
        <input type="date" value={form.birthDate} onChange={update('birthDate')} required />
      </label>
      <label className="genealogy-field">
        Origen
        <select value={form.origin} onChange={update('origin')}>
          <option value="PROPIO">Propio</option>
          <option value="EXTERNO">Reproductor externo</option>
        </select>
      </label>
      {notice && <p className="genealogy-success" role="status">{notice}</p>}
      <button type="submit" className="genealogy-btn genealogy-btn--primary">
        Guardar ficha
      </button>
    </form>
  );
}
