/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('bovinotech_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem('bovinotech_token') || null;
  });

  const [activeFarm, setActiveFarm] = useState(() => {
    return localStorage.getItem('bovinotech_farm') || 'FINCA-01';
  });

  const [role, setRole] = useState(() => {
    return localStorage.getItem('bovinotech_role') || null;
  });

  const login = (userData, accessToken, farm, userRole) => {
    setUser(userData);
    setToken(accessToken);
    setActiveFarm(farm);
    setRole(userRole);

    localStorage.setItem('bovinotech_user', JSON.stringify(userData));
    localStorage.setItem('bovinotech_token', accessToken);
    localStorage.setItem('bovinotech_farm', farm);
    localStorage.setItem('bovinotech_role', userRole);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setActiveFarm('FINCA-01');
    setRole(null);

    localStorage.removeItem('bovinotech_user');
    localStorage.removeItem('bovinotech_token');
    localStorage.removeItem('bovinotech_farm');
    localStorage.removeItem('bovinotech_role');
  };

  return (
    <AuthContext.Provider value={{ user, token, activeFarm, role, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
