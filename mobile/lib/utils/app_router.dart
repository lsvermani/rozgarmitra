import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../widgets/bottom_nav_shell.dart';

import '../screens/auth/splash_screen.dart';
import '../screens/auth/role_select_screen.dart';
import '../screens/auth/entrywork_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/whatsapp_otp_screen.dart';
import '../screens/auth/profile_setup_screen.dart';
import '../screens/worker/worker_home_screen.dart';
import '../screens/worker/job_list_screen.dart';
import '../screens/worker/job_detail_screen.dart';
import '../screens/worker/worker_applications_screen.dart';
import '../screens/creator/creator_home_screen.dart';
import '../screens/creator/my_jobs_screen.dart';
import '../screens/creator/post_job_screen.dart';
import '../screens/creator/creator_applications_screen.dart';
import '../screens/shared/profile_screen.dart';
import '../screens/shared/notifications_screen.dart';
import '../screens/admin/admin_settings_screen.dart';

GoRouter buildRouter(AuthProvider auth) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: auth,
    redirect: (context, state) {
      final loggedIn = auth.isLoggedIn;
      final loc = state.matchedLocation;
      // /admin/server-settings stays reachable WITHOUT a session on purpose: it
      // is the recovery path when the saved server address is wrong, so the
      // user cannot log in at all. The screen itself is protected by AdminGate
      // (backend admin OTP or the device recovery passcode).
      final isAuthFlow = loc == '/' ||
          loc == '/entrywork' ||
          loc == '/role-select' ||
          loc.startsWith('/login') ||
          // Must be listed here too: without a session this is where a user is
          // trying to sign in, so treating it as a protected route would bounce
          // them straight back to /entrywork in a loop.
          loc.startsWith('/whatsapp-login') ||
          loc == '/profile-setup' ||
          loc == '/admin/server-settings';

      if (!loggedIn && !isAuthFlow) return '/entrywork';
      if (loggedIn &&
          (loc == '/entrywork' ||
              loc == '/role-select' ||
              loc.startsWith('/login') ||
              loc.startsWith('/whatsapp-login'))) {
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

      // Optional WhatsApp OTP sign-in, offered alongside the SMS / Firebase path.
      // The existing /login flow is untouched, so WhatsApp being unavailable (or
      // unconfigured) changes nothing for anyone who does not open this route.
      GoRoute(
        path: '/whatsapp-login',
        builder: (context, state) =>
            WhatsappOtpScreen(role: state.uri.queryParameters['role'] ?? 'worker'),
      ),

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
          GoRoute(path: '/creator/my-jobs', builder: (context, state) => const MyJobsScreen()),
          GoRoute(path: '/creator/profile', builder: (context, state) => const ProfileScreen()),
        ],
      ),
      GoRoute(
        path: '/creator/applications/:jobId',
        builder: (context, state) => CreatorApplicationsScreen(jobId: state.pathParameters['jobId']!),
      ),

      GoRoute(path: '/notifications', builder: (context, state) => const NotificationsScreen()),

      // Administrator-only: change the backend server address at runtime.
      GoRoute(
        path: '/admin/server-settings',
        builder: (context, state) => const AdminSettingsScreen(),
      ),
    ],
  );
}
