class AppUser {
  final String id;
  final String name;
  final String mobile;
  final String role; // 'worker' | 'job_creator' | 'admin'
  final String? businessName;
  final String? profilePhoto;
  final String language;
  final List<String> skills;
  final List<String> categories;
  final int experienceYears;
  final List<String> availability;
  final double rating;
  final int ratingCount;
  final int completedJobs;
  final bool verified;

  AppUser({
    required this.id,
    required this.name,
    required this.mobile,
    required this.role,
    this.businessName,
    this.profilePhoto,
    this.language = 'en',
    this.skills = const [],
    this.categories = const [],
    this.experienceYears = 0,
    this.availability = const [],
    this.rating = 0,
    this.ratingCount = 0,
    this.completedJobs = 0,
    this.verified = false,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['_id'] ?? json['id'] ?? '',
      name: json['name'] ?? '',
      mobile: json['mobile'] ?? '',
      role: json['role'] ?? 'worker',
      businessName: json['businessName'],
      profilePhoto: json['profilePhoto'],
      language: json['language'] ?? 'en',
      skills: List<String>.from(json['skills'] ?? []),
      categories: List<String>.from(json['categories'] ?? []),
      experienceYears: json['experienceYears'] ?? 0,
      availability: List<String>.from(json['availability'] ?? []),
      rating: (json['rating'] ?? 0).toDouble(),
      ratingCount: json['ratingCount'] ?? 0,
      completedJobs: json['completedJobs'] ?? 0,
      verified: json['verified'] ?? false,
    );
  }
}
