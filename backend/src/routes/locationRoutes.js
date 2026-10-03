const express = require('express');
const router = express.Router();

/** How long any single outbound geolocation call may take. */
const LOOKUP_TIMEOUT_MS = 4000;

/**
 * Normalises the caller's address.
 *
 * `x-forwarded-for` carries a comma-separated chain when a proxy sits in front,
 * and Node reports IPv4-mapped IPv6 as "::ffff:127.0.0.1". Both have to be
 * flattened to a bare address before anything can be looked up.
 */
function clientAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = (forwarded ? String(forwarded).split(',')[0].trim() : '') || req.socket.remoteAddress || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip.trim();
}

/**
 * True when an address cannot be geolocated on its own: loopback, link-local,
 * or one of the RFC1918 / RFC4193 private ranges (plus the CGNAT range).
 *
 * These must never be sent to a provider - they answer "reserved range", which
 * is how a hardcoded placeholder used to creep back in.
 */
function isPrivateAddress(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip === '127.0.0.1') return true;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip) || /^fe80:/i.test(ip)) return true;
  // Carrier-grade NAT, 100.64.0.0/10.
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  return false;
}

/**
 * IP geolocation providers, tried in order until one answers.
 *
 * All HTTPS. The previous call went to a plain-HTTP ip-api.com URL, which sent
 * the visitor's IP address across the network unencrypted.
 *
 * Calling a provider *without* an IP makes it geolocate its own caller. That is
 * how a request arriving from localhost or a private LAN address is handled: we
 * ask the internet where this machine's traffic actually emerges from, which is
 * a real answer rather than an invented one.
 */
const IP_PROVIDERS = [
  {
    name: 'ipwho.is',
    url: (ip) => (ip ? `https://ipwho.is/${ip}` : 'https://ipwho.is/'),
    read: (d) => {
      if (!d || d.success === false) return null;
      return {
        ip: d.ip,
        city: d.city,
        region: d.region,
        country: d.country,
        postal: d.postal,
        lat: d.latitude,
        lng: d.longitude,
      };
    },
  },
  {
    name: 'ipapi.co',
    url: (ip) => (ip ? `https://ipapi.co/${ip}/json/` : 'https://ipapi.co/json/'),
    read: (d) => {
      if (!d || d.error) return null;
      return {
        ip: d.ip,
        city: d.city,
        region: d.region,
        country: d.country_name,
        postal: d.postal,
        lat: d.latitude,
        lng: d.longitude,
      };
    },
  },
];

/**
 * Looks an address up, returning null when no provider can answer.
 *
 * Deliberately returns nothing rather than a default: a wrong-but-plausible
 * city is far worse than no location at all when the value ends up in an audit
 * trail that an administrator reads as fact.
 */
async function geolocateIp(ip) {
  for (const provider of IP_PROVIDERS) {
    try {
      const response = await fetch(provider.url(ip), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (!response.ok) continue;

      const place = provider.read(await response.json());
      // A provider can answer 200 while meaning "I don't know this range", so
      // the coordinates are checked rather than trusted.
      if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) continue;

      return { ...place, provider: provider.name };
    } catch {
      // Timeout or DNS failure - fall through to the next provider.
    }
  }
  return null;
}

/** Shapes a provider result into the location payload the UI consumes. */
function toLocation(place) {
  const latitude = Number(place.lat);
  const longitude = Number(place.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // 0,0 is what a failed lookup degrades to - not a real position.
  if (latitude === 0 && longitude === 0) return null;

  const city = String(place.city || '').trim();
  const region = String(place.region || '').trim();
  const country = String(place.country || '').trim();

  return {
    locality: city,
    city,
    state: region,
    country,
    pincode: String(place.postal || '').trim(),
    address: [city, region, country].filter(Boolean).join(', '),
    latitude,
    longitude,
  };
}

/**
 * Reverse geocode coordinates (lat, lng) to human-readable locality, city, state, and pincode.
 * GET /api/location/reverse?lat=28.6139&lng=77.2090
 */
router.get('/reverse', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'Valid lat and lng query parameters are required.' });
    }

    let locality = '';
    let city = '';
    let state = '';
    let pincode = '';
    let address = '';

    // First attempt: BigDataCloud reverse geocoding (specialized for locality detection)
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const response = await fetch(bdcUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        locality = data.locality || data.localityInfo?.administrative?.[2]?.name || '';
        city = data.city || data.localityInfo?.administrative?.[1]?.name || '';
        state = data.principalSubdivision || '';
        pincode = data.postcode || '';
        address = [locality, city, state].filter(Boolean).join(', ');
      }
    } catch (e) {
      // Fallback to OpenStreetMap Nominatim below
    }

    // Fallback: OpenStreetMap Nominatim
    if (!locality && !city) {
      try {
        const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const response = await fetch(osmUrl, {
          headers: {
            'User-Agent': 'Rozgarmitra-Backend/1.0 (contact@rozgarmitra.local)',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json();
          const addr = data.address || {};
          locality = addr.suburb || addr.neighbourhood || addr.residential || addr.city_district || addr.quarter || addr.village || addr.town || '';
          city = addr.city || addr.town || addr.municipality || addr.county || '';
          state = addr.state || '';
          pincode = addr.postcode || '';
          address = data.display_name || [locality, city, state].filter(Boolean).join(', ');
        }
      } catch (e) {
        // Continue with whatever was found
      }
    }

    res.json({
      success: true,
      location: {
        // Left empty rather than filled with an invented name when reverse
        // geocoding finds nothing: the coordinates below are the caller's real
        // GPS fix, so the place itself is simply unknown. The client renders its
        // own generic label instead of a fabricated locality.
        locality: locality || city,
        city: city || locality,
        state,
        pincode,
        address: address || [locality, city, state].filter(Boolean).join(', '),
        latitude: lat,
        longitude: lng,
        // Carried through to the audit row, so a GPS fix is never presented as
        // if it had the precision of something more exact.
        precision: 'gps',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Detect the caller's location from the internet, via their public IP.
 * GET /api/location/detect
 *
 * There is deliberately no built-in default city here. This endpoint's result
 * is stored on audit rows and shown to an administrator as where a sign-in
 * happened, so returning an invented address would put fiction into the audit
 * trail. When nothing can be resolved it reports `location: null` and the client
 * shows "Location unavailable" instead.
 */
router.get('/detect', async (req, res, next) => {
  try {
    const address = clientAddress(req);
    const isPrivate = isPrivateAddress(address);

    // A private or loopback address cannot be geolocated, so we ask the
    // providers to geolocate *us* instead: they see this machine's public egress
    // address. That is a genuine internet lookup - the closest honest answer
    // available for a visitor who has not granted GPS permission.
    const place = await geolocateIp(isPrivate ? null : address);
    const location = place ? toLocation(place) : null;

    if (!location) {
      return res.json({
        success: false,
        message: 'Could not determine a location from the internet.',
        location: null,
        ip: address || null,
        source: null,
        precision: null,
      });
    }

    res.json({
      success: true,
      location,
      ip: address || null,
      // Lets the client - and the audit trail - tell an IP-level answer apart
      // from a real GPS fix, instead of presenting both as equally exact.
      source: 'ip',
      precision: 'city',
      // True when these coordinates describe this server's egress rather than
      // the visitor's own machine.
      viaServerEgress: isPrivate,
      provider: place.provider,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

