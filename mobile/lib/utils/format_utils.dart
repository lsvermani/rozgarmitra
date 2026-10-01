/// Small formatting helpers shared across job/location UI.
library;

/// Human-friendly distance label: metres below 1 km, one decimal above.
String formatDistance(double km) {
  if (km < 1) return '${(km * 1000).round()} m away';
  return '${km.toStringAsFixed(1)} km away';
}

/// Local, human-readable date + time used for connection and audit timestamps
/// (`2026-10-01 14:05:30`).
String formatTimestamp(DateTime value) {
  final local = value.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)} '
      '${two(local.hour)}:${two(local.minute)}:${two(local.second)}';
}

