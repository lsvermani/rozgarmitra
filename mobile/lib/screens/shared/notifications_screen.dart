import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<dynamic> _notifications = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await context.read<ApiService>().get('/notifications');
      setState(() => _notifications = res['notifications']);
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _markRead(String id) async {
    await context.read<ApiService>().put('/notifications/$id/read', {});
    _load();
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'NEW_JOB_NEARBY':
        return Icons.work_outline;
      case 'APPLICATION_SHORTLISTED':
      case 'APPLICATION_SELECTED':
        return Icons.celebration_outlined;
      case 'APPLICATION_REJECTED':
        return Icons.info_outline;
      case 'NEW_APPLICATION':
        return Icons.person_add_alt_outlined;
      case 'JOB_COMPLETED':
        return Icons.check_circle_outline;
      case 'RATING_RECEIVED':
        return Icons.star_border;
      default:
        return Icons.notifications_none;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _notifications.isEmpty
                ? const Center(child: Text('No notifications yet.'))
                : ListView.builder(
                    itemCount: _notifications.length,
                    itemBuilder: (context, i) {
                      final n = _notifications[i];
                      final read = n['read'] == true;
                      return ListTile(
                        onTap: () => _markRead(n['_id']),
                        leading: Icon(_iconFor(n['type'] ?? ''), color: read ? AppColors.textMuted : AppColors.primary),
                        title: Text(n['title'] ?? '', style: TextStyle(fontWeight: read ? FontWeight.w500 : FontWeight.w800)),
                        subtitle: Text(n['message'] ?? ''),
                        tileColor: read ? null : AppColors.primaryLight.withValues(alpha: 0.3),
                      );
                    },
                  ),
      ),
    );
  }
}
