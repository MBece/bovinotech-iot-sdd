import { useState } from 'react';
import { useAuth } from './AuthContext';

export const LoginForm = () => {
  const { login, loading, error, setError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor complete todos los campos');
      return;
    }

    try {
      await login(email, password);
    } catch {
      // El error ya es capturado y seteado en AuthContext
    }
  };

  const handlePreload = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Iniciar Sesión</h2>
      <p style={styles.subtitle}>Plataforma Ganadera BovinoTech IoT</p>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label htmlFor="email" style={styles.label}>
            Correo Electrónico
          </label>
          <input
            id="email"
            type="email"
            placeholder="ejemplo@bovinotech.co"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={styles.input}
            required
          />
        </div>

        <div style={styles.formGroup}>
          <label htmlFor="password" style={styles.label}>
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            style={styles.input}
            required
          />
        </div>

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
        </button>
      </form>

      {import.meta.env.DEV && (
        <div style={styles.demoSection}>
          <p style={styles.demoLabel}>Acceso rápido de prueba (Solo Desarrollo):</p>
          <div style={styles.demoButtons}>
            <button
              type="button"
              style={styles.demoBtn}
              onClick={() => handlePreload('operario@bovinotech.co', 'password123')}
            >
              Operario
            </button>
            <button
              type="button"
              style={styles.demoBtn}
              onClick={() => handlePreload('vet@bovinotech.co', 'password123')}
            >
              Veterinario
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  card: {
    maxWidth: '420px',
    margin: '2rem auto',
    padding: '2rem',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  title: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.75rem',
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
  },
  subtitle: {
    margin: '0 0 1.5rem 0',
    fontSize: '0.9rem',
    textAlign: 'center',
    color: '#6b7280',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    textAlign: 'left',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#10b981',
    color: '#ffffff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    padding: '0.75rem',
    borderRadius: '8px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    textAlign: 'center',
  },
  demoSection: {
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'center',
  },
  demoLabel: {
    margin: '0 0 0.5rem 0',
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  demoButtons: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
  },
  demoBtn: {
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#f8fafc',
    color: '#334155',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
};

export default LoginForm;
