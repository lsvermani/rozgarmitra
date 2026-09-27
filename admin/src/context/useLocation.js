import { createContext, useContext } from 'react';

/**
 * Context object + hook live outside LocationContext.jsx so that file only exports
 * a component (Vite Fast Refresh boundary). The provider imports the context from here.
 */
export const LocationContext = createContext(null);

export function useLocation() {
  return useContext(LocationContext);
}
