/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from './authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedToken = localStorage.getItem('bovinotech_token');
    const savedRole = localStorage.getItem('bovinotech_role');
    const savedEmail = localStorage.getItem('bovinotech_email');
    if (savedToken && savedRole) {
      return { token: savedToken, role: savedRole, email: savedEmail };
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      localStorage.setItem('bovinotech_token', user.token);
      localStorage.setItem('bovinotech_role', user.role);
      if (user.email) {
        localStorage.setItem('bovinotech_email', user.email);
      }
    } else {
      localStorage.removeItem('bovinotech_token');
      localStorage.removeItem('bovinotech_role');
      localStorage.removeItem('bovinotech_email');
    }
  }, [user]);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authService.login(email, password);
      const authUser = {
        token: data.access_token,
        role: data.role,
        email: email,
      };
      setUser(authUser);
      return authUser;
    } catch (err) {
      const msg = err.message || 'Error de autenticación';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        role: user?.role || null,
        loading,
        error,
        login,
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
