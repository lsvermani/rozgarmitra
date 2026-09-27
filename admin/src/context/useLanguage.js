import { createContext, useContext } from 'react';

/**
 * Language list, context object and hook live outside LanguageContext.jsx so that
 * file only exports a component (Vite Fast Refresh boundary).
 */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'mr', label: 'Marathi' },
  { code: 'bh', label: 'Bihari' },
  { code: 'bho', label: 'Bhojpuri' },
  { code: 'ne', label: 'Nepali' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'te', label: 'Telugu' },
];

export const LanguageContext = createContext(null);

export function useLanguage() {
  return useContext(LanguageContext);
}
