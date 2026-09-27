import { createContext, useContext } from 'react';

/**
 * Context object + hook live outside AuthContext.jsx so that file only exports a
 * component (Vite Fast Refresh boundary). The provider imports the context from here.
 */
export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}
