import 'package:flutter/foundation.dart';
import 'dart:async';
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService api;
  AppUser? currentUser;
  String? token;
  bool isLoading = false;
  String? verificationId;
  String? authError;

  /// True when a saved session could only be restored from the on-device cache
  /// because the backend was unreachable. The token is kept (it is not expired
  /// as far as we know) and the next successful request clears this flag.
  bool offlineSession = false;

  /// OTP handed back by the backend while APP_MODE=demo, so the login screen
  /// can auto-fill it. Stays null when Firebase phone auth is in use.
  String? demoOtp;

  AuthProvider(this.api);


  bool get isLoggedIn => currentUser != null && token != null;

  /// Firebase phone auth is only usable once Firebase.initializeApp() has
  /// succeeded (it needs android/app/google-services.json). Until that config
  /// exists — e.g. running on an emulator against the local demo backend —
  /// OTP is sent/verified through the backend's own endpoints, which accept
  /// the fixed demo OTP in demo mode.
  bool get _isFirebaseReady => Firebase.apps.isNotEmpty;

  Future<void> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final savedToken = prefs.getString('rm_token');
    if (savedToken == null) {
      notifyListeners();
      return;
    }

    token = savedToken;
    api.setToken(savedToken);

    // Show the last known profile immediately so the app opens instantly (and
    // still opens when the device is offline).
    final cached = prefs.getString('rm_user');
    if (cached != null) {
      try {
        currentUser = AppUser.fromJson(jsonDecode(cached) as Map<String, dynamic>);
      } catch (_) {
        currentUser = null;
      }
    }
    notifyListeners();

    // Then confirm with the server. Only a real 401/403 ends the session — a
    // flaky network must not log the user out.
    try {
      final res = await api.get('/users/profile');
      currentUser = AppUser.fromJson(res['user']);
      offlineSession = false;
      await _persistUser(res['user']);
    } on ApiException catch (error) {
      if (error.isAuthError) {
        await logout();
        return;
      }
      offlineSession = true;
    } catch (_) {
      offlineSession = true;
    }
    notifyListeners();
  }

  /// Retries the profile fetch after an offline start (called by the UI when the
  /// network comes back).
  Future<bool> retrySession() async {
    if (token == null) return false;
    try {
      final res = await api.get('/users/profile');
      currentUser = AppUser.fromJson(res['user']);
      offlineSession = false;
      await _persistUser(res['user']);
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _persistUser(Map<String, dynamic>? raw) async {
    if (raw == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rm_user', jsonEncode(raw));
  }

  Future<void> sendOtp(String mobile, {String? role}) async {
    isLoading = true;
    authError = null;
    notifyListeners();
    try {
      if (!_isFirebaseReady) {
        final res = await api.post('/auth/send-otp', {
          'mobile': mobile,
          if (role != null) 'role': role,
        });
        demoOtp = res['demoOtp'] as String?;
        return;
      }

      demoOtp = null;
      final phoneNumber = '+91$mobile';
      final result = Completer<void>();
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: phoneNumber,
        verificationCompleted: (credential) async {
          try {
            final firebaseUser = (await FirebaseAuth.instance.signInWithCredential(credential)).user;
            if (firebaseUser == null) throw ApiException('Firebase authentication failed.');
            await _applyAuthResult(await _exchangeFirebaseToken(firebaseUser, role: role));
            if (!result.isCompleted) result.complete();
          } catch (error) {
            if (!result.isCompleted) result.completeError(error);
          }
        },
        verificationFailed: (error) {
          if (!result.isCompleted) result.completeError(ApiException(error.message ?? 'Unable to send OTP.'));
        },
        codeSent: (id, _) {
          verificationId = id;
          if (!result.isCompleted) result.complete();
        },
        codeAutoRetrievalTimeout: (id) {
          verificationId = id;
          if (!result.isCompleted) result.complete();
        },
      );
      await result.future;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> verifyOtp(String mobile, String otp, {String? role}) async {
    isLoading = true;
    authError = null;
    notifyListeners();
    try {
      if (!_isFirebaseReady) {
        final res = await api.post('/auth/verify-otp', {
          'mobile': mobile,
          'otp': otp,
          if (role != null) 'role': role,
        });
        await _applyAuthResult(res);
        return;
      }

      if (verificationId == null) throw ApiException('Request an OTP first.');
      final credential = PhoneAuthProvider.credential(
        verificationId: verificationId!,
        smsCode: otp,
      );
      final firebaseUser = (await FirebaseAuth.instance.signInWithCredential(credential)).user;
      if (firebaseUser == null) throw ApiException('Firebase authentication failed.');
      await _applyAuthResult(await _exchangeFirebaseToken(firebaseUser, role: role));
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  /// Verifies the Firebase ID token with the backend in exchange for a
  /// Rozgarmitra JWT. Persisting the session is handled by [_applyAuthResult].
  Future<Map<String, dynamic>> _exchangeFirebaseToken(User firebaseUser, {String? role}) async {
    final firebaseToken = await firebaseUser.getIdToken();
    if (firebaseToken == null) throw ApiException('Unable to obtain Firebase token.');
    return api.post('/auth/firebase', {
      'idToken': firebaseToken,
      if (role != null) 'role': role,
    });
  }

  /// Stores the session returned by either auth path (`/auth/verify-otp` or
  /// `/auth/firebase`) so both behave identically afterwards.
  Future<Map<String, dynamic>> _applyAuthResult(Map<String, dynamic> res) async {
    token = res['token'];
    currentUser = AppUser.fromJson(res['user']);
    api.setToken(token);
    offlineSession = false;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rm_token', token!);
    await _persistUser(res['user']);
    return res;
  }

  /// Adopts a session obtained through another verified channel (currently the
  /// WhatsApp OTP flow) and persists it exactly like `_applyAuthResult`.
  ///
  /// Public so the WhatsApp screen can complete a sign-in without duplicating the
  /// persistence rules; it deliberately does not sign out of Firebase, because a
  /// WhatsApp sign-in says nothing about that Firebase session.
  Future<void> adoptSession(Map<String, dynamic> res) async {
    await _applyAuthResult(res);
    notifyListeners();
  }

  Future<void> logout() async {
    if (_isFirebaseReady) await FirebaseAuth.instance.signOut();
    token = null;
    currentUser = null;
    offlineSession = false;
    api.setToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('rm_token');
    await prefs.remove('rm_user');
    notifyListeners();
  }

  Future<void> refreshProfile() async {
    final res = await api.get('/users/profile');
    currentUser = AppUser.fromJson(res['user']);
    offlineSession = false;
    await _persistUser(res['user']);
    notifyListeners();
  }
}

