import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';

class CreatorHomeScreen extends StatefulWidget {
  const CreatorHomeScreen({super.key});

  @override
  State<CreatorHomeScreen> createState() => _CreatorHomeScreenState();
}

class _CreatorHomeScreenState extends State<CreatorHomeScreen> {
  List<dynamic> _myJobs = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
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
        _myJobs = all.where((j) => (j['creatorId']?['_id'] ?? j['creatorId']) == auth.currentUser?.id).toList();
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
      appBar: AppBar(title: const Text('Rozgarmitra')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
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
              onPressed: () => context.push('/creator/post-job'),
              icon: const Icon(Icons.add),
              label: const Text('POST A JOB'),
            ),
            const SizedBox(height: 24),
            const Text('My Active Jobs', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            if (_loading) const Center(child: CircularProgressIndicator()),
            if (!_loading && _myJobs.isEmpty) const Text('You haven\'t posted any jobs yet.'),
            ..._myJobs.map((j) => Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    title: Text(j['title'], style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${j['applicationsCount'] ?? 0} Applications · ₹${j['payment']}/${j['paymentUnit']}'),
                    trailing: TextButton(
                      onPressed: () => context.push('/creator/applications/${j['_id']}'),
                      child: const Text('View'),
                    ),
                  ),
                )),
          ],
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
