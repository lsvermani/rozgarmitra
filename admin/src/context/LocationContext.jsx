import { useCallback, useEffect, useState } from 'react';
import { locationApi } from '../api/client';
import { LocationContext } from './useLocation';

const STORAGE_KEY = 'rm_public_location';

/**
 * Bumped whenever the shape or meaning of the cached value changes.
 *
 * Version 1 predates the removal of the hardcoded fallback city, so any visitor
 * still holding one has "Delhi Cantt" sitting in localStorage - a fabricated
 * place that would otherwise be read back forever, because a populated cache
 * stops `detect()` from ever running again. Discarding unversioned entries
 * forces a fresh, real internet lookup on the next visit.
 */
const CACHE_VERSION = 2;

/**
 * Read a previously detected location so the header paints instantly on repeat
 * visits. Entries written by an older cache version are dropped rather than
 * trusted, so a stale or fabricated place can never be shown again.
 */
function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.label) return null;
    if (parsed.v !== CACHE_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
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
    const next = { ...data, label, source, v: CACHE_VERSION };
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
          // `accuracy` is carried through to the auth request, where the backend
          // stores it next to the coordinates on the audit row.
          (position) => resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
        );
      });
      if (coords) {
        try {
          const res = await locationApi.reverse(coords.lat, coords.lng);
          if (res.data?.success && res.data.location) {
            applyLocation({ ...res.data.location, accuracy: coords.accuracy }, 'gps');
            return;
          }
        } catch {
          /* fall through to IP detection */
        }
      }
    }

    // 3. IP-based detection, resolved by the backend through a real internet
    // lookup. It answers `location: null` when nothing can be resolved - there
    // is no built-in default city - so an unknown location ends up as an honest
    // "unavailable" rather than an invented one.
    try {
      const res = await locationApi.detect();
      if (res.data?.location) {
        applyLocation(
          {
            ...res.data.location,
            precision: res.data.precision,
            viaServerEgress: res.data.viaServerEgress,
          },
          'ip',
        );
      } else setStatus('error');
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

