import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/job_provider.dart';
import '../../services/location_service.dart';
import '../../utils/app_theme.dart';
import '../../widgets/current_location_bar.dart';
import '../../widgets/job_card.dart';

const List<String> kCategories = ['Construction', 'Household', 'Shops & Businesses', 'Events'];
const List<String> kDistances = ['2', '5', '10', '20'];

class JobListScreen extends StatefulWidget {
  const JobListScreen({super.key});

  @override
  State<JobListScreen> createState() => _JobListScreenState();
}

class _JobListScreenState extends State<JobListScreen> {
  final _searchCtrl = TextEditingController();
  String? _category;
  String? _distance;
  LocationData? _location;
  bool _fetchingLocation = false;
  String? _locationError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initLocation());
  }

  Future<void> _initLocation() async {
    final jobProvider = context.read<JobProvider>();

    // Show last-known fix instantly so the list renders, then always
    // replace it with a fresh live GPS fix below.
    final cached = await LocationService.getCachedLocation();
    if (cached != null && mounted) {
      setState(() => _location = cached);
      jobProvider.setLocation(cached.latitude, cached.longitude);
      jobProvider.fetchJobs();
    } else {
      jobProvider.fetchJobs();
    }

    // GPS-first: always fetch live GPS when the Jobs tab opens.
    await _refreshLocation();
  }

  Future<void> _refreshLocation() async {
    if (!mounted) return;
    setState(() {
      _fetchingLocation = true;
      _locationError = null;
    });

    try {
      final loc = await LocationService.fetchGpsLocation();
      if (!mounted) return;
      setState(() => _location = loc);
      final jobProvider = context.read<JobProvider>();
      jobProvider.setLocation(loc.latitude, loc.longitude);
      _applyFilters();
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

  void _applyFilters() {
    context.read<JobProvider>().setFilters(
          category: _category,
          maxDistanceKm: _distance,
          search: _searchCtrl.text.trim(),
        );
  }

  @override
  Widget build(BuildContext context) {
    final jobProvider = context.watch<JobProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Find Jobs')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                // Current GPS locality + city — pinned top-left, above filters.
                CurrentLocationBar(
                  location: _location,
                  fetching: _fetchingLocation,
                  error: _locationError,
                  onRefresh: _refreshLocation,
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    hintText: 'Search jobs (e.g. Construction, Painter)',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(icon: const Icon(Icons.send), onPressed: _applyFilters),
                  ),
                  onSubmitted: (_) => _applyFilters(),
                ),
                const SizedBox(height: 10),

                Row(
                  children: [
                    if (_distance != null)
                      Text(
                        'within $_distance km',
                        style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                      ),
                  ],
                ),
                const SizedBox(height: 10),

                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      ...kCategories.map(
                        (c) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(c),
                            selected: _category == c,
                            onSelected: (sel) {
                              setState(() => _category = sel ? c : null);
                              _applyFilters();
                            },
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ...kDistances.map(
                        (d) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text('Within $d km'),
                            selected: _distance == d,
                            onSelected: (sel) {
                              setState(() => _distance = sel ? d : null);
                              _applyFilters();
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: jobProvider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : jobProvider.jobs.isEmpty
                    ? const Center(child: Text('No jobs match your filters.'))
                    : Scrollbar(
                        thumbVisibility: true,
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          itemCount: jobProvider.jobs.length,
                          itemBuilder: (context, i) {
                            final job = jobProvider.jobs[i];
                            return JobCard(job: job, onTap: () => context.push('/worker/jobs/${job.id}'));
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
