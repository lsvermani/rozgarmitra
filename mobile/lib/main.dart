import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'config/config_manager.dart';
import 'providers/auth_provider.dart';
import 'providers/job_provider.dart';
import 'services/api_service.dart';
import 'utils/app_router.dart';
import 'utils/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase Auth powers the phone/OTP login flow and needs
  // android/app/google-services.json (or firebase_options.dart) to be
  // configured. Keep the app starting (and the rest of the UI usable) when
  // that config is missing — e.g. a fresh checkout running on an emulator.
  try {
    await Firebase.initializeApp();
  } catch (error, stackTrace) {
    debugPrint('Firebase.initializeApp() failed - OTP login will be unavailable: $error');
    debugPrintStack(stackTrace: stackTrace);
  }

  // Administrator-managed server configuration (Server / Admin Settings).
  // Loaded BEFORE the first request so the app talks to the saved backend from
  // the very first call, and installed as the process-wide source of truth for
  // code without a BuildContext. A storage problem must never block start-up.
  final config = ConfigManager();
  ConfigManager.install(config);
  await config
      .load()
      .timeout(const Duration(seconds: 5), onTimeout: () {});

  // App-lifetime singletons, created exactly ONCE before runApp.
  // They must never be constructed inside build(): recreating the GoRouter on
  // a rebuild resets navigation to the initial route and disposes the login
  // screen while its OTP request is still in flight (the router already
  // re-runs redirects on auth changes via `refreshListenable`).
  final api = ApiService(config: config);
  final auth = AuthProvider(api)..restoreSession();
  final jobProvider = JobProvider(api);
  final router = buildRouter(auth);

  runApp(RozgarmitraApp(
    api: api,
    auth: auth,
    jobProvider: jobProvider,
    config: config,
    router: router,
  ));
}

class RozgarmitraApp extends StatelessWidget {
  final ApiService api;
  final AuthProvider auth;
  final JobProvider jobProvider;
  final ConfigManager config;
  final GoRouter router;

  const RozgarmitraApp({
    super.key,
    required this.api,
    required this.auth,
    required this.jobProvider,
    required this.config,
    required this.router,
  });

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiService>.value(value: api),
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<JobProvider>.value(value: jobProvider),
        ChangeNotifierProvider<ConfigManager>.value(value: config),
      ],
      child: MaterialApp.router(
        title: 'RozgarMitra',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        routerConfig: router,
      ),
    );
  }
}

