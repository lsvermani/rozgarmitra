import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../utils/app_theme.dart';
import '../../widgets/current_location_bar.dart';

class CreatorHomeScreen extends StatefulWidget {
  const CreatorHomeScreen({super.key});

  @override
  State<CreatorHomeScreen> createState() => _CreatorHomeScreenState();
}

class _CreatorHomeScreenState extends State<CreatorHomeScreen> {
  List<dynamic> _myJobs = [];
  bool _loading = true;
  LocationData? _gpsLocation;
  bool _fetchingLocation = false;
  String? _locationError;

  @override
  void initState() {
    super.initState();
    _load();
    _fetchGps();
  }

  Future<void> _fetchGps() async {
    if (!mounted) return;
    setState(() {
      _fetchingLocation = true;
      _locationError = null;
    });
    try {
      final loc = await LocationService.fetchGpsLocation();
      if (!mounted) return;
      setState(() => _gpsLocation = loc);
    } on LocationException catch (e) {
      if (!mounted) return;
      setState(() => _locationError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _locationError = 'Could not detect GPS location. Tap to retry.');
    } finally {
      if (mounted) setState(() => _fetchingLocation = false);
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await context.read<ApiService>().get('/jobs', query: {'limit': 50});
      // Filter jobs to this creator's own — the public /jobs endpoint returns all,
      // so in a production build this would be a dedicated "my jobs" endpoint.
      final auth = context.read<AuthProvider>();
      final all = res['jobs'] as List;
      setState(() {
      _myJobs = all.where((j) => (j['creatorId']?['_id'] ?? j['creatorId']).toString() == auth.currentUser?.id.toString()).toList();
      });
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final active = _myJobs.where((j) => !['COMPLETED', 'RATED', 'CANCELLED'].contains(j['status'])).length;
    final completed = _myJobs.where((j) => ['COMPLETED', 'RATED'].contains(j['status'])).length;
    final totalApplications = _myJobs.fold<int>(0, (sum, j) => sum + ((j['applicationsCount'] ?? 0) as int));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rozgarmitra'),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            icon: const Icon(Icons.notifications_none_rounded),
            onPressed: () => context.push('/notifications'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _load();
          await _fetchGps();
        },
        child: Scrollbar(
          thumbVisibility: true,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              // Current GPS locality + city — pinned top-left under the tab bar.
              CurrentLocationBar(
                location: _gpsLocation,
                fetching: _fetchingLocation,
                error: _locationError,
                onRefresh: _fetchGps,
              ),
              const SizedBox(height: 10),
              Text('Welcome, ${auth.currentUser?.businessName ?? auth.currentUser?.name ?? "Job Creator"}',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
            Row(
              children: [
                _StatCard(label: 'Active Jobs', value: '$active'),
                const SizedBox(width: 10),
                _StatCard(label: 'Applications', value: '$totalApplications'),
                const SizedBox(width: 10),
                _StatCard(label: 'Completed', value: '$completed'),
              ],
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () {
                // PostJobScreen is a ShellRoute tab branch — navigate with `go()`
                // (not `push()`), otherwise pop()/return-value handling breaks.
                context.go('/creator/post-job');
              },
              icon: const Icon(Icons.add),
              label: const Text('POST A JOB'),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('My Active Jobs', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                TextButton(
                  onPressed: () => context.go('/creator/my-jobs'),
                  child: const Text('View all'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_loading) const Center(child: CircularProgressIndicator()),
            if (!_loading && _myJobs.isEmpty) const Text('You haven\'t posted any jobs yet.'),
            // Created jobs — bounded box with its own always-visible scrollbar,
            // so mouse-wheel / drag scrolls the job list without moving the page.
            if (!_loading && _myJobs.isNotEmpty)
              SizedBox(
                height: 320,
                child: Scrollbar(
                  thumbVisibility: true,
                  child: ListView.builder(
                    itemCount: _myJobs.length,
                    itemBuilder: (context, index) {
                      final j = _myJobs[index];
                      final loc = j['location'];
                      final locLabel = loc is Map
                          ? ((loc['locality'] != null && loc['locality'].toString().isNotEmpty)
                              ? loc['locality']
                              : (loc['city'] ?? ''))
                          : '';
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12, right: 8),
                        child: ListTile(
                          title: Text(j['title'], style: const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text(
                            '${j['applicationsCount'] ?? 0} Applications · ₹${j['payment']}/${j['paymentUnit']}${locLabel.toString().isNotEmpty ? ' · 📍 $locLabel' : ''}',
                          ),
                          trailing: TextButton(
                            onPressed: () => context.push('/creator/applications/${j['_id']}'),
                            child: const Text('View'),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  const _StatCard({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
        child: Column(
          children: [
            Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.primary)),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
          ],
        ),
      ),
    );
  }
}
