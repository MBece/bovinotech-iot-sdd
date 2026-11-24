import { useState } from 'react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginForm } from './features/auth/LoginForm';
import { SiniganAnimalLookup } from './features/sinigan/SiniganAnimalLookup';
import { OfflineSanitaryCapture } from './features/sanitary-events/OfflineSanitaryCapture';
import { SanitaryHistory } from './features/sanitary-events/SanitaryHistory';
import './App.css';

function Dashboard() {
  const { user, token, role, activeFarm, isAuthenticated } = useAuth();
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  return (
    <div style={dashboardStyles.container}>
      <header style={dashboardStyles.header}>
        <div>
          <h1 style={dashboardStyles.brand}>BovinoTech IoT</h1>
          <p style={dashboardStyles.userTag}>
            Usuario: <strong>{isAuthenticated ? `${user?.email} (${role})` : 'No autenticado'}</strong>
            {isAuthenticated && ` · Finca: ${activeFarm}`}
          </p>
        </div>
      </header>

      <LoginForm />

      <main style={dashboardStyles.main}>
        <section style={dashboardStyles.intro}>
          <span style={dashboardStyles.kicker}>MVP académico · trazabilidad rural</span>
          <h2 style={dashboardStyles.introTitle}>Del DIN a un evento sanitario verificable</h2>
          <p style={dashboardStyles.introText}>
            Consulte un animal por DIN, capture un evento incluso sin conexión y sincronícelo de forma idempotente cuando la API esté disponible.
          </p>
        </section>

        <div style={dashboardStyles.workflowGrid}>
          <SiniganAnimalLookup token={token} onAnimalSelected={setSelectedAnimal} />
          <OfflineSanitaryCapture
            token={token}
            userEmail={user?.email || "operario@bovinotech.co"}
            selectedAnimal={selectedAnimal}
            onSynchronized={() => setHistoryRefresh((value) => value + 1)}
          />
        </div>

        <SanitaryHistory
          key={selectedAnimal?.din || 'sin-animal'}
          token={token}
          role={role || "OPERARIO"}
          selectedAnimal={selectedAnimal}
          refreshSignal={historyRefresh}
        />
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Dashboard />
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
};

export default App;
