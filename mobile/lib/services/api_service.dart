import 'dart:convert';
import 'package:http/http.dart' as http;
import '../utils/app_theme.dart';

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

/// Thin wrapper around http package. Centralizes base URL, auth header
/// injection, and error handling so screens don't repeat boilerplate.
class ApiService {
  final String baseUrl;
  String? _token;

  ApiService({this.baseUrl = AppConstants.apiBaseUrl});

  void setToken(String? token) => _token = token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final cleanQuery = query == null
        ? <String, String>{}
        : (query.map((k, v) => MapEntry(k, v.toString()))..removeWhere((k, v) => v == 'null'));
    return Uri.parse('$baseUrl$path').replace(queryParameters: cleanQuery);
  }

  Future<Map<String, dynamic>> _handle(http.Response res) async {
    final body = res.body.isNotEmpty ? jsonDecode(res.body) : {};
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return body;
    }
    throw ApiException(body['message'] ?? 'Something went wrong (${res.statusCode}).');
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) async {
    final res = await http.get(_uri(path, query), headers: _headers);
    return _handle(res);
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> data) async {
    final res = await http.post(_uri(path), headers: _headers, body: jsonEncode(data));
    return _handle(res);
  }

  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> data) async {
    final res = await http.put(_uri(path), headers: _headers, body: jsonEncode(data));
    return _handle(res);
  }

  Future<Map<String, dynamic>> delete(String path) async {
    final res = await http.delete(_uri(path), headers: _headers);
    return _handle(res);
  }
}
