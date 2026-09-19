import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../widgets/bottom_nav_shell.dart';

import '../screens/auth/splash_screen.dart';
import '../screens/auth/role_select_screen.dart';
import '../screens/auth/entrywork_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/profile_setup_screen.dart';
import '../screens/worker/worker_home_screen.dart';
import '../screens/worker/job_list_screen.dart';
import '../screens/worker/job_detail_screen.dart';
import '../screens/worker/worker_applications_screen.dart';
import '../screens/creator/creator_home_screen.dart';
import '../screens/creator/post_job_screen.dart';
import '../screens/creator/creator_applications_screen.dart';
import '../screens/shared/profile_screen.dart';
import '../screens/shared/notifications_screen.dart';

GoRouter buildRouter(AuthProvider auth) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: auth,
    redirect: (context, state) {
      final loggedIn = auth.isLoggedIn;
      final loc = state.matchedLocation;
      final isAuthFlow = loc == '/' || loc == '/entrywork' || loc == '/role-select' || loc.startsWith('/login') || loc == '/profile-setup';

      if (!loggedIn && !isAuthFlow) return '/role-select';
      if (loggedIn && (loc == '/entrywork' || loc == '/role-select' || loc.startsWith('/login'))) {
        return auth.currentUser!.role == 'worker' ? '/worker/home' : '/creator/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/entrywork', builder: (context, state) => const EntryWorkScreen()),
      GoRoute(path: '/role-select', builder: (context, state) => const RoleSelectScreen()),
      GoRoute(
        path: '/login',
        builder: (context, state) => LoginScreen(role: state.uri.queryParameters['role'] ?? 'worker'),
      ),
      GoRoute(path: '/profile-setup', builder: (context, state) => const ProfileSetupScreen()),

      // Worker tab shell
      ShellRoute(
        builder: (context, state, child) => BottomNavShell(role: 'worker', child: child),
        routes: [
          GoRoute(path: '/worker/home', builder: (context, state) => const WorkerHomeScreen()),
          GoRoute(path: '/worker/jobs', builder: (context, state) => const JobListScreen()),
          GoRoute(path: '/worker/applications', builder: (context, state) => const WorkerApplicationsScreen()),
          GoRoute(path: '/worker/profile', builder: (context, state) => const ProfileScreen()),
        ],
      ),
      GoRoute(
        path: '/worker/jobs/:id',
        builder: (context, state) => JobDetailScreen(jobId: state.pathParameters['id']!),
      ),

      // Job creator tab shell
      ShellRoute(
        builder: (context, state, child) => BottomNavShell(role: 'job_creator', child: child),
        routes: [
          GoRoute(path: '/creator/home', builder: (context, state) => const CreatorHomeScreen()),
          GoRoute(path: '/creator/post-job', builder: (context, state) => const PostJobScreen()),
          GoRoute(path: '/creator/profile', builder: (context, state) => const ProfileScreen()),
        ],
      ),
      GoRoute(
        path: '/creator/applications/:jobId',
        builder: (context, state) => CreatorApplicationsScreen(jobId: state.pathParameters['jobId']!),
      ),

      GoRoute(path: '/notifications', builder: (context, state) => const NotificationsScreen()),
    ],
  );
}
