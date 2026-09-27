import { useCallback, useEffect, useState } from 'react';
import { locationApi } from '../api/client';
import { LocationContext } from './useLocation';

const STORAGE_KEY = 'rm_public_location';

/** Read a previously detected location so the header paints instantly on repeat visits. */
function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.label ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the visitor's live locality:
 *  1. cached value from localStorage (instant paint)
 *  2. browser GPS -> backend reverse geocode (precise)
 *  3. backend IP-based detection (works without GPS permission)
 */
export function LocationProvider({ children }) {
  const [location, setLocation] = useState(readCache);
  const [status, setStatus] = useState(location ? 'ready' : 'idle');

  const applyLocation = useCallback((data, source) => {
    if (!data) return;
    const parts = [data.locality, data.city].filter((part) => part && String(part).trim());
    const label = [...new Set(parts)].join(', ') || data.address || data.state || 'Current location';
    const next = { ...data, label, source };
    setLocation(next);
    setStatus('ready');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable (private mode) — location still works for this session */
    }
  }, []);

  const detect = useCallback(async () => {
    setStatus('loading');

    // 2. Browser GPS, reverse geocoded by the backend.
    if (navigator.geolocation) {
      const coords = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
        );
      });
      if (coords) {
        try {
          const res = await locationApi.reverse(coords.lat, coords.lng);
          if (res.data?.success && res.data.location) {
            applyLocation(res.data.location, 'gps');
            return;
          }
        } catch {
          /* fall through to IP detection */
        }
      }
    }

    // 3. IP-based detection.
    try {
      const res = await locationApi.detect();
      if (res.data?.location) applyLocation(res.data.location, 'ip');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  }, [applyLocation]);

  useEffect(() => {
    if (!location) detect();
    // Detect once on first mount; the button re-runs it on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LocationContext.Provider value={{ location, status, detect }}>
      {children}
    </LocationContext.Provider>
  );
}

