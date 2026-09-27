/// Small formatting helpers shared across job/location UI.
library;

/// Human-friendly distance label: metres below 1 km, one decimal above.
String formatDistance(double km) {
  if (km < 1) return '${(km * 1000).round()} m away';
  return '${km.toStringAsFixed(1)} km away';
}
