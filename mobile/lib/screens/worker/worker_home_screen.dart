import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/job_provider.dart';
import '../../services/location_service.dart';
import '../../widgets/current_location_bar.dart';
import '../../widgets/job_card.dart';
import '../../utils/app_theme.dart';

class WorkerHomeScreen extends StatefulWidget {
  const WorkerHomeScreen({super.key});

  @override
  State<WorkerHomeScreen> createState() => _WorkerHomeScreenState();
}

class _WorkerHomeScreenState extends State<WorkerHomeScreen> {
  LocationData? _currentLocation;
  bool _fetchingLocation = false;
  String? _locationError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initLocationAndJobs();
    });
  }

  Future<void> _initLocationAndJobs() async {
    final jobProvider = context.read<JobProvider>();

    // Show last-known fix instantly so the list renders, then replace it
    // with a fresh GPS fix below.
    final cached = await LocationService.getCachedLocation();
    if (cached != null && mounted) {
      setState(() => _currentLocation = cached);
      jobProvider.setLocation(cached.latitude, cached.longitude);
      jobProvider.fetchJobs();
    } else {
      jobProvider.fetchJobs();
    }

    // GPS-first: always fetch live GPS on home load.
    await _refreshLocality();
  }

  Future<void> _refreshLocality() async {
    if (!mounted) return;
    setState(() {
      _fetchingLocation = true;
      _locationError = null;
    });

    try {
      final loc = await LocationService.fetchGpsLocation();
      if (!mounted) return;
      setState(() => _currentLocation = loc);
      final jobProvider = context.read<JobProvider>();
      jobProvider.setLocation(loc.latitude, loc.longitude);
      await jobProvider.fetchJobs();
    } on LocationException catch (e) {
      if (!mounted) return;
      setState(() => _locationError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _locationError = 'Could not detect GPS location. Pull to retry.');
    } finally {
      if (mounted) setState(() => _fetchingLocation = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final jobProvider = context.watch<JobProvider>();
    final name = auth.currentUser?.name.isNotEmpty == true ? auth.currentUser!.name : 'Worker';

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
          await _refreshLocality();
          await jobProvider.fetchJobs();
        },
        child: Scrollbar(
          thumbVisibility: true,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              // Current GPS locality + city — pinned top-left under the tab bar.
              CurrentLocationBar(
                location: _currentLocation,
                fetching: _fetchingLocation,
                error: _locationError,
                onRefresh: _refreshLocality,
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Hello, $name 👋', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                ],
              ),
              const SizedBox(height: 14),

            InkWell(
              onTap: () => context.push('/worker/jobs'),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.search, color: AppColors.textMuted),
                    SizedBox(width: 10),
                    Text('Search jobs', style: TextStyle(color: AppColors.textMuted)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('📍 Jobs Near You', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                if (_currentLocation != null && _currentLocation!.locality.isNotEmpty)
                  Text(
                    _currentLocation!.locality,
                    style: const TextStyle(fontSize: 13, color: AppColors.textMuted, fontWeight: FontWeight.w600),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (jobProvider.isLoading) const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
            if (jobProvider.error != null)
              Padding(padding: const EdgeInsets.all(16), child: Text(jobProvider.error!, style: const TextStyle(color: AppColors.danger))),
            if (!jobProvider.isLoading && jobProvider.jobs.isEmpty)
              const Padding(padding: EdgeInsets.all(16), child: Text('No jobs available right now. Pull to refresh.')),
            ...jobProvider.jobs
                .take(10)
                .map((job) => JobCard(job: job, onTap: () => context.push('/worker/jobs/${job.id}'))),
            ],
          ),
        ),
      ),
    );
  }
}
