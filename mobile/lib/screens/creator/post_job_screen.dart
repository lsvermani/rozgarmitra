import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../utils/app_theme.dart';
import '../../widgets/current_location_bar.dart';
import '../worker/job_list_screen.dart' show kCategories;

class PostJobScreen extends StatefulWidget {
  const PostJobScreen({super.key});

  @override
  State<PostJobScreen> createState() => _PostJobScreenState();
}

class _PostJobScreenState extends State<PostJobScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _skillsCtrl = TextEditingController();
  final _workersCtrl = TextEditingController(text: '1');
  final _paymentCtrl = TextEditingController();
  final _localityCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();

  double? _latitude;
  double? _longitude;
  String _state = '';
  String _pincode = '';
  bool _fetchingLocation = false;
  String? _locationStatus;

  String? _category;
  DateTime? _date;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initJobLocation();
    });
  }

  Future<void> _initJobLocation() async {
    // GPS-first: always fetch the live device GPS position for the job site.
    // Profile locality is only a fallback when GPS is unavailable.
    await _autoFetchLocality();

    if (!mounted) return;
    if (_locationStatus != null && _locationStatus!.startsWith('📍 GPS')) return;

    final auth = context.read<AuthProvider>();
    final userLoc = auth.currentUser?.location;
    if (userLoc != null && (userLoc.locality.isNotEmpty || userLoc.city.isNotEmpty)) {
      setState(() {
        if (_localityCtrl.text.isEmpty) _localityCtrl.text = userLoc.locality;
        if (_cityCtrl.text.isEmpty) _cityCtrl.text = userLoc.city;
        if (_addressCtrl.text.isEmpty) _addressCtrl.text = userLoc.address;
        _latitude ??= userLoc.latitude;
        _longitude ??= userLoc.longitude;
        if (_state.isEmpty) _state = userLoc.state;
        if (_pincode.isEmpty) _pincode = userLoc.pincode;
        _locationStatus =
            '$_locationStatus\n📍 Profile locality fallback: ${userLoc.displayLocation}';
      });
    }
  }

  Future<void> _autoFetchLocality() async {
    if (!mounted) return;
    setState(() {
      _fetchingLocation = true;
      _locationStatus = 'Fetching current GPS location...';
    });

    try {
      final loc = await LocationService.fetchGpsLocation();
      if (!mounted) return;
      setState(() {
        _localityCtrl.text = loc.locality;
        _cityCtrl.text = loc.city;
        if (loc.address.isNotEmpty) {
          _addressCtrl.text = loc.address;
        }
        _latitude = loc.latitude;
        _longitude = loc.longitude;
        _state = loc.state;
        _pincode = loc.pincode;
        final coords = (loc.latitude != null && loc.longitude != null)
            ? ' · GPS ${loc.latitude!.toStringAsFixed(4)}, ${loc.longitude!.toStringAsFixed(4)}'
            : '';
        _locationStatus = '📍 GPS Work Locality: ${loc.displayLocation}$coords';
      });
    } on LocationException catch (e) {
      if (!mounted) return;
      setState(() {
        _locationStatus = e.message;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _locationStatus = 'Could not detect GPS location. Please enter manually or retry.';
        });
      }
    } finally {
      if (mounted) setState(() => _fetchingLocation = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime(bool isStart) async {
    final picked = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 9, minute: 0));
    if (picked != null) setState(() => isStart ? _startTime = picked : _endTime = picked);
  }

  String _fmtTime(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_formKey.currentState!.validate() || _category == null || _date == null || _startTime == null || _endTime == null) {
      setState(() => _error = 'Please fill all required fields.');
      return;
    }
    setState(() => _submitting = true);

    final locality = _localityCtrl.text.trim();
    final city = _cityCtrl.text.trim();
    final address = _addressCtrl.text.trim().isNotEmpty
        ? _addressCtrl.text.trim()
        : [locality, city, _state].where((s) => s.isNotEmpty).join(', ');

    try {
      await context.read<ApiService>().post('/jobs', {
        'title': _titleCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'category': _category,
        'requiredSkills': _skillsCtrl.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList(),
        'workersRequired': int.tryParse(_workersCtrl.text) ?? 1,
        'date': _date!.toIso8601String(),
        'startTime': _fmtTime(_startTime!),
        'endTime': _fmtTime(_endTime!),
        'duration': '1 Day',
        'payment': num.tryParse(_paymentCtrl.text) ?? 0,
        'paymentUnit': 'day',
        'location': {
          'locality': locality,
          'city': city,
          'address': address,
          'state': _state,
          'pincode': _pincode,
          'latitude': _latitude,
          'longitude': _longitude,
        },
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('🎉 Job posted successfully!')),
        );
        // NOTE: PostJobScreen lives inside a ShellRoute (bottom-tab branch),
        // so it is usually reached via `go()` which replaces the stack — there
        // is nothing to `pop()`. Calling `pop()` here throws
        // "There is nothing to pop()" on the emulator. Always `go()` instead.
        context.go('/creator/my-jobs');
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Post a Job')),
      body: Form(
        key: _formKey,
        child: Scrollbar(
          thumbVisibility: true,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              // Current GPS locality + city — pinned top-left.
              CurrentLocationBar(
                location: (_localityCtrl.text.isNotEmpty || _cityCtrl.text.isNotEmpty)
                    ? LocationData(
                        locality: _localityCtrl.text,
                        city: _cityCtrl.text,
                        state: _state,
                        pincode: _pincode,
                        address: _addressCtrl.text,
                        latitude: _latitude,
                        longitude: _longitude,
                        isGps: true,
                      )
                    : null,
                fetching: _fetchingLocation,
                error: (_locationStatus != null && !_locationStatus!.startsWith('📍'))
                    ? _locationStatus
                    : null,
                onRefresh: _autoFetchLocality,
              ),
              const SizedBox(height: 14),
              TextFormField(
              controller: _titleCtrl,
              decoration: const InputDecoration(labelText: 'Job Title *'),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _category,
              decoration: const InputDecoration(labelText: 'Category *'),
              items: kCategories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => _category = v),
              validator: (v) => v == null ? 'Required' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _descCtrl,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Description'),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _skillsCtrl,
              decoration: const InputDecoration(labelText: 'Required Skills (comma separated)'),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _workersCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Number of Workers *'),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 14),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(_date == null ? 'Select Date *' : '${_date!.day}/${_date!.month}/${_date!.year}'),
              trailing: const Icon(Icons.calendar_today),
              onTap: _pickDate,
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(_startTime == null ? 'Start Time *' : _fmtTime(_startTime!)),
              trailing: const Icon(Icons.access_time),
              onTap: () => _pickTime(true),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(_endTime == null ? 'End Time *' : _fmtTime(_endTime!)),
              trailing: const Icon(Icons.access_time),
              onTap: () => _pickTime(false),
            ),
            const SizedBox(height: 18),

            // Work Location / Locality Section
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Work Location & Locality',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                      ),
                      TextButton.icon(
                        onPressed: _fetchingLocation ? null : _autoFetchLocality,
                        icon: _fetchingLocation
                            ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.my_location, size: 16),
                        label: Text(_fetchingLocation ? 'Detecting...' : 'Detect Locality'),
                      ),
                    ],
                  ),
                  if (_locationStatus != null) ...[
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        _locationStatus!,
                        style: const TextStyle(fontSize: 13, color: AppColors.primary, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                  TextFormField(
                    controller: _localityCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Locality / Area *',
                      hintText: 'e.g. Indiranagar, Sector 62',
                      prefixIcon: Icon(Icons.place_outlined),
                    ),
                    validator: (v) => v == null || v.isEmpty ? 'Locality is required' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _cityCtrl,
                    decoration: const InputDecoration(
                      labelText: 'City *',
                      hintText: 'e.g. Bengaluru, Noida',
                      prefixIcon: Icon(Icons.location_city_outlined),
                    ),
                    validator: (v) => v == null || v.isEmpty ? 'City is required' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _addressCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Street Address / Landmark (optional)',
                      hintText: 'e.g. Near Metro Pillar 42, Shop 5',
                      prefixIcon: Icon(Icons.pin_drop_outlined),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 14),
            TextFormField(
              controller: _paymentCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Payment (₹ / Day) *'),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Posting...' : 'POST JOB'),
            ),
            ],
          ),
        ),
      ),
    );
  }
}
