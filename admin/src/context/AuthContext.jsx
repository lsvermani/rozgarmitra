import { useState } from 'react';
import { AuthContext } from './useAuth';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('rm_admin_user');
    return stored ? JSON.parse(stored) : null;
  });

  const login = (token, userData) => {
    const pendingName = localStorage.getItem('rm_pending_name');
    const resolvedUser = {
      ...userData,
      name: userData.name || pendingName || '',
    };
    localStorage.setItem('rm_admin_token', token);
    localStorage.setItem('rm_admin_user', JSON.stringify(resolvedUser));
    localStorage.removeItem('rm_pending_name');
    setUser(resolvedUser);
  };

  const logout = () => {
    localStorage.removeItem('rm_admin_token');
    localStorage.removeItem('rm_admin_user');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

