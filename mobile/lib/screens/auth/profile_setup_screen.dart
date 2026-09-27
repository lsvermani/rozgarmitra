import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../utils/app_theme.dart';

class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final _nameCtrl = TextEditingController();
  final _businessCtrl = TextEditingController();
  final _localityCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  double? _latitude;
  double? _longitude;
  String _state = '';
  String _pincode = '';

  bool _fetchingLocation = false;
  String? _locationStatusMessage;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Automatically detect locality from internet / GPS on screen load
    _autoFetchLocality();
  }

  Future<void> _autoFetchLocality() async {
    if (!mounted) return;
    setState(() {
      _fetchingLocation = true;
      _locationStatusMessage = 'Fetching your current GPS location...';
    });

    try {
      // GPS-first: every screen fetches live GPS. Throws LocationException
      // when GPS is off / denied / timed out — show that instead of silently
      // falling back to IP/cached data.
      final loc = await LocationService.fetchGpsLocation();
      if (!mounted) return;
      setState(() {
        _localityCtrl.text = loc.locality;
        _cityCtrl.text = loc.city;
        _latitude = loc.latitude;
        _longitude = loc.longitude;
        _state = loc.state;
        _pincode = loc.pincode;
        _locationStatusMessage = '📍 GPS: ${loc.displayLocation}';
      });
    } on LocationException catch (e) {
      if (!mounted) return;
      setState(() {
        _locationStatusMessage = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _locationStatusMessage = 'Could not detect GPS location. Please enter it manually or retry.';
      });
    } finally {
      if (mounted) setState(() => _fetchingLocation = false);
    }
  }

  Future<void> _save() async {
    final auth = context.read<AuthProvider>();
    setState(() => _saving = true);
    try {
      final api = context.read<ApiService>();
      final locality = _localityCtrl.text.trim();
      final city = _cityCtrl.text.trim();
      final displayAddr = [locality, city, _state].where((s) => s.isNotEmpty).join(', ');

      await api.put('/users/profile', {
        'name': _nameCtrl.text.trim(),
        if (auth.currentUser?.role == 'job_creator') 'businessName': _businessCtrl.text.trim(),
        'location': {
          'locality': locality,
          'city': city,
          'state': _state,
          'pincode': _pincode,
          'address': displayAddr,
          'latitude': _latitude,
          'longitude': _longitude,
        },
      });

      await auth.refreshProfile();
      if (!mounted) return;
      if (auth.currentUser!.role == 'worker') {
        context.go('/worker/home');
      } else {
        context.go('/creator/home');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isCreator = auth.currentUser?.role == 'job_creator';

    return Scaffold(
      appBar: AppBar(title: const Text('Complete Your Profile')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(labelText: 'Your Name *'),
            ),
            if (isCreator) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _businessCtrl,
                decoration: const InputDecoration(labelText: 'Residence / Business / Shop Name (optional)'),
              ),
            ],
            const SizedBox(height: 18),
            // Location Header & Auto-Detect Action
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Your Locality & Area',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
                TextButton.icon(
                  onPressed: _fetchingLocation ? null : _autoFetchLocality,
                  icon: _fetchingLocation
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.my_location, size: 18),
                  label: Text(_fetchingLocation ? 'Fetching...' : 'Re-detect'),
                ),
              ],
            ),
            if (_locationStatusMessage != null) ...[
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.primaryLight.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, size: 16, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _locationStatusMessage!,
                        style: const TextStyle(fontSize: 13, color: AppColors.primaryDark),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            TextField(
              controller: _localityCtrl,
              decoration: const InputDecoration(
                labelText: 'Locality / Area / Colony *',
                hintText: 'e.g. Indiranagar, Sector 62, Karol Bagh',
                prefixIcon: Icon(Icons.place_outlined),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _cityCtrl,
              decoration: const InputDecoration(
                labelText: 'City *',
                hintText: 'e.g. Bengaluru, Noida, Delhi',
                prefixIcon: Icon(Icons.location_city_outlined),
              ),
            ),
            const SizedBox(height: 28),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving...' : 'Save & Continue'),
            ),
          ],
        ),
      ),
    );
  }
}
