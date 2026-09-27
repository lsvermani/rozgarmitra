class JobLocation {
  final String address;
  final String locality;
  final String city;
  final String state;
  final String pincode;
  final double? latitude;
  final double? longitude;

  JobLocation({
    required this.address,
    required this.city,
    this.locality = '',
    this.state = '',
    this.pincode = '',
    this.latitude,
    this.longitude,
  });

  /// Human-friendly display, prioritizing locality then city
  String get displayLocation {
    final parts = [locality, city].where((s) => s.trim().isNotEmpty).toSet().toList();
    if (parts.isNotEmpty) return parts.join(', ');
    if (address.isNotEmpty) return address;
    return 'Location not specified';
  }

  factory JobLocation.fromJson(Map<String, dynamic>? json) {
    if (json == null) return JobLocation(address: '', city: '');
    return JobLocation(
      address: (json['address'] ?? '').toString().trim(),
      locality: (json['locality'] ?? '').toString().trim(),
      city: (json['city'] ?? '').toString().trim(),
      state: (json['state'] ?? '').toString().trim(),
      pincode: (json['pincode'] ?? '').toString().trim(),
      latitude: json['latitude'] != null ? (json['latitude'] as num).toDouble() : null,
      longitude: json['longitude'] != null ? (json['longitude'] as num).toDouble() : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'address': address,
        'locality': locality,
        'city': city,
        'state': state,
        'pincode': pincode,
        'latitude': latitude,
        'longitude': longitude,
      };
}

class Job {
  final String id;
  final String title;
  final String description;
  final String category;
  final List<String> requiredSkills;
  final int workersRequired;
  final int workersSelected;
  final DateTime date;
  final String startTime;
  final String endTime;
  final String duration;
  final num payment;
  final String paymentUnit;
  final JobLocation location;
  final String status;
  final int applicationsCount;
  final int offersCount;
  final double? distanceKm;
  final String? creatorName;
  final double? creatorRating;

  Job({
    required this.id,
    required this.title,
    required this.description,
    required this.category,
    required this.requiredSkills,
    required this.workersRequired,
    this.workersSelected = 0,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.duration,
    required this.payment,
    required this.paymentUnit,
    required this.location,
    required this.status,
    required this.applicationsCount,
    this.offersCount = 0,
    this.distanceKm,
    this.creatorName,
    this.creatorRating,
  });

  factory Job.fromJson(Map<String, dynamic> json) {
    final creator = json['creatorId'];
    return Job(
      id: json['_id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      category: json['category'] ?? '',
      requiredSkills: List<String>.from(json['requiredSkills'] ?? []),
      workersRequired: json['workersRequired'] ?? 1,
      workersSelected: json['workersSelected'] ?? 0,
      date: DateTime.tryParse(json['date'] ?? '') ?? DateTime.now(),
      startTime: json['startTime'] ?? '',
      endTime: json['endTime'] ?? '',
      duration: json['duration'] ?? '1 Day',
      payment: json['payment'] ?? 0,
      paymentUnit: json['paymentUnit'] ?? 'day',
      location: JobLocation.fromJson(json['location']),
      status: json['status'] ?? 'OPEN',
      applicationsCount: json['applicationsCount'] ?? 0,
      offersCount: json['offersCount'] ?? 0,
      distanceKm: json['distanceKm'] != null ? (json['distanceKm'] as num).toDouble() : null,
      creatorName: creator is Map ? (creator['businessName'] ?? creator['name']) : null,
      creatorRating: creator is Map ? (creator['rating'] as num?)?.toDouble() : null,
    );
  }
}
