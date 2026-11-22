import { useState } from 'react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginForm } from './features/auth/LoginForm';
import { authService } from './features/auth/authService';
import { SiniganAnimalLookup } from './features/sinigan/SiniganAnimalLookup';
import { SiniganReconciliation } from './features/sinigan-sync/SiniganReconciliation';
import { OfflineSanitaryCapture } from './features/sanitary-events/OfflineSanitaryCapture';
import { SanitaryHistory } from './features/sanitary-events/SanitaryHistory';
import { ChangePasswordForm } from './features/auth/ChangePasswordForm';
import { SessionStatusBanner } from './features/auth/SessionStatusBanner';
import { UserAdminPanel } from './features/auth/UserAdminPanel';
import { roleInfo } from './features/auth/roles';
import './App.css';

function Dashboard() {
  const { user, role, logout } = useAuth();
  const [testMessage, setTestMessage] = useState(null);
  const [testError, setTestError] = useState(null);
  const [loadingTest, setLoadingTest] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const handleTestVetEndpoint = async () => {
    setLoadingTest(true);
    setTestMessage(null);
    setTestError(null);
    try {
      const res = await authService.testVetOnly(user.token);
      setTestMessage(res.message || 'Acceso concedido exitosamente');
    } catch (err) {
      setTestError(err.message || 'Error de acceso');
    } finally {
      setLoadingTest(false);
    }
  };

  return (
    <div style={dashboardStyles.container}>
      <header style={dashboardStyles.header}>
        <div>
          <h1 style={dashboardStyles.brand}>BovinoTech IoT</h1>
          <p style={dashboardStyles.userTag}>
            Usuario: <strong>{user?.email || 'Autenticado'}</strong> | Rol:{' '}
            <span
              style={{
                ...dashboardStyles.badge,
                backgroundColor: roleInfo(role).color,
              }}
            >
              {role}
            </span>
            {user?.farmId && <> | Finca: <strong>{user.farmId}</strong></>}
          </p>
        </div>
        <button onClick={logout} style={dashboardStyles.logoutBtn}>
          Cerrar Sesión
        </button>
      </header>

      <main style={dashboardStyles.main}>
        <SessionStatusBanner />
        <section style={dashboardStyles.intro}>
          <span style={dashboardStyles.kicker}>MVP académico · trazabilidad rural</span>
          <h2 style={dashboardStyles.introTitle}>Del DIN a un evento sanitario verificable</h2>
          <p style={dashboardStyles.introText}>
            Consulte un animal por DIN, capture un evento incluso sin conexión y sincronícelo de forma idempotente cuando la API esté disponible.
          </p>
        </section>

        <div style={dashboardStyles.workflowGrid}>
          <SiniganAnimalLookup token={user.token} onAnimalSelected={setSelectedAnimal} />
          <OfflineSanitaryCapture
            token={user.token}
            userEmail={user.email}
            selectedAnimal={selectedAnimal}
            onSynchronized={() => setHistoryRefresh((value) => value + 1)}
          />
        </div>

        <SanitaryHistory
          key={selectedAnimal?.din || 'sin-animal'}
          token={user.token}
          role={role}
          selectedAnimal={selectedAnimal}
          refreshSignal={historyRefresh}
        />

        <SiniganReconciliation
          key={user.farmId ?? 'sin-finca'}
          token={user.token}
          role={role}
          farmId={user.farmId}
        />

        <div style={dashboardStyles.card}>
          <h2>Control de acceso por roles</h2>
          <p>
            Su cuenta actual posee el rol de <strong>{roleInfo(role).label}</strong>.{' '}
            {roleInfo(role).description}
          </p>

          <div style={dashboardStyles.actionBox}>
            <h3>Prueba de permisos veterinarios</h3>
            <p style={dashboardStyles.hint}>
              Haga clic para validar si el token actual tiene privilegios de Veterinario:
            </p>
            <button
              onClick={handleTestVetEndpoint}
              disabled={loadingTest}
              style={dashboardStyles.testBtn}
            >
              {loadingTest ? 'Consultando...' : 'Verificar Permisos de Veterinario'}
            </button>

            {testMessage && (
              <div style={dashboardStyles.successBox}>
                ✅ {testMessage} (Código 200 - correcto)
              </div>
            )}

            {testError && (
              <div style={dashboardStyles.errorBox}>
                🚫 {testError} (Código 403 - acceso denegado)
              </div>
            )}
          </div>
        </div>

        {role === 'ADMINISTRADOR' && <UserAdminPanel />}
      </main>
    </div>
  );
}

function MainContent() {
  const { isAuthenticated, mustChangePassword } = useAuth();
  if (isAuthenticated && mustChangePassword) return <ChangePasswordForm />;
  return isAuthenticated ? <Dashboard /> : <LoginForm />;
}

export function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}

const dashboardStyles = {
  container: {
    maxWidth: '800px',
    margin: '2rem auto',
    padding: '1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '1rem',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '2rem',
  },
  brand: {
    margin: 0,
    fontSize: '1.75rem',
    color: '#065f46',
  },
  userTag: {
    margin: '0.4rem 0 0 0',
    color: '#4b5563',
    fontSize: '0.9rem',
  },
  badge: {
    color: '#ffffff',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontWeight: '700',
  },
  logoutBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: '1px solid #ef4444',
    backgroundColor: '#ffffff',
    color: '#ef4444',
    fontWeight: '600',
    cursor: 'pointer',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  intro: {
    padding: '1.5rem',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, #0d3f30, #176b4d)',
    color: '#ffffff',
    textAlign: 'left',
  },
  kicker: {
    fontSize: '0.7rem',
    fontWeight: '800',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#bfe8d4',
  },
  introTitle: {
    margin: '0.35rem 0 0.6rem',
    color: '#ffffff',
    fontSize: '1.55rem',
  },
  introText: {
    color: '#d7eee3',
    lineHeight: '1.5',
  },
  workflowGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '1rem',
    alignItems: 'start',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    padding: '1.5rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    textAlign: 'left',
    color: '#1f2937',
  },
  actionBox: {
    marginTop: '1.5rem',
    padding: '1rem',
    borderRadius: '8px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
  },
  hint: {
    color: '#6b7280',
    fontSize: '0.875rem',
    margin: '0.5rem 0 1rem 0',
  },
  testBtn: {
    padding: '0.6rem 1.2rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontWeight: '600',
    cursor: 'pointer',
  },
  successBox: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: '#dcfce7',
    color: '#15803d',
    borderRadius: '6px',
    fontWeight: '500',
  },
  errorBox: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    borderRadius: '6px',
    fontWeight: '500',
  },
};

export default App;
