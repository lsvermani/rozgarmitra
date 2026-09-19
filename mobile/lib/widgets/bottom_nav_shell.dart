import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Wraps each tab's screen with a persistent bottom navigation bar.
/// Used via ShellRoute in app_router.dart so switching tabs doesn't
/// rebuild the whole navigation stack.
class BottomNavShell extends StatelessWidget {
  final Widget child;
  final String role; // 'worker' | 'job_creator'

  const BottomNavShell({super.key, required this.child, required this.role});

  int _indexForLocation(String location) {
    if (role == 'worker') {
      if (location.startsWith('/worker/jobs')) return 1;
      if (location.startsWith('/worker/applications')) return 2;
      if (location.startsWith('/worker/profile')) return 3;
      return 0;
    } else {
      if (location.startsWith('/creator/post-job')) return 1;
      if (location.startsWith('/creator/my-jobs')) return 2;
      if (location.startsWith('/creator/profile')) return 3;
      return 0;
    }
  }

  void _onTap(BuildContext context, int index) {
    if (role == 'worker') {
      switch (index) {
        case 0:
          context.go('/worker/home');
          break;
        case 1:
          context.go('/worker/jobs');
          break;
        case 2:
          context.go('/worker/applications');
          break;
        case 3:
          context.go('/worker/profile');
          break;
      }
    } else {
      switch (index) {
        case 0:
          context.go('/creator/home');
          break;
        case 1:
          context.go('/creator/post-job');
          break;
        case 2:
          context.go('/creator/home'); // "My Jobs" is shown on the dashboard for MVP
          break;
        case 3:
          context.go('/creator/profile');
          break;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final items = role == 'worker'
        ? const [
            BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: 'Home'),
            BottomNavigationBarItem(icon: Icon(Icons.work_outline), activeIcon: Icon(Icons.work), label: 'Jobs'),
            BottomNavigationBarItem(icon: Icon(Icons.assignment_outlined), activeIcon: Icon(Icons.assignment), label: 'Applications'),
            BottomNavigationBarItem(icon: Icon(Icons.person_outline), activeIcon: Icon(Icons.person), label: 'Profile'),
          ]
        : const [
            BottomNavigationBarItem(icon: Icon(Icons.dashboard_outlined), activeIcon: Icon(Icons.dashboard), label: 'Dashboard'),
            BottomNavigationBarItem(icon: Icon(Icons.add_box_outlined), activeIcon: Icon(Icons.add_box), label: 'Post Job'),
            BottomNavigationBarItem(icon: Icon(Icons.list_alt_outlined), activeIcon: Icon(Icons.list_alt), label: 'My Jobs'),
            BottomNavigationBarItem(icon: Icon(Icons.person_outline), activeIcon: Icon(Icons.person), label: 'Profile'),
          ];

    return Scaffold(
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _indexForLocation(location),
        onTap: (i) => _onTap(context, i),
        type: BottomNavigationBarType.fixed,
        items: items,
      ),
    );
  }
}
