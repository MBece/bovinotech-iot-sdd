import { useState } from 'react';
import { formStyles as styles } from './formStyles';

/**
 * Selección de la finca activa para usuarios con varias fincas (US1/AC8).
 * Para cambiar de finca después hay que cerrar sesión y volver a entrar.
 */
export const FarmSelector = ({ farms, loading, onSelect, onCancel }) => {
  const [farmId, setFarmId] = useState(farms[0]?.id ?? '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (farmId !== '') onSelect(Number(farmId));
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <p style={styles.subtitle}>
        Su cuenta tiene varias fincas asignadas. Elija con cuál desea operar en esta sesión.
      </p>
      <div style={styles.formGroup}>
        <label htmlFor="farm" style={styles.label}>
          Finca
        </label>
        <select
          id="farm"
          value={farmId}
          onChange={(e) => setFarmId(e.target.value)}
          disabled={loading}
          style={styles.input}
        >
          {farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={loading} style={styles.button}>
        {loading ? 'Ingresando...' : 'Ingresar a esta finca'}
      </button>
      <button type="button" onClick={onCancel} disabled={loading} style={styles.secondaryButton}>
        Volver
      </button>
    </form>
  );
};

export default FarmSelector;
