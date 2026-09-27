import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../models/application.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';

class WorkerApplicationsScreen extends StatefulWidget {
  const WorkerApplicationsScreen({super.key});

  @override
  State<WorkerApplicationsScreen> createState() => _WorkerApplicationsScreenState();
}

class _WorkerApplicationsScreenState extends State<WorkerApplicationsScreen> {
  List<JobApplication> _applications = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await context.read<ApiService>().get('/applications');
      setState(() {
        _applications = (res['applications'] as List).map((a) => JobApplication.fromJson(a)).toList();
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _acceptTask(JobApplication application) async {
    try {
      await context.read<ApiService>().put('/applications/${application.id}/accept', {});
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Task accepted.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
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
      appBar: AppBar(title: const Text('My Applications')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : _applications.isEmpty
                    ? const Center(child: Text('You haven\'t applied to any jobs yet.'))
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _applications.length,
                        itemBuilder: (context, i) {
                          final a = _applications[i];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: ListTile(
                              onTap: () => context.push('/worker/jobs/${a.jobId}'),
                              title: Text(a.jobTitle, style: const TextStyle(fontWeight: FontWeight.w700)),
                              subtitle: a.jobPayment != null ? Text('₹${a.jobPayment}/day') : null,
                              trailing: a.status == 'SELECTED'
                                  ? SizedBox(
                                      // ListTile's trailing can hand out unbounded
                                      // main-axis width; the theme's minimumSize
                                      // (width = ∞) would then assert. Pin the width.
                                      width: 150,
                                      child: ElevatedButton(
                                          onPressed: () => _acceptTask(a), child: const Text('Accept task')),
                                    )
                                  : Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                      decoration: BoxDecoration(
                                        color: _statusColor(a.status).withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: Text(
                                        a.status,
                                        style: TextStyle(color: _statusColor(a.status), fontWeight: FontWeight.w700, fontSize: 11),
                                      ),
                                    ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
