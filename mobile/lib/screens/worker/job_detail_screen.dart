import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/job.dart';
import '../../providers/job_provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';

class JobDetailScreen extends StatefulWidget {
  final String jobId;
  const JobDetailScreen({super.key, required this.jobId});

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  Job? job;
  String? myApplicationStatus;
  bool _loading = true;
  bool _applying = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await context.read<JobProvider>().fetchJobDetail(widget.jobId);
      setState(() {
        job = Job.fromJson(res['job']);
        myApplicationStatus = res['myApplication']?['status'];
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _apply() async {
    setState(() => _applying = true);
    try {
      await context.read<ApiService>().post('/jobs/${widget.jobId}/apply', {});
      setState(() => myApplicationStatus = 'APPLIED');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Application submitted!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _applying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_error != null || job == null) {
      return Scaffold(appBar: AppBar(), body: Center(child: Text(_error ?? 'Job not found.')));
    }

    final j = job!;
    final dateLabel = DateFormat('d MMMM y').format(j.date);

    return Scaffold(
      appBar: AppBar(title: const Text('Job Details')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(j.title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          if (j.creatorName != null)
            Row(
              children: [
                Text(j.creatorName!, style: const TextStyle(fontWeight: FontWeight.w600)),
                if (j.creatorRating != null) ...[
                  const SizedBox(width: 8),
                  Text('⭐ ${j.creatorRating!.toStringAsFixed(1)}', style: const TextStyle(color: AppColors.textMuted)),
                ],
              ],
            ),
          const SizedBox(height: 20),
          _DetailRow(icon: '📍', label: 'Location', value: j.location.city.isNotEmpty ? j.location.city : j.location.address),
          _DetailRow(icon: '📅', label: 'Date', value: dateLabel),
          _DetailRow(icon: '⏰', label: 'Time', value: '${j.startTime} – ${j.endTime}'),
          _DetailRow(icon: '🗓️', label: 'Duration', value: j.duration),
          _DetailRow(icon: '👷', label: 'Workers Required', value: '${j.workersRequired}'),
          _DetailRow(icon: '💰', label: 'Payment', value: '₹${j.payment}/${j.paymentUnit}'),
          const SizedBox(height: 20),
          const Text('Description', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 6),
          Text(j.description, style: const TextStyle(color: AppColors.textMuted)),
          const SizedBox(height: 20),
          const Text('Required Skills', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: j.requiredSkills
                .map((s) => Chip(label: Text(s), backgroundColor: AppColors.primaryLight))
                .toList(),
          ),
          const SizedBox(height: 32),
          if (myApplicationStatus == null)
            ElevatedButton(onPressed: _applying ? null : _apply, child: Text(_applying ? 'Submitting...' : 'APPLY FOR JOB'))
          else
            Container(
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(14)),
              alignment: Alignment.center,
              child: Text(
                myApplicationStatus == 'SELECTED'
                    ? '🎉 You are SELECTED for this job!'
                    : 'APPLICATION $myApplicationStatus ✓',
                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primaryDark),
              ),
            ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String icon;
  final String label;
  final String value;
  const _DetailRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 10),
          SizedBox(width: 130, child: Text(label, style: const TextStyle(color: AppColors.textMuted))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
