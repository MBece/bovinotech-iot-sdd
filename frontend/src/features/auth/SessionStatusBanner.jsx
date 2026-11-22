import { useAuth } from './AuthContext';

/**
 * Aviso de sesión offline vencida (FR-013, research.md R9). La captura sigue
 * permitida, pero lo capturado queda pendiente de verificación de autor.
 */
export const SessionStatusBanner = () => {
  const { captureNeedsAuthorVerification } = useAuth();
  if (!captureNeedsAuthorVerification) return null;

  return (
    <div role="status" style={styles.banner}>
      <strong>Sesión offline vencida.</strong> Puede seguir capturando eventos, pero quedarán
      pendientes de verificación de autor hasta que inicie sesión de nuevo con conexión.
    </div>
  );
};

const styles = {
  banner: {
    padding: '0.9rem 1rem',
    borderRadius: '8px',
    backgroundColor: '#fef3c7',
    border: '1px solid #f59e0b',
    color: '#92400e',
    fontSize: '0.9rem',
    textAlign: 'left',
  },
};

export default SessionStatusBanner;
