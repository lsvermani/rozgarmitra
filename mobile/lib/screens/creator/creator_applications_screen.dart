import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/application.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';

class CreatorApplicationsScreen extends StatefulWidget {
  final String jobId;
  const CreatorApplicationsScreen({super.key, required this.jobId});

  @override
  State<CreatorApplicationsScreen> createState() => _CreatorApplicationsScreenState();
}

class _CreatorApplicationsScreenState extends State<CreatorApplicationsScreen> {
  List<JobApplication> _applications = [];
  bool _loading = true;
  String? _error;
  final Set<String> _updating = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.get('/applications', query: {'jobId': widget.jobId});
      setState(() {
        _applications = (res['applications'] as List).map((a) => JobApplication.fromJson(a)).toList();
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _updateStatus(JobApplication app, String status) async {
    setState(() => _updating.add(app.id));
    try {
      await context.read<ApiService>().put('/applications/${app.id}/status', {'status': status});
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _updating.remove(app.id));
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'SELECTED':
      case 'COMPLETED':
        return AppColors.success;
      case 'REJECTED':
        return AppColors.danger;
      case 'SHORTLISTED':
        return AppColors.accent;
      default:
        return AppColors.textMuted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Applications')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : _applications.isEmpty
                    ? const Center(child: Text('No applications yet for this job.'))
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _applications.length,
                        itemBuilder: (context, i) {
                          final a = _applications[i];
                          final isBusy = _updating.contains(a.id);
                          final isPending = a.status == 'APPLIED' || a.status == 'SHORTLISTED';

                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(a.workerName ?? 'Worker', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                        decoration: BoxDecoration(
                                          color: _statusColor(a.status).withValues(alpha: 0.12),
                                          borderRadius: BorderRadius.circular(20),
                                        ),
                                        child: Text(a.status,
                                            style: TextStyle(color: _statusColor(a.status), fontWeight: FontWeight.w700, fontSize: 11)),
                                      ),
                                    ],
                                  ),
                                  if (isPending) ...[
                                    const SizedBox(height: 10),
                                    Row(
                                      children: [
                                        if (a.status == 'APPLIED')
                                          Expanded(
                                            child: OutlinedButton(
                                              onPressed: isBusy ? null : () => _updateStatus(a, 'SHORTLISTED'),
                                              child: const Text('Shortlist'),
                                            ),
                                          ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: ElevatedButton(
                                            onPressed: isBusy ? null : () => _updateStatus(a, 'SELECTED'),
                                            child: const Text('Select'),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: OutlinedButton(
                                            style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                                            onPressed: isBusy ? null : () => _updateStatus(a, 'REJECTED'),
                                            child: const Text('Reject'),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
