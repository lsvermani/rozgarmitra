/**
 * Live-location payload builder for the auth endpoints.
 *
 * The Activity Logs page has a "Live location" column that is meant to show
 * where a sign-in actually happened. The backend has always supported it -
 * `services/auditService.js` stores `liveLocation` on every sign-in and
 * sign-out row - but the value is only present when the client sends it, and
 * the web login screens were not sending it. Every entry therefore recorded
 * `liveLocation: null` and the column rendered an em dash.
 *
 * The coordinates come from `LocationContext`, which is the same value the
 * little location pill in the header shows: GPS reverse-geocoded by the
 * backend, falling back to IP detection. Both of those responses already carry
 * `latitude` / `longitude`, so nothing new has to be requested here.
 */

/** Guards against a provider that answered but returned a placeholder position. */
function isUsable(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // 0,0 is "null island" - what a failed geocode degrades to, not a real place.
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * Converts a `LocationContext` location into the body field the API expects.
 * Returns null when there is nothing trustworthy to send, which lets the
 * backend record the entry without coordinates instead of storing a bogus 0,0.
 */
export function toLiveLocation(location) {
  if (!location) return null;

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!isUsable(latitude, longitude)) return null;

  const payload = {
    latitude,
    longitude,
    capturedAt: new Date().toISOString(),
  };

  // How this point was obtained, so the audit trail can tell a real device fix
  // from a city-level IP guess. Taken from the value the backend reported, and
  // otherwise derived from which detector produced it - never assumed to be GPS.
  if (['gps', 'city'].includes(location.precision)) {
    payload.precision = location.precision;
  } else if (location.source === 'gps') {
    payload.precision = 'gps';
  } else if (location.source === 'ip') {
    payload.precision = 'city';
  }

  // Only present for GPS fixes; an IP-derived point has no accuracy figure.
  const accuracy = Number(location.accuracy);
  if (Number.isFinite(accuracy) && accuracy > 0) payload.accuracy = Math.round(accuracy);

  // The place the coordinates fall in, so an administrator reads "Ludhiana,
  // Punjab" rather than having to look up a lat/lng pair. Sent only when the
  // geocoder actually produced a name - empty strings are left off entirely, so
  // the backend records an unnamed spot rather than a blank that looks like an
  // answer.
  for (const [field, ...sources] of [
    ['city', location.city, location.locality],
    ['state', location.state, location.region],
    ['country', location.country],
  ]) {
    const value = sources.map((v) => String(v ?? '').trim()).find(Boolean);
    if (value) payload[field] = value.slice(0, 120);
  }

  return payload;
}