import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { authService } from './authService';
import { ROLES, roleInfo } from './roles';

const EMPTY_FORM = { email: '', fullName: '', role: 'OPERARIO', temporaryPassword: '' };

const ACTION_LABELS = {
  USER_CREATED: 'Usuario creado',
  USER_ENABLED: 'Usuario habilitado',
  USER_DISABLED: 'Usuario deshabilitado',
  FARM_ASSIGNED: 'Finca asignada',
  PASSWORD_CHANGED: 'Contraseña cambiada',
  SYNC_REJECTED_AFTER_DISABLE: 'Eventos rechazados en sincronización',
};

const formatDate = (value) => new Date(value).toLocaleString('es-CO');

/**
 * Gestión de cuentas de la finca del administrador (FR-005, FR-006, FR-014)
 * y consulta de la auditoría, incluidos los rechazos de sincronización (FR-017).
 */
export const UserAdminPanel = () => {
  const { user } = useAuth();
  const token = user?.token;
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [farmUserEmail, setFarmUserEmail] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [userList, auditList] = await Promise.all([
        authService.listUsers(token),
        authService.getAudit(token),
      ]);
      setUsers(userList);
      setAudit(auditList);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    // Carga inicial de datos remotos; el estado se actualiza al resolver.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const run = async (action, successMessage) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      await refresh();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const created = await run(
      () => authService.createUser(token, form),
      `Cuenta creada para ${form.email}. Debe cambiar la contraseña temporal al ingresar.`,
    );
    if (created) setForm(EMPTY_FORM);
  };

  const handleToggle = (target) =>
    run(
      () => authService.setUserStatus(token, target.id, !target.is_active),
      target.is_active ? `${target.email} fue deshabilitado.` : `${target.email} fue habilitado.`,
    );

  const handleAddFarm = async (e) => {
    e.preventDefault();
    const added = await run(
      () => authService.addUserFarm(token, farmUserEmail.trim()),
      'La finca se asignó al usuario.',
    );
    if (added) setFarmUserEmail('');
  };

  const updateForm = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div style={styles.card}>
      <h2>Administración de cuentas</h2>
      <p style={styles.hint}>
        Solo puede gestionar usuarios de su finca. No existe el registro público: toda cuenta se
        crea aquí con una contraseña temporal.
      </p>

      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.section}>
        <h3>Crear usuario</h3>
        <form onSubmit={handleCreate} style={styles.grid}>
          <input
            aria-label="Correo electrónico"
            type="email"
            placeholder="Correo electrónico"
            value={form.email}
            onChange={updateForm('email')}
            required
            style={styles.input}
          />
          <input
            aria-label="Nombre completo"
            placeholder="Nombre completo"
            value={form.fullName}
            onChange={updateForm('fullName')}
            required
            style={styles.input}
          />
          <select
            aria-label="Rol"
            value={form.role}
            onChange={updateForm('role')}
            style={styles.input}
          >
            {Object.entries(ROLES).map(([value, info]) => (
              <option key={value} value={value}>
                {info.label}
              </option>
            ))}
          </select>
          <input
            aria-label="Contraseña temporal"
            type="password"
            placeholder="Contraseña temporal (mín. 8)"
            minLength={8}
            value={form.temporaryPassword}
            onChange={updateForm('temporaryPassword')}
            required
            style={styles.input}
          />
          <button type="submit" disabled={busy} style={styles.primaryBtn}>
            Crear cuenta
          </button>
        </form>
      </section>

      <section style={styles.section}>
        <h3>Usuarios de la finca</h3>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Usuario</th>
                <th style={styles.th}>Rol</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}>
                  <td style={styles.td}>{item.id}</td>
                  <td style={styles.td}>
                    {item.full_name || item.email}
                    <div style={styles.muted}>{item.email}</div>
                  </td>
                  <td style={styles.td}>{roleInfo(item.role).label}</td>
                  <td style={styles.td}>
                    {!item.is_active
                      ? 'Deshabilitado'
                      : item.must_change_password
                        ? 'Pendiente de cambio de contraseña'
                        : 'Activo'}
                  </td>
                  <td style={styles.td}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleToggle(item)}
                      style={item.is_active ? styles.dangerBtn : styles.secondaryBtn}
                    >
                      {item.is_active ? 'Deshabilitar' : 'Habilitar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.section}>
        <h3>Asignar mi finca a un veterinario o directivo de otra finca</h3>
        <form onSubmit={handleAddFarm} style={styles.inline}>
          <input
            aria-label="Correo del usuario"
            type="email"
            placeholder="Correo del usuario"
            value={farmUserEmail}
            onChange={(e) => setFarmUserEmail(e.target.value)}
            required
            style={styles.input}
          />
          <button type="submit" disabled={busy} style={styles.secondaryBtn}>
            Asignar finca
          </button>
        </form>
      </section>

      <section style={styles.section}>
        <h3>Auditoría</h3>
        {audit.length === 0 ? (
          <p style={styles.muted}>Sin registros todavía.</p>
        ) : (
          <ul style={styles.auditList}>
            {audit.map((entry) => (
              <li
                key={entry.id}
                style={
                  entry.action === 'SYNC_REJECTED_AFTER_DISABLE'
                    ? { ...styles.auditItem, ...styles.auditAlert }
                    : styles.auditItem
                }
              >
                <strong>{ACTION_LABELS[entry.action] || entry.action}</strong> · usuario{' '}
                {entry.target_user_id} · {formatDate(entry.occurred_at)}
                {entry.details && <div style={styles.muted}>{entry.details}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

const styles = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    padding: '1.5rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    textAlign: 'left',
    color: '#1f2937',
  },
  hint: { color: '#6b7280', fontSize: '0.875rem' },
  section: { marginTop: '1.5rem' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.6rem',
  },
  inline: { display: 'flex', gap: '0.6rem', flexWrap: 'wrap' },
  input: {
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    padding: '0.6rem 1rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    fontWeight: '600',
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#f8fafc',
    color: '#334155',
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    border: '1px solid #ef4444',
    backgroundColor: '#ffffff',
    color: '#ef4444',
    cursor: 'pointer',
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: { textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #e5e7eb' },
  td: { padding: '0.5rem', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' },
  muted: { color: '#6b7280', fontSize: '0.8rem' },
  auditList: { listStyle: 'none', padding: 0, margin: 0 },
  auditItem: {
    padding: '0.5rem',
    borderBottom: '1px solid #f3f4f6',
    fontSize: '0.85rem',
  },
  auditAlert: { backgroundColor: '#fef3c7' },
  success: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
    padding: '0.75rem',
    borderRadius: '6px',
    marginTop: '1rem',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    padding: '0.75rem',
    borderRadius: '6px',
    marginTop: '1rem',
  },
};

export default UserAdminPanel;
