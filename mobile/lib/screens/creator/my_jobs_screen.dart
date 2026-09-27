import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../utils/app_theme.dart';
import '../../widgets/current_location_bar.dart';

/// Creator's full "My Jobs" list with status filters.
/// Reached from the bottom-nav "My Jobs" tab and the dashboard "View all" link.
class MyJobsScreen extends StatefulWidget {
  const MyJobsScreen({super.key});

  @override
  State<MyJobsScreen> createState() => _MyJobsScreenState();
}

class _MyJobsScreenState extends State<MyJobsScreen> {
  List<dynamic> _jobs = [];
  bool _loading = true;
  String _filter = 'ACTIVE'; // ACTIVE | COMPLETED | ALL
  LocationData? _gpsLocation;
  bool _fetchingLocation = false;
  String? _locationError;

  static const List<String> _closedStatuses = ['COMPLETED', 'RATED', 'CANCELLED'];
  static const List<String> _doneStatuses = ['COMPLETED', 'RATED'];

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
      // The public /jobs endpoint returns all jobs; filter to this creator's own
      // (a dedicated "my jobs" endpoint would replace this in production).
      final res = await context.read<ApiService>().get('/jobs', query: {'limit': 50});
      final auth = context.read<AuthProvider>();
      final all = res['jobs'] as List;
      setState(() {
        _jobs = all
            .where((j) => (j['creatorId']?['_id'] ?? j['creatorId']).toString() == auth.currentUser?.id.toString())
            .toList();
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<dynamic> get _filteredJobs {
    switch (_filter) {
      case 'ACTIVE':
        return _jobs.where((j) => !_closedStatuses.contains(j['status'])).toList();
      case 'COMPLETED':
        return _jobs.where((j) => _doneStatuses.contains(j['status'])).toList();
      default:
        return _jobs;
    }
  }

  String _locationLabel(dynamic loc) {
    if (loc is! Map) return '';
    final locality = (loc['locality'] ?? '').toString();
    if (locality.isNotEmpty) return locality;
    return (loc['city'] ?? '').toString();
  }

  void _openApplications(dynamic j) {
    context.push('/creator/applications/${j['_id']}');
  }

  @override
  Widget build(BuildContext context) {
    final jobs = _filteredJobs;
    final activeCount = _jobs.where((j) => !_closedStatuses.contains(j['status'])).length;
    final doneCount = _jobs.where((j) => _doneStatuses.contains(j['status'])).length;

    return Scaffold(
      appBar: AppBar(title: const Text('My Jobs')),
      body: RefreshIndicator(
        onRefresh: () async {
          await _load();
          await _fetchGps();
        },
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _jobs.isEmpty
                ? _EmptyState(onPostJob: () => context.go('/creator/post-job'))
                : Scrollbar(
                    thumbVisibility: true,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                      children: [
                        // Current GPS locality + city — pinned top-left.
                        CurrentLocationBar(
                          location: _gpsLocation,
                          fetching: _fetchingLocation,
                          error: _locationError,
                          onRefresh: _fetchGps,
                        ),
                        const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        children: [
                          ChoiceChip(
                            label: Text('Active ($activeCount)'),
                            selected: _filter == 'ACTIVE',
                            onSelected: (_) => setState(() => _filter = 'ACTIVE'),
                          ),
                          ChoiceChip(
                            label: Text('Completed ($doneCount)'),
                            selected: _filter == 'COMPLETED',
                            onSelected: (_) => setState(() => _filter = 'COMPLETED'),
                          ),
                          ChoiceChip(
                            label: const Text('All'),
                            selected: _filter == 'ALL',
                            onSelected: (_) => setState(() => _filter = 'ALL'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (jobs.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(child: Text('No jobs in this filter.')),
                        ),
                      ...jobs.map(_jobTile),
                    ],
                  ),
                ),
      ),
    );
  }

  Widget _jobTile(dynamic j) {
    final locLabel = _locationLabel(j['location']);
    final status = (j['status'] ?? 'OPEN').toString();
    final closed = _closedStatuses.contains(status);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        onTap: () => _openApplications(j),
        title: Row(
          children: [
            Expanded(
              child: Text(
                (j['title'] ?? '').toString(),
                style: const TextStyle(fontWeight: FontWeight.w700),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: closed ? AppColors.border : AppColors.primaryLight,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                status,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: closed ? AppColors.textMuted : AppColors.primaryDark,
                ),
              ),
            ),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            '₹${j['payment']}/${j['paymentUnit']} · ${j['applicationsCount'] ?? 0} applicants'
            '${locLabel.isNotEmpty ? ' · 📍 $locLabel' : ''}',
            style: const TextStyle(fontSize: 13),
          ),
        ),
        trailing: TextButton(
          onPressed: () => _openApplications(j),
          child: const Text('View'),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onPostJob;
  const _EmptyState({required this.onPostJob});

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 80),
        const Icon(Icons.work_outline_rounded, size: 64, color: AppColors.textMuted),
        const SizedBox(height: 12),
        const Center(
          child: Text(
            'You haven\'t posted any jobs yet.',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(height: 20),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 48),
          child: ElevatedButton.icon(
            onPressed: onPostJob,
            icon: const Icon(Icons.add),
            label: const Text('POST A JOB'),
          ),
        ),
      ],
    );
  }
}
