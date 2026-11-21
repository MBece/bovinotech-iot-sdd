import { useState } from 'react';
import { useAuth } from './AuthContext';
import { formStyles as styles } from './formStyles';

const MIN_LENGTH = 8;

/**
 * Cambio obligatorio de la contraseña temporal en el primer inicio de sesión
 * (FR-016, US1/AC12). Hasta completarlo el usuario no puede operar.
 */
export const ChangePasswordForm = () => {
  const { changePassword, logout, loading, error, setError } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < MIN_LENGTH) {
      setError(`La contraseña nueva debe tener al menos ${MIN_LENGTH} caracteres`);
      return;
    }
    if (newPassword === currentPassword) {
      setError('La contraseña nueva debe ser distinta de la temporal');
      return;
    }
    if (newPassword !== confirmation) {
      setError('La confirmación no coincide con la contraseña nueva');
      return;
    }
    try {
      await changePassword(currentPassword, newPassword);
    } catch {
      // El error ya queda en el contexto.
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Cambie su contraseña</h2>
      <p style={styles.subtitle}>
        Su cuenta fue creada con una contraseña temporal. Defina una contraseña nueva para continuar.
      </p>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label htmlFor="current-password" style={styles.label}>
            Contraseña temporal
          </label>
          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={loading}
            style={styles.input}
            required
          />
        </div>
        <div style={styles.formGroup}>
          <label htmlFor="new-password" style={styles.label}>
            Contraseña nueva (mínimo {MIN_LENGTH} caracteres)
          </label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={loading}
            style={styles.input}
            required
          />
        </div>
        <div style={styles.formGroup}>
          <label htmlFor="confirm-password" style={styles.label}>
            Confirmar contraseña nueva
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={loading}
            style={styles.input}
            required
          />
        </div>
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Guardando...' : 'Guardar contraseña'}
        </button>
        <button type="button" onClick={logout} disabled={loading} style={styles.secondaryButton}>
          Cerrar sesión
        </button>
      </form>
    </div>
  );
};

export default ChangePasswordForm;
