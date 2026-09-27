import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/job.dart';
import '../../providers/job_provider.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../utils/app_theme.dart';
import '../../utils/format_utils.dart';

class JobDetailScreen extends StatefulWidget {
  final String jobId;
  const JobDetailScreen({super.key, required this.jobId});

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  Job? job;
  Map<String, dynamic>? myOffer;
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  // User's position, used to compute distance-to-job on the location card.
  double? _userLat;
  double? _userLng;

  // Offer dialog inputs
  final _amountController = TextEditingController();
  final _messageController = TextEditingController();
  bool _confirmAvailability = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    await _resolveUserPosition();
    try {
      final res = await context.read<JobProvider>().fetchJobDetail(widget.jobId);
      setState(() {
        job = Job.fromJson(res['job']);
        myOffer = res['myOffer'] as Map<String, dynamic>?;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  /// Resolve the user's position — always from live GPS (cached fix only as an
  /// instant placeholder, then replaced by the fresh fix) — so the
  /// location card can show distance-to-job.
  Future<void> _resolveUserPosition() async {
    // Capture provider before the async gap — do not use context after await.
    JobProvider? jobProvider;
    try {
      jobProvider = context.read<JobProvider>();
    } catch (_) {}
    try {
      final cached = await LocationService.getCachedLocation();
      _userLat = cached?.latitude;
      _userLng = cached?.longitude;
      // Also seed JobProvider so other screens share the same fix.
      jobProvider?.setLocation(_userLat, _userLng);

      final gps = await LocationService.fetchGpsLocation(
        timeout: const Duration(seconds: 10),
      );
      _userLat = gps.latitude;
      _userLng = gps.longitude;
      jobProvider?.setLocation(_userLat, _userLng);
    } on LocationException {
      // Distance display is best-effort; keep the cached fix if GPS failed.
    } catch (_) {
      // Distance display is best-effort; the rest of the page still works.
    }
  }

  /// Distance from the user's current position to the job's GPS coordinates.
  double? _distanceToJob(Job j) {
    if (j.distanceKm != null) return j.distanceKm;
    final jobLat = j.location.latitude;
    final jobLng = j.location.longitude;
    if (jobLat == null || jobLng == null || _userLat == null || _userLng == null) return null;
    return Geolocator.distanceBetween(_userLat!, _userLng!, jobLat, jobLng) / 1000.0;
  }

  void _showOfferDialog({bool isEditing = false}) {
    if (job == null) return;
    if (isEditing && myOffer != null) {
      _amountController.text = (myOffer!['proposedAmount'] ?? '').toString();
      _messageController.text = (myOffer!['message'] ?? '').toString();
      _confirmAvailability = myOffer!['availabilityConfirmation'] ?? true;
    } else {
      _amountController.text = job!.payment > 0 ? job!.payment.toString() : '';
      _messageController.text = '';
      _confirmAvailability = true;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 24,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          isEditing ? '✏️ Edit Your Offer' : '🤝 I Want to Accept This Work',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Decide your own price for this work. The job creator will review your quote and select you.',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      'Your Proposed Amount (₹) *',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _amountController,
                      keyboardType: TextInputType.number,
                      autofocus: true,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: AppColors.primary,
                      ),
                      decoration: InputDecoration(
                        prefixIcon: const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          child: Text(
                            '₹',
                            style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w900,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                        hintText: 'e.g. 1200',
                        filled: true,
                        fillColor: Colors.grey.shade50,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Optional message to creator',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _messageController,
                      maxLines: 2,
                      decoration: InputDecoration(
                        hintText: 'e.g. Available on time with tools',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                    const SizedBox(height: 12),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      value: _confirmAvailability,
                      onChanged: (val) => setModalState(() => _confirmAvailability = val ?? true),
                      title: const Text(
                        'I confirm my availability for this date & time.',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onPressed: _submitting ? null : () => _submitOffer(isEditing: isEditing),
                      child: Text(
                        _submitting ? 'Submitting...' : (isEditing ? 'UPDATE OFFER' : 'SUBMIT OFFER'),
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _submitOffer({bool isEditing = false}) async {
    final amt = num.tryParse(_amountController.text.trim());
    if (amt == null || amt <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount.')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final api = context.read<ApiService>();
      if (isEditing && myOffer != null) {
        final res = await api.put('/offers/${myOffer!['_id']}', {
          'proposedAmount': amt,
          'message': _messageController.text.trim(),
          'availabilityConfirmation': _confirmAvailability,
        });
        setState(() {
          myOffer = res['offer'] as Map<String, dynamic>?;
        });
        if (mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('✅ Offer updated successfully!')),
          );
        }
      } else {
        final res = await api.post('/offers/jobs/${widget.jobId}', {
          'proposedAmount': amt,
          'message': _messageController.text.trim(),
          'availabilityConfirmation': _confirmAvailability,
        });
        setState(() {
          myOffer = res['offer'] as Map<String, dynamic>?;
        });
        if (mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('🎉 Offer submitted to job creator!')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _withdrawOffer() async {
    if (myOffer == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw Offer?'),
        content: const Text('Are you sure you want to withdraw your offer for this work?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Yes, Withdraw')),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await context.read<ApiService>().put('/offers/${myOffer!['_id']}/withdraw', {});
      setState(() {
        myOffer = null;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Offer withdrawn.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
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
    final offerStatus = myOffer?['status'] as String?;
    final proposedAmt = myOffer?['proposedAmount'];

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
          _WorkLocationCard(job: j, distanceKm: _distanceToJob(j)),
          _DetailRow(icon: '📅', label: 'Date', value: dateLabel),
          _DetailRow(icon: '⏰', label: 'Time', value: '${j.startTime} – ${j.endTime}'),
          _DetailRow(icon: '🗓️', label: 'Duration', value: j.duration),
          _DetailRow(icon: '👷', label: 'Workers Needed', value: '${j.workersRequired} (${j.workersSelected} selected)'),
          _DetailRow(icon: '💰', label: 'Suggested Budget', value: '₹${j.payment}/${j.paymentUnit}'),
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

          // Offer status card or "View & Apply" action
          if (myOffer != null) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: offerStatus == 'ACCEPTED' ? Colors.green.shade50 : AppColors.primaryLight,
                border: Border.all(
                  color: offerStatus == 'ACCEPTED' ? Colors.green : AppColors.primary,
                  width: 1.5,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        offerStatus == 'ACCEPTED' ? '🎉 YOU ARE SELECTED!' : 'OFFER SUBMITTED ✓',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          color: offerStatus == 'ACCEPTED' ? Colors.green.shade900 : AppColors.primaryDark,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '₹$proposedAmt',
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: AppColors.primary),
                        ),
                      ),
                    ],
                  ),
                  if (offerStatus == 'PENDING') ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => _showOfferDialog(isEditing: true),
                            child: const Text('Edit Offer'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.red,
                              side: const BorderSide(color: Colors.red),
                            ),
                            onPressed: _withdrawOffer,
                            child: const Text('Withdraw'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ] else ...[
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                minimumSize: const Size.fromHeight(56),
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              onPressed: () => _showOfferDialog(isEditing: false),
              child: const Text(
                'I WANT TO ACCEPT THIS WORK (QUOTE RATE)',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Work-location card: address, distance-from-user (GPS) and raw coordinates.
class _WorkLocationCard extends StatelessWidget {
  final Job job;
  final double? distanceKm;
  const _WorkLocationCard({required this.job, this.distanceKm});

  String get _locationText {
    final text = {
      if (job.location.locality.isNotEmpty) job.location.locality,
      if (job.location.city.isNotEmpty && job.location.city != job.location.locality) job.location.city,
      if (job.location.address.isNotEmpty &&
          job.location.address != job.location.locality &&
          job.location.address != job.location.city)
        job.location.address,
    }.join(', ');
    return text.isEmpty ? 'Location not specified' : text;
  }

  @override
  Widget build(BuildContext context) {
    final hasGps = job.location.latitude != null && job.location.longitude != null;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.place_outlined, size: 20, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _locationText,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ),
            ],
          ),
          if (distanceKm != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.near_me_outlined, size: 14, color: AppColors.accent),
                const SizedBox(width: 6),
                Text(
                  '${formatDistance(distanceKm!)} from your location',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primaryDark,
                  ),
                ),
              ],
            ),
          ],
          if (hasGps) ...[
            const SizedBox(height: 6),
            Text(
              'GPS: ${job.location.latitude!.toStringAsFixed(4)}, ${job.location.longitude!.toStringAsFixed(4)}',
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
          ],
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
