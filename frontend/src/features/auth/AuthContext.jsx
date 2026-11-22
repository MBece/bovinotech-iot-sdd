/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from './authService';
import { CAPTURE_ROLES } from './roles';

const AuthContext = createContext(null);

const SESSION_KEY = 'bovinotech_session';
const LEGACY_KEYS = ['bovinotech_token', 'bovinotech_role', 'bovinotech_email'];
const CLOCK_TICK_MS = 60 * 1000;

/** Lee los claims del JWT sin verificar la firma (solo para la interfaz). */
const decodeClaims = (token) => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return {};
  }
};

const sessionFromToken = (token, extra = {}) => {
  const claims = decodeClaims(token);
  return {
    token,
    role: extra.role ?? claims.role ?? null,
    email: extra.email ?? claims.sub ?? null,
    farmId: extra.farmId ?? claims.farm_id ?? null,
    mustChangePassword: extra.mustChangePassword ?? Boolean(claims.pwd_change),
    // exp viene en segundos; la sesión offline dura lo mismo que el token (R2).
    expiresAt: claims.exp ? claims.exp * 1000 : null,
    farms: extra.farms ?? [],
  };
};

const loadSession = () => {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) return JSON.parse(saved);
    // Sesiones guardadas por la versión anterior del módulo.
    const legacyToken = localStorage.getItem('bovinotech_token');
    if (legacyToken) {
      return sessionFromToken(legacyToken, {
        role: localStorage.getItem('bovinotech_role'),
        email: localStorage.getItem('bovinotech_email'),
      });
    }
  } catch {
    // Almacenamiento no disponible: se inicia sin sesión.
  }
  return null;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(loadSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
      if (user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // Sin almacenamiento la sesión vive solo en memoria.
    }
  }, [user]);

  // Reloj para detectar el vencimiento de la sesión offline sin conexión.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  /**
   * Inicia sesión. Propaga AuthApiError con code FARM_SELECTION_REQUIRED
   * para que el formulario muestre el selector de finca.
   */
  const login = async (email, password, farmId = null, farms = []) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authService.login(email, password, farmId);
      const session = sessionFromToken(data.access_token, {
        role: data.role,
        email,
        farmId: data.farm_id,
        mustChangePassword: data.must_change_password,
        farms,
      });
      setUser(session);
      setNow(Date.now());
      return session;
    } catch (err) {
      if (err.code !== 'FARM_SELECTION_REQUIRED') {
        setError(err.message || 'Error de autenticación');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authService.changePassword(user.token, currentPassword, newPassword);
      const session = sessionFromToken(data.access_token, {
        role: data.role,
        email: user.email,
        farmId: data.farm_id,
        mustChangePassword: data.must_change_password,
        farms: user.farms,
      });
      setUser(session);
      setNow(Date.now());
      return session;
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setError(null);
  };

  const role = user?.role || null;
  const sessionExpired = Boolean(user?.expiresAt && now >= user.expiresAt);
  // El vencimiento no bloquea la captura (constitución §5.4); solo exige
  // verificar el autor al sincronizar (FR-013).
  const canCapture = Boolean(user && !user.mustChangePassword && CAPTURE_ROLES.includes(role));
  const captureNeedsAuthorVerification = canCapture && sessionExpired;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        role,
        farmId: user?.farmId ?? null,
        farms: user?.farms ?? [],
        mustChangePassword: Boolean(user?.mustChangePassword),
        sessionExpiresAt: user?.expiresAt ?? null,
        sessionExpired,
        canCapture,
        captureNeedsAuthorVerification,
        loading,
        error,
        login,
        changePassword,
        logout,
        setError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};

export default AuthContext;
