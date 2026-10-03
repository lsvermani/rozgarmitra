import { useState } from 'react';
import { AuthContext } from './useAuth';
import { authApi } from '../api/client';
import { useLocation } from './useLocation';
import { toLiveLocation } from '../utils/liveLocation';
import { clearPendingNames, getPendingName } from '../utils/pendingName';

export function AuthProvider({ children }) {
  const { location } = useLocation();
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('rm_admin_user');
    return stored ? JSON.parse(stored) : null;
  });

  const login = (token, userData) => {
    // Fall back only to the name pending for THIS role, never the other role's.
    const pendingName = userData.role ? getPendingName(userData.role) : '';
    const resolvedUser = {
      ...userData,
      name: userData.name || pendingName || '',
    };
    localStorage.setItem('rm_admin_token', token);
    localStorage.setItem('rm_admin_user', JSON.stringify(resolvedUser));
    clearPendingNames();
    setUser(resolvedUser);
  };

  const logout = () => {
    // Record the sign-out for the audit trail. Fire-and-forget: the local
    // session is cleared immediately either way, so a slow or failed request
    // must never leave the user stuck signed in.
    const token = localStorage.getItem('rm_admin_token');
    if (token) authApi.logout(token, toLiveLocation(location)).catch(() => {});
    localStorage.removeItem('rm_admin_token');
    localStorage.removeItem('rm_admin_user');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

