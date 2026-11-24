import { useState } from 'react';
import { useAuth } from './AuthContext';

export function LoginForm() {
  const { user, role, activeFarm, login, logout, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [farmId, setFarmId] = useState('FINCA-01');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, farm_id: farmId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al iniciar sesión');
      }

      const data = await response.json();
      login({ email: data.user_email }, data.access_token, data.active_farm, data.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail, demoRole, demoFarm) => {
    setEmail(demoEmail);
    setPassword('Password123!');
    setFarmId(demoFarm);
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoEmail, password: 'Password123!', farm_id: demoFarm }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error de autenticación');
      }

      const data = await response.json();
      login({ email: data.user_email }, data.access_token, data.active_farm, data.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div style={styles.card}>
        <div style={styles.sessionHeader}>
          <div>
            <span style={styles.badge}>{role}</span>
            <h3 style={styles.userName}>{user?.email}</h3>
            <p style={styles.farmInfo}>Finca Activa: <strong>{activeFarm}</strong></p>
          </div>
          <button onClick={logout} style={styles.logoutButton}>
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Iniciar Sesión — BovinoTech</h3>
      <p style={styles.subtitle}>Gestión de Identidad y Control de Acceso por Roles (RBAC)</p>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleLoginSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Correo Institucional:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="usuario@bovinotech.co"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Contraseña:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Finca de Operación:</label>
          <select value={farmId} onChange={(e) => setFarmId(e.target.value)} style={styles.select}>
            <option value="FINCA-01">FINCA-01 (La Esperanza)</option>
            <option value="FINCA-02">FINCA-02 (El Porvenir)</option>
          </select>
        </div>

        <button type="submit" disabled={loading} style={styles.primaryButton}>
          {loading ? 'Validando credenciales...' : 'Ingresar al Sistema'}
        </button>
      </form>

      <div style={styles.demoSection}>
        <span style={styles.demoLabel}>Acceso Rápido para Demostración:</span>
        <div style={styles.buttonGrid}>
          <button
            type="button"
            onClick={() => handleDemoLogin('admin@bovinotech.co', 'ADMINISTRADOR', 'FINCA-01')}
            style={styles.demoButton}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => handleDemoLogin('operario@bovinotech.co', 'OPERARIO', 'FINCA-01')}
            style={styles.demoButton}
          >
            Operario
          </button>
          <button
            type="button"
            onClick={() => handleDemoLogin('vet@bovinotech.co', 'VETERINARIO', 'FINCA-01')}
            style={styles.demoButton}
          >
            Veterinario
          </button>
          <button
            type="button"
            onClick={() => handleDemoLogin('directivo@bovinotech.co', 'DIRECTIVO', 'FINCA-01')}
            style={styles.demoButton}
          >
            Directivo
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    padding: '1.5rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    marginBottom: '1.5rem',
    border: '1px solid #e2e8f0',
  },
  sessionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#3182ce',
    color: '#ffffff',
    padding: '0.25rem 0.6rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 'bold',
  },
  userName: {
    margin: '0.5rem 0 0.2rem 0',
    fontSize: '1.1rem',
    color: '#2d3748',
  },
  farmInfo: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#718096',
  },
  logoutButton: {
    backgroundColor: '#e53e3e',
    color: '#ffffff',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: '600',
  },
  title: {
    margin: '0 0 0.25rem 0',
    fontSize: '1.25rem',
    color: '#1a202c',
  },
  subtitle: {
    margin: '0 0 1rem 0',
    fontSize: '0.85rem',
    color: '#718096',
  },
  error: {
    backgroundColor: '#fff5f5',
    color: '#c53030',
    padding: '0.75rem',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.85rem',
    border: '1px solid #feb2b2',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.8rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#4a5568',
  },
  input: {
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e0',
    fontSize: '0.9rem',
  },
  select: {
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e0',
    fontSize: '0.9rem',
    backgroundColor: '#fff',
  },
  primaryButton: {
    backgroundColor: '#2b6cb0',
    color: '#ffffff',
    border: 'none',
    padding: '0.75rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: '600',
    marginTop: '0.5rem',
  },
  demoSection: {
    marginTop: '1.25rem',
    paddingTop: '1rem',
    borderTop: '1px dashed #e2e8f0',
  },
  demoLabel: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#718096',
    marginBottom: '0.5rem',
    fontWeight: '600',
  },
  buttonGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.5rem',
  },
  demoButton: {
    backgroundColor: '#edf2f7',
    color: '#4a5568',
    border: '1px solid #cbd5e0',
    padding: '0.4rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
};
