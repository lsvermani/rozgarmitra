class JobLocation {
  final String address;
  final String city;
  final double? latitude;
  final double? longitude;

  JobLocation({required this.address, required this.city, this.latitude, this.longitude});

  factory JobLocation.fromJson(Map<String, dynamic>? json) {
    if (json == null) return JobLocation(address: '', city: '');
    return JobLocation(
      address: json['address'] ?? '',
      city: json['city'] ?? '',
      latitude: json['latitude']?.toDouble(),
      longitude: json['longitude']?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'address': address,
        'city': city,
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
  final DateTime date;
  final String startTime;
  final String endTime;
  final String duration;
  final num payment;
  final String paymentUnit;
  final JobLocation location;
  final String status;
  final int applicationsCount;
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
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.duration,
    required this.payment,
    required this.paymentUnit,
    required this.location,
    required this.status,
    required this.applicationsCount,
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
      date: DateTime.tryParse(json['date'] ?? '') ?? DateTime.now(),
      startTime: json['startTime'] ?? '',
      endTime: json['endTime'] ?? '',
      duration: json['duration'] ?? '1 Day',
      payment: json['payment'] ?? 0,
      paymentUnit: json['paymentUnit'] ?? 'day',
      location: JobLocation.fromJson(json['location']),
      status: json['status'] ?? 'POSTED',
      applicationsCount: json['applicationsCount'] ?? 0,
      distanceKm: json['distanceKm'] != null ? (json['distanceKm'] as num).toDouble() : null,
      creatorName: creator is Map ? (creator['businessName'] ?? creator['name']) : null,
      creatorRating: creator is Map ? (creator['rating'] as num?)?.toDouble() : null,
    );
  }
}
