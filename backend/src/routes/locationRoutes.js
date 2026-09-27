const express = require('express');
const router = express.Router();

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
        locality: locality || city || 'Current Area',
        city: city || locality || '',
        state,
        pincode,
        address: address || [locality, city, state].filter(Boolean).join(', '),
        latitude: lat,
        longitude: lng,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Detect location from client IP address.
 * GET /api/location/detect
 */
router.get('/detect', async (req, res, next) => {
  try {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (clientIp.includes(',')) {
      clientIp = clientIp.split(',')[0].trim();
    }
    // Remove IPv6 wrapper if present
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.substring(7);
    }

    const isLocal = !clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.');

    let location = {
      locality: 'Delhi Cantt',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110010',
      address: 'Delhi Cantt, New Delhi, Delhi',
      latitude: 28.5961,
      longitude: 77.1539,
    };

    if (!isLocal) {
      try {
        const ipRes = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,message,country,regionName,city,zip,lat,lon`, {
          signal: AbortSignal.timeout(4000),
        });
        if (ipRes.ok) {
          const data = await ipRes.json();
          if (data.status === 'success') {
            location = {
              locality: data.city || '',
              city: data.city || '',
              state: data.regionName || '',
              pincode: data.zip || '',
              address: `${data.city}, ${data.regionName}`,
              latitude: data.lat,
              longitude: data.lon,
            };
          }
        }
      } catch (e) {
        // Keep default fallback
      }
    }

    res.json({
      success: true,
      location,
      ip: isLocal ? 'localhost' : clientIp,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

