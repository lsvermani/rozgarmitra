import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../utils/app_theme.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _updatingLocation = false;

  Future<void> _updateLocality() async {
    setState(() => _updatingLocation = true);
    final scaffold = ScaffoldMessenger.of(context);
    try {
      // GPS-only: fetch live GPS; surfaces a clear message when GPS is
      // off / denied / timed out instead of silently using IP/cached data.
      final loc = await LocationService.fetchGpsLocation();
      if (!mounted) return;
      final api = context.read<ApiService>();
      final auth = context.read<AuthProvider>();
      await api.put('/users/profile', {
        'location': loc.toJson(),
      });
      await auth.refreshProfile();
      scaffold.showSnackBar(
        SnackBar(content: Text('✅ GPS locality updated to ${loc.displayLocation}')),
      );
    } on LocationException catch (e) {
      scaffold.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      scaffold.showSnackBar(SnackBar(content: Text('Failed to update location: $e')));
    } finally {
      if (mounted) setState(() => _updatingLocation = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.currentUser;
    if (user == null) return const SizedBox.shrink();

    final locationDisplay = user.location?.displayLocation.isNotEmpty == true
        ? user.location!.displayLocation
        : 'Location not set';

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Center(
            child: CircleAvatar(
              radius: 44,
              backgroundColor: AppColors.primaryLight,
              child: Text(
                user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
                style: const TextStyle(fontSize: 32, color: AppColors.primary, fontWeight: FontWeight.w800),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              user.businessName ?? user.name,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
          ),
          Center(child: Text(user.mobile, style: const TextStyle(color: AppColors.textMuted))),
          const SizedBox(height: 8),
          Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('⭐ ${user.rating.toStringAsFixed(1)} (${user.ratingCount})'),
                const SizedBox(width: 12),
                if (user.verified)
                  const Chip(
                    label: Text('Verified ✓'),
                    backgroundColor: AppColors.primaryLight,
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Locality Card
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                const Icon(Icons.location_on, color: AppColors.primary, size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Locality / Area',
                        style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        locationDisplay,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                      ),
                      if (user.location?.latitude != null && user.location?.longitude != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          'GPS: ${user.location!.latitude!.toStringAsFixed(4)}, ${user.location!.longitude!.toStringAsFixed(4)}',
                          style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                        ),
                      ],
                    ],
                  ),
                ),
                TextButton.icon(
                  onPressed: _updatingLocation ? null : _updateLocality,
                  icon: _updatingLocation
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.my_location, size: 16),
                  label: Text(_updatingLocation ? 'Updating...' : 'Update'),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),
          if (user.role == 'worker') ...[
            const Text('Skills', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: user.skills.map((s) => Chip(label: Text(s))).toList(),
            ),
            const SizedBox(height: 16),
            _StatRow(label: 'Experience', value: '${user.experienceYears} Years'),
            _StatRow(label: 'Completed Jobs', value: '${user.completedJobs}'),
          ] else
            _StatRow(label: 'Completed Jobs', value: '${user.completedJobs}'),
          const SizedBox(height: 32),
          // Administrators can point the app at another backend at runtime.
          // Hidden for workers/job creators; also protected by AdminGate.
          if (user.role == 'admin') ...[
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              // NOTE: a plain Material + InkWell keeps the ripple visible. A
              // ListTile here trips Flutter's debug assertion because it paints
              // its background on the nearest Material *above* this Container's
              // DecoratedBox (see admin_settings_screen test failures).
              child: Material(
                type: MaterialType.transparency,
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => context.push('/admin/server-settings'),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        Icon(Icons.settings_suggest_outlined, color: AppColors.primary),
                        SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Server & Admin Settings',
                                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                              SizedBox(height: 2),
                              Text('Change the backend address, test the connection',
                                  style: TextStyle(fontSize: 12)),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_right),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],
          OutlinedButton(
            onPressed: () async {
              await auth.logout();
              if (context.mounted) context.go('/entrywork');
            },
            child: const Text('Log Out'),
          ),
        ],
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  final String label;
  final String value;
  const _StatRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textMuted)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
