import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';

import 'providers/auth_provider.dart';
import 'providers/job_provider.dart';
import 'services/api_service.dart';
import 'utils/app_router.dart';
import 'utils/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  runApp(const RozgarmitraApp());
}

class RozgarmitraApp extends StatelessWidget {
  const RozgarmitraApp({super.key});

  @override
  Widget build(BuildContext context) {
    final api = ApiService();

    return MultiProvider(
      providers: [
        Provider<ApiService>.value(value: api),
        ChangeNotifierProvider(create: (_) => AuthProvider(api)..restoreSession()),
        ChangeNotifierProvider(create: (_) => JobProvider(api)),
      ],
      child: Builder(
        builder: (context) {
          final auth = context.watch<AuthProvider>();
          return MaterialApp.router(
            title: 'Rozgarmitra',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            routerConfig: buildRouter(auth),
          );
        },
      ),
    );
  }
}
