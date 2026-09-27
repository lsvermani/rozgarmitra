import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/app_theme.dart';

class LocationData {
  final String locality;
  final String city;
  final String state;
  final String pincode;
  final String address;
  final double? latitude;
  final double? longitude;
  final bool isGps;

  LocationData({
    required this.locality,
    required this.city,
    this.state = '',
    this.pincode = '',
    this.address = '',
    this.latitude,
    this.longitude,
    this.isGps = false,
  });

  /// Short human-friendly label, e.g. "Koramangala, Bengaluru" or "Bengaluru"
  String get displayLocation {
    final parts = [locality, city].where((p) => p.trim().isNotEmpty).toSet().toList();
    if (parts.isNotEmpty) return parts.join(', ');
    if (address.isNotEmpty) return address;
    return 'Current Location';
  }

  Map<String, dynamic> toJson() => {
        'locality': locality,
        'city': city,
        'state': state,
        'pincode': pincode,
        'address': address.isNotEmpty ? address : displayLocation,
        'latitude': latitude,
        'longitude': longitude,
      };

  factory LocationData.fromJson(Map<String, dynamic> json, {bool isGps = false}) {
    return LocationData(
      locality: (json['locality'] ?? '').toString().trim(),
      city: (json['city'] ?? '').toString().trim(),
      state: (json['state'] ?? '').toString().trim(),
      pincode: (json['pincode'] ?? json['postcode'] ?? '').toString().trim(),
      address: (json['address'] ?? '').toString().trim(),
      latitude: json['latitude'] != null ? (json['latitude'] as num).toDouble() : null,
      longitude: json['longitude'] != null ? (json['longitude'] as num).toDouble() : null,
      isGps: isGps,
    );
  }

  @override
  String toString() => displayLocation;
}

/// Thrown when a GPS-only fix cannot be obtained.
class LocationException implements Exception {
  final String message;
  final String code; // serviceDisabled | permissionDenied | timeout | unavailable
  LocationException(this.message, {this.code = 'unavailable'});
  @override
  String toString() => message;
}

/// Service that detects device locality via GPS + internet reverse geocoding,
/// and smoothly falls back to internet IP-based locality if GPS permission is not granted.
class LocationService {
  static const String _prefKey = 'rm_cached_location';
  static LocationData? _lastKnown;

  static LocationData? get lastKnown => _lastKnown;

  /// Load cached location from local storage
  static Future<LocationData?> getCachedLocation() async {
    if (_lastKnown != null) return _lastKnown;
    try {
      final prefs = await SharedPreferences.getInstance();
      final str = prefs.getString(_prefKey);
      if (str != null) {
        _lastKnown = LocationData.fromJson(jsonDecode(str));
        return _lastKnown;
      }
    } catch (_) {}
    return null;
  }

  /// Automatically fetch current locality:
  /// 1. Tries GPS coordinates + internet reverse geocoding (BigDataCloud / OSM / Backend).
  /// 2. If GPS denied/disabled, falls back to internet IP geolocation.
  static Future<LocationData?> fetchCurrentLocation({Duration timeout = const Duration(seconds: 8)}) async {
    // 1. Try GPS location
    try {
      final gpsLocation = await _fetchFromGps(timeout);
      if (gpsLocation != null) {
        _lastKnown = gpsLocation;
        _saveToCache(gpsLocation);
        return gpsLocation;
      }
    } catch (e) {
      debugPrint('[LocationService] GPS fetch failed: $e. Falling back to internet IP geolocation.');
    }

    // 2. Fallback to Internet IP Geolocation
    try {
      final ipLocation = await _fetchFromInternetIp();
      if (ipLocation != null) {
        _lastKnown = ipLocation;
        _saveToCache(ipLocation);
        return ipLocation;
      }
    } catch (e) {
      debugPrint('[LocationService] IP geolocation fallback failed: $e');
    }

    // 3. Fallback to cached location if available
    return await getCachedLocation();
  }

  /// Attempts to get GPS position and reverse geocode over internet.
  /// Throws [LocationException] when no GPS fix can be obtained (service
  /// disabled, permission denied, timeout) — callers decide whether to show
  /// an error or fall back to cached/IP data.
  static Future<LocationData> fetchGpsLocation({Duration timeout = const Duration(seconds: 12)}) async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw LocationException(
        'Location services are off. Please turn on GPS to fetch your current location.',
        code: 'serviceDisabled',
      );
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw LocationException(
        'Location permission denied. Please allow location access to fetch your GPS location.',
        code: 'permissionDenied',
      );
    }
    if (permission == LocationPermission.deniedForever) {
      throw LocationException(
        'Location permission is permanently denied. Please enable it from App Settings to use GPS.',
        code: 'permissionDenied',
      );
    }

    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: timeout,
        ),
      );
      final loc = await reverseGeocode(pos.latitude, pos.longitude);
      _lastKnown = loc;
      _saveToCache(loc);
      return loc;
    } on TimeoutException {
      throw LocationException(
        'GPS timed out. Please move outdoors / enable High accuracy and retry.',
        code: 'timeout',
      );
    } catch (e) {
      if (e is LocationException) rethrow;
      debugPrint('[LocationService] GPS fetch failed: $e');
      throw LocationException(
        'Could not get GPS location. Please check GPS signal and retry.',
        code: 'unavailable',
      );
    }
  }

  static Future<LocationData?> _fetchFromGps(Duration timeout) async {
    try {
      return await fetchGpsLocation(timeout: timeout);
    } on LocationException {
      return null;
    }
  }

  /// Reverse geocodes coordinates (lat, lng) to locality, city, state using Internet APIs
  static Future<LocationData> reverseGeocode(double lat, double lng) async {
    // 1. Try BigDataCloud reverse geocode client API (fast, free, returns locality)
    try {
      final url = Uri.parse(
        'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=$lat&longitude=$lng&localityLanguage=en',
      );
      final res = await http.get(url).timeout(const Duration(seconds: 5));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final locality = (data['locality'] ?? '').toString().trim();
        final city = (data['city'] ?? '').toString().trim();
        final state = (data['principalSubdivision'] ?? '').toString().trim();
        final postcode = (data['postcode'] ?? '').toString().trim();

        if (locality.isNotEmpty || city.isNotEmpty) {
          return LocationData(
            locality: locality.isNotEmpty ? locality : city,
            city: city.isNotEmpty ? city : locality,
            state: state,
            pincode: postcode,
            address: [locality, city, state].where((s) => s.isNotEmpty).join(', '),
            latitude: lat,
            longitude: lng,
            isGps: true,
          );
        }
      }
    } catch (_) {}

    // 2. Try OpenStreetMap Nominatim reverse geocode
    try {
      final osmUrl = Uri.parse(
        'https://nominatim.openstreetmap.org/reverse?format=json&lat=$lat&lon=$lng&zoom=18&addressdetails=1',
      );
      final res = await http.get(osmUrl, headers: {
        'User-Agent': 'RozgarmitraApp/1.0',
      }).timeout(const Duration(seconds: 5));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final addr = (data['address'] as Map<String, dynamic>?) ?? {};
        final locality = (addr['suburb'] ??
                addr['neighbourhood'] ??
                addr['residential'] ??
                addr['city_district'] ??
                addr['quarter'] ??
                addr['village'] ??
                addr['town'] ??
                '')
            .toString()
            .trim();
        final city = (addr['city'] ?? addr['town'] ?? addr['county'] ?? '').toString().trim();
        final state = (addr['state'] ?? '').toString().trim();
        final postcode = (addr['postcode'] ?? '').toString().trim();
        final displayName = (data['display_name'] ?? '').toString().trim();

        return LocationData(
          locality: locality.isNotEmpty ? locality : (city.isNotEmpty ? city : 'Current Area'),
          city: city.isNotEmpty ? city : locality,
          state: state,
          pincode: postcode,
          address: displayName.isNotEmpty ? displayName : [locality, city].join(', '),
          latitude: lat,
          longitude: lng,
          isGps: true,
        );
      }
    } catch (_) {}

    // 3. Try Backend API reverse endpoint
    try {
      final backendUrl = Uri.parse('${AppConstants.apiBaseUrl}/location/reverse?lat=$lat&lng=$lng');
      final res = await http.get(backendUrl).timeout(const Duration(seconds: 5));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body);
        if (body['success'] == true && body['location'] != null) {
          return LocationData.fromJson(body['location'], isGps: true);
        }
      }
    } catch (_) {}

    // Fallback with coordinates
    return LocationData(
      locality: 'Current Location',
      city: '',
      latitude: lat,
      longitude: lng,
      isGps: true,
    );
  }

  /// Automatically fetch location from Internet IP Geolocation
  static Future<LocationData?> _fetchFromInternetIp() async {
    // Try backend detect endpoint first
    try {
      final backendUrl = Uri.parse('${AppConstants.apiBaseUrl}/location/detect');
      final res = await http.get(backendUrl).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body);
        if (body['success'] == true && body['location'] != null) {
          return LocationData.fromJson(body['location'], isGps: false);
        }
      }
    } catch (_) {}

    // Try direct public IP-API
    try {
      final res = await http.get(Uri.parse('http://ip-api.com/json/?fields=status,city,regionName,zip,lat,lon')).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['status'] == 'success') {
          final city = (data['city'] ?? '').toString();
          final state = (data['regionName'] ?? '').toString();
          return LocationData(
            locality: city,
            city: city,
            state: state,
            pincode: (data['zip'] ?? '').toString(),
            address: '$city, $state',
            latitude: (data['lat'] as num?)?.toDouble(),
            longitude: (data['lon'] as num?)?.toDouble(),
            isGps: false,
          );
        }
      }
    } catch (_) {}

    return null;
  }

  static Future<void> _saveToCache(LocationData loc) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefKey, jsonEncode(loc.toJson()));
    } catch (_) {}
  }
}

