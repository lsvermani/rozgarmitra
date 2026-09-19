import 'package:flutter/foundation.dart';
import '../models/job.dart';
import '../services/api_service.dart';

class JobProvider extends ChangeNotifier {
  final ApiService api;
  JobProvider(this.api);

  List<Job> jobs = [];
  bool isLoading = false;
  String? error;

  // Active filters
  String? category;
  String? maxDistanceKm;
  String? search;
  double? lat;
  double? lng;

  Future<void> fetchJobs() async {
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      final res = await api.get('/jobs', query: {
        if (category != null) 'category': category,
        if (maxDistanceKm != null) 'maxDistanceKm': maxDistanceKm,
        if (search != null && search!.isNotEmpty) 'search': search,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      });
      jobs = (res['jobs'] as List).map((j) => Job.fromJson(j)).toList();
    } catch (e) {
      error = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>> fetchJobDetail(String id) async {
    return api.get('/jobs/$id');
  }

  Future<void> applyToJob(String jobId) async {
    await api.post('/jobs/$jobId/apply', {});
  }

  Future<Job> postJob(Map<String, dynamic> jobData) async {
    final res = await api.post('/jobs', jobData);
    return Job.fromJson(res['job']);
  }

  void setFilters({String? category, String? maxDistanceKm, String? search}) {
    this.category = category;
    this.maxDistanceKm = maxDistanceKm;
    this.search = search;
    fetchJobs();
  }

  void setLocation(double? lat, double? lng) {
    this.lat = lat;
    this.lng = lng;
  }
}
