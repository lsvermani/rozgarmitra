import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../config/app_environment.dart';
import '../../config/config_manager.dart';
import '../../config/server_config.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/connection_tester.dart';
import '../../utils/app_theme.dart';
import '../../utils/format_utils.dart';
import 'admin_gate.dart';

/// Administrator-only page for pointing the app at a different backend
/// **without rebuilding or reinstalling the APK**.
///
/// Fields (as required): Server base URL, Server IP address, Server port,
/// Forwarded / reverse-proxy address, API base path, Environment, plus the live
/// connection status and last successful connection. Buttons: Test Connection,
/// Save Configuration, Reset to Default (and Restore previous working
/// configuration).
class AdminSettingsScreen extends StatelessWidget {
  const AdminSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Server & Admin Settings'),
      ),
      body: AdminGate(
        intro: 'This page changes the backend every user on this device connects to. '
            'Administrator authorisation is required.',
        builder: (context, unlock) => _AdminSettingsForm(unlock: unlock),
      ),
    );
  }
}

class _AdminSettingsForm extends StatefulWidget {
  const _AdminSettingsForm({required this.unlock});

  final AdminUnlock unlock;

  @override
  State<_AdminSettingsForm> createState() => _AdminSettingsFormState();
}

class _AdminSettingsFormState extends State<_AdminSettingsForm> {
  final _baseUrl = TextEditingController();
  final _ip = TextEditingController();
  final _port = TextEditingController();
  final _forwarded = TextEditingController();
  final _apiPath = TextEditingController();

  late AppEnvironment _environment;
  late bool _useForwarded;
  late bool _allowSaveWithoutTest;

  bool _testing = false;
  bool _saving = false;
  ProbeResult? _result;
  Map<String, String> _errors = const {};

  ConfigManager get _config => context.read<ConfigManager>();

  @override
  void initState() {
    super.initState();
    final saved = context.read<ConfigManager>().config;
    _baseUrl.text = saved.serverBaseUrl;
    _ip.text = saved.serverIp;
    _port.text = saved.serverPort?.toString() ?? '';
    _forwarded.text = saved.forwardedUrl;
    _apiPath.text = saved.apiBasePath;
    _environment = saved.environment;
    _useForwarded = saved.useForwardedUrl;
    _allowSaveWithoutTest = saved.allowSaveWithoutTest;

    for (final controller in [_baseUrl, _ip, _port, _forwarded, _apiPath]) {
      controller.addListener(_onFieldChanged);
    }
  }

  @override
  void dispose() {
    for (final controller in [_baseUrl, _ip, _port, _forwarded, _apiPath]) {
      controller.removeListener(_onFieldChanged);
      controller.dispose();
    }
    super.dispose();
  }

  void _onFieldChanged() {
    // A change invalidates the previous test result and re-renders the preview.
    setState(() {
      _result = null;
      _errors = const {};
    });
  }

  /// Builds the configuration currently described by the form.
  ServerConfig _candidate() => ServerConfig(
        serverBaseUrl: _baseUrl.text.trim(),
        serverIp: _ip.text.trim(),
        serverPort: int.tryParse(_port.text.trim()),
        forwardedUrl: _forwarded.text.trim(),
        useForwardedUrl: _useForwarded,
        apiBasePath: ServerConfig.normalizeApiBasePath(_apiPath.text),
        environment: _environment,
        allowSaveWithoutTest: _allowSaveWithoutTest,
      );

  /// Field errors including the ones only the form can see (non-numeric port).
  Map<String, String> _validate() {
    final errors = Map<String, String>.from(_candidate().fieldErrors());
    final portText = _port.text.trim();
    if (portText.isNotEmpty && int.tryParse(portText) == null) {
      errors['serverPort'] = 'Port must be a number between 1 and 65535.';
    }
    return errors;
  }

  void _reloadFrom(ServerConfig config) {
    _baseUrl.text = config.serverBaseUrl;
    _ip.text = config.serverIp;
    _port.text = config.serverPort?.toString() ?? '';
    _forwarded.text = config.forwardedUrl;
    _apiPath.text = config.apiBasePath;
    setState(() {
      _environment = config.environment;
      _useForwarded = config.useForwardedUrl;
      _allowSaveWithoutTest = config.allowSaveWithoutTest;
      _result = null;
      _errors = const {};
    });
  }

  // --- Actions ---------------------------------------------------------------

  Future<void> _testConnection() async {
    final candidate = _candidate();
    final errors = _validate();
    setState(() {
      _errors = errors;
      _result = null;
      _testing = true;
    });

    if (errors.isNotEmpty) {
      setState(() {
        _testing = false;
        _result = ProbeResult(
          outcome: ConnectionOutcome.invalidUrl,
          message: errors.values.first,
          checkedUrl: candidate.effectiveApiBaseUrl,
        );
      });
      return;
    }

    final result = await _config.test(candidate);
    if (!mounted) return;
    setState(() {
      _testing = false;
      _result = result;
    });
  }

  Future<void> _save() async {
    final candidate = _candidate();
    final errors = _validate();
    if (errors.isNotEmpty) {
      setState(() => _errors = errors);
      _snack('Fix the highlighted fields before saving.', isError: true);
      return;
    }

    final tested = _result;
    final verified = tested?.ok == true &&
        tested!.verifiesApiBase(candidate.effectiveApiBaseUrl);
    if (!verified && !candidate.saveWithoutTestAllowed) {
      _snack('Run a successful "Test Connection" first.', isError: true);
      return;
    }

    final previousUrl = _config.apiBaseUrl;
    final confirmed = await _confirm(
      title: 'Save this server configuration?',
      message: 'Requests will go to:\n${candidate.effectiveApiBaseUrl}\n\n'
          'Current address:\n$previousUrl\n\n'
          '${candidate.environment.requiresHttps ? 'Production mode requires HTTPS.' : 'Only use plain HTTP for development or testing.'}',
      confirmLabel: 'Save configuration',
    );
    if (confirmed != true || !mounted) return;

    setState(() => _saving = true);
    final ok = await _config.save(
      candidate,
      actor: widget.unlock.actor,
      verifiedBy: verified ? tested : null,
    );
    if (!mounted) return;
    setState(() => _saving = false);

    if (!ok) {
      _snack('Configuration was not saved.', isError: true);
      return;
    }

    await _sendAuditToBackend(
      action: 'save',
      summary: 'Android admin changed the API base URL to '
          '${candidate.effectiveApiBaseUrl} (environment=${candidate.environment.id})',
    );
    if (!mounted) return;

    final changedServer = previousUrl != _config.apiBaseUrl;
    if (changedServer) {
      await _promptReLogin(previousUrl);
    } else {
      _snack('Configuration saved. Requests now use ${_config.apiBaseUrl}.');
    }
  }

  Future<void> _resetToDefault() async {
    final confirmed = await _confirm(
      title: 'Reset to the built-in default?',
      message: 'The saved address is removed and the app falls back to '
          '${AppConstants.defaultApiBaseUrl} (compiled into the APK).',
      confirmLabel: 'Reset',
    );
    if (confirmed != true || !mounted) return;

    await _config.resetToDefault(actor: widget.unlock.actor);
    if (!mounted) return;
    _reloadFrom(_config.config);
    _snack('Reset. The app now uses ${_config.apiBaseUrl}.');
  }

  Future<void> _restoreLastWorking() async {
    final target = _config.lastKnownGood;
    if (target == null) {
      _snack('No previous working configuration is stored on this device.', isError: true);
      return;
    }

    final confirmed = await _confirm(
      title: 'Restore the previous working address?',
      message: 'The app will go back to:\n${target.effectiveApiBaseUrl}',
      confirmLabel: 'Restore',
    );
    if (confirmed != true || !mounted) return;

    final ok = await _config.restoreLastWorking(actor: widget.unlock.actor);
    if (!mounted) return;
    if (!ok) {
      _snack('Nothing to restore.', isError: true);
      return;
    }
    _reloadFrom(_config.config);
    _snack('Restored ${_config.apiBaseUrl}. You may need to sign in again.');
  }

  // --- Helpers ---------------------------------------------------------------

  /// Sends the audit line to the backend when the administrator unlocked this
  /// page with a real admin session. Best-effort: the local audit trail already
  /// recorded it, so a failure must never block the save.
  Future<void> _sendAuditToBackend({
    required String action,
    required String summary,
  }) async {
    final token = widget.unlock.adminToken;
    if (token == null) return;
    try {
      final api = context.read<ApiService>().fork()..setToken(token);
      await api.post('/admin/server-config-log', {
        'action': action,
        'actor': widget.unlock.actor,
        'summary': summary,
        'platform': 'android',
      });
    } catch (_) {
      // Older backends without the endpoint, or the old server is unreachable.
    }
  }

  Future<void> _promptReLogin(String previousUrl) async {
    final confirmed = await _confirm(
      title: 'Server changed — sign in again',
      message: 'The saved session belongs to the previous server and is not valid on the '
          'new one.\n\nOld: $previousUrl\nNew: ${_config.apiBaseUrl}',
      confirmLabel: 'Sign out now',
      cancelLabel: 'Later',
    );
    if (confirmed != true || !mounted) return;
    await context.read<AuthProvider>().logout();
    if (!mounted) return;
    context.go('/entrywork');
  }

  void _snack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: isError ? AppColors.danger : null,
        ),
      );
  }

  Future<bool?> _confirm({
    required String title,
    required String message,
    required String confirmLabel,
    String cancelLabel = 'Cancel',
  }) {
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(child: Text(message)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(cancelLabel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
  }

  // --- UI --------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final config = context.watch<ConfigManager>();
    final candidate = _candidate();
    final testOk = _result?.ok == true &&
        _result!.verifiesApiBase(candidate.effectiveApiBaseUrl);
    final canSave = !_saving && (testOk || candidate.saveWithoutTestAllowed);

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _statusCard(config),
            const SizedBox(height: 16),
            if (_errors.isNotEmpty) _errorList(),
            _configSection(),
            _resultSection(candidate, canSave),
            _auditCard(config),
            const SizedBox(height: 16),
            Text(
              'Signed in to this page as ${widget.unlock.actor}'
              '${widget.unlock.viaBackend ? ' (verified by the backend)' : ' (device passcode)'}.\n'
              'Secrets that belong on the server (MongoDB connection string, JWT secret) are '
              'never stored in the app. Configuration is kept in ${config.storageLabel}'
              '${config.storageEncrypted ? '' : ' — WARNING: not encrypted on this platform'}.',
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  // --- Building blocks -------------------------------------------------------

  Widget _section({
    required String title,
    required String? subtitle,
    required List<Widget> children,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          ],
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String label,
    required String hint,
    required String helper,
    required IconData icon,
    required String errorKey,
    TextInputType? keyboardType,
    bool enabled = true,
  }) {
    final error = _errors[errorKey];
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: controller,
        enabled: enabled,
        keyboardType: keyboardType,
        autocorrect: false,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          helperText: helper,
          helperMaxLines: 3,
          errorText: error,
          prefixIcon: Icon(icon),
          suffixIcon: enabled && controller.text.isNotEmpty
              ? IconButton(
                  tooltip: 'Clear',
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: () => controller.clear(),
                )
              : null,
        ),
      ),
    );
  }

  Widget _switchRow({
    required bool value,
    required String title,
    required String subtitle,
    required ValueChanged<bool> onChanged,
  }) {
    // NOTE: intentionally a plain Row + Switch, not a SwitchListTile. The
    // SwitchListTile renders a ListTile under the hood, and ListTile asserts
    // in debug builds when an ancestor DecoratedBox paints a background (the
    // card wrapper in _card()). A plain row avoids that assertion entirely.
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }

  Widget _previewBox(ServerConfig candidate) {
    final errors = _validate();
    final valid = errors.isEmpty;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: valid ? const Color(0xFFF1F5F9) : const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: valid ? AppColors.border : const Color(0xFFFCA5A5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Requests will be sent to',
              style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
          const SizedBox(height: 4),
          SelectableText(
            candidate.effectiveApiBaseUrl,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            valid
                ? 'Health check: ${candidate.effectiveApiBaseUrl}${ConnectionTester.healthPath}'
                : '${errors.length} field problem(s) — see above.',
            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
          if (candidate.usingCompiledDefault) ...[
            const SizedBox(height: 6),
            const Text(
              'Nothing is configured on this device yet: the address compiled into the APK is used.',
              style: TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
          ],
        ],
      ),
    );
  }

  Widget _probeBanner(ProbeResult result) {
    final ok = result.ok;
    final color = ok ? AppColors.success : AppColors.danger;
    final background = ok ? const Color(0xFFDCFCE7) : const Color(0xFFFEE2E2);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(ok ? Icons.check_circle : Icons.error_outline, color: color, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  ok ? 'Connection successful' : 'Connection failed',
                  style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 14),
                ),
              ),
              if (result.latency != null)
                Text('${result.latency!.inMilliseconds} ms',
                    style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
            ],
          ),
          const SizedBox(height: 6),
          Text(result.message, style: const TextStyle(fontSize: 13)),
          const SizedBox(height: 4),
          Text('Checked: ${result.checkedUrl}',
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
          if (result.serverMode != null || result.serverVersion != null)
            Text(
              'Server mode: ${result.serverMode ?? 'unknown'}'
              '${result.serverVersion == null ? '' : ' • API version ${result.serverVersion}'}',
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
        ],
      ),
    );
  }

  Widget _statusCard(ConfigManager config) {
    final probe = _result;
    final status = switch (config.status) {
      ConnectionStatus.testing => ('Testing…', AppColors.accent, Icons.sync),
      ConnectionStatus.connected => ('Connected', AppColors.success, Icons.check_circle),
      ConnectionStatus.failed => ('Not reachable', AppColors.danger, Icons.error_outline),
      ConnectionStatus.unknown => ('Not tested yet', AppColors.textMuted, Icons.help_outline),
    };

    final lastSuccess = config.lastSuccessfulConnection;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Chip(
                avatar: Icon(status.$3, size: 16, color: status.$2),
                label: Text(status.$1),
                labelStyle: TextStyle(color: status.$2, fontWeight: FontWeight.w700, fontSize: 12),
                backgroundColor: Colors.white,
                side: BorderSide(color: status.$2.withValues(alpha: 0.4)),
              ),
              const SizedBox(width: 8),
              // Flexible keeps this row safe on narrow screens / large fonts.
              Expanded(
                child: Text('Environment: ${config.config.environment.label}',
                    textAlign: TextAlign.end,
                    style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _statusRow('Active API base URL', config.apiBaseUrl),
          _statusRow('Connection status', probe == null ? status.$1 : probe.auditSummary),
          _statusRow(
            'Last successful connection',
            lastSuccess == null ? 'Never' : formatTimestamp(lastSuccess),
          ),
          _statusRow('Last successful address', config.lastSuccessfulUrl ?? '—'),
          _statusRow('Configuration source',
              config.usingCompiledDefault ? 'Built-in default (APK)' : 'Saved on this device'),
          _statusRow('App version', AppConstants.appVersion),
        ],
      ),
    );
  }

  Widget _statusRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 168,
            child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  Widget _errorList() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFCA5A5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Check these values',
              style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.danger, fontSize: 13)),
          const SizedBox(height: 6),
          ..._errors.values.map(
            (message) => Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text('• $message',
                  style: const TextStyle(fontSize: 12, color: AppColors.danger)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _configSection() {
    return _section(
      title: 'Server configuration',
      subtitle: 'Leave "Server base URL" empty to build the address from the IP and port. '
          'A "Forwarded address" (reverse proxy) is used only while its switch is on, and then '
          'it takes priority.',
      children: [
        _field(
          controller: _baseUrl,
          label: 'Server base URL',
          hint: 'https://api.example.com',
          helper: 'Full backend address including http:// or https://.',
          icon: Icons.public,
          errorKey: 'serverBaseUrl',
        ),
        _field(
          controller: _ip,
          label: 'Server IP address',
          hint: '192.168.1.100',
          helper: 'Used when no base URL is set.',
          icon: Icons.dns_outlined,
          errorKey: 'serverIp',
          keyboardType: TextInputType.number,
        ),
        _field(
          controller: _port,
          label: 'Server port',
          hint: '8080',
          helper: 'Optional. Defaults to 443 (https) or 80 (http).',
          icon: Icons.numbers,
          errorKey: 'serverPort',
          keyboardType: TextInputType.number,
        ),
        _switchRow(
          value: _useForwarded,
          title: 'Use forwarded / reverse-proxy address',
          subtitle: 'Takes priority over the base URL above.',
          onChanged: (value) => setState(() {
            _useForwarded = value;
            _result = null;
          }),
        ),
        _field(
          controller: _forwarded,
          label: 'Forwarded address (reverse proxy)',
          hint: 'https://example.com/api',
          helper: 'Public address that proxies to the backend. Never applied automatically '
              'from the network — only from this page.',
          icon: Icons.swap_horiz,
          errorKey: 'forwardedUrl',
          enabled: _useForwarded,
        ),
        _field(
          controller: _apiPath,
          label: 'API base path',
          hint: '/api',
          helper: 'Appended to the origin, unless the address already contains a path.',
          icon: Icons.route_outlined,
          errorKey: 'apiBasePath',
        ),
        const SizedBox(height: 4),
        const Text('Environment', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        // A wrapping row of chips instead of a segmented control: it never
        // overflows on small screens (320 dp) and needs no horizontal scroll.
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: AppEnvironment.values
              .map(
                (env) => ChoiceChip(
                  selected: _environment == env,
                  onSelected: (_) => setState(() {
                    _environment = env;
                    _result = null;
                    _errors = const {};
                  }),
                  avatar: Icon(
                    env.requiresHttps ? Icons.lock_outline : Icons.wifi_tethering,
                    size: 16,
                    color: _environment == env ? AppColors.primaryDark : AppColors.textMuted,
                  ),
                  label: Text(env.label),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 6),
        Text(_environment.description,
            style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
        const SizedBox(height: 8),
        _switchRow(
          value: _allowSaveWithoutTest,
          title: 'Advanced: allow saving without a successful test',
          subtitle: _environment == AppEnvironment.development
              ? 'Honoured in Development only — handy before the backend is deployed.'
              : 'Only honoured in Development; ignored in this environment.',
          onChanged: (value) => setState(() {
            _allowSaveWithoutTest = value;
            _result = null;
          }),
        ),
      ],
    );
  }

  Widget _resultSection(ServerConfig candidate, bool canSave) {
    return _section(
      title: 'Connection test & save',
      subtitle: 'The new address is saved only after a successful test (unless the advanced '
          'Development override is on).',
      children: [
        _previewBox(candidate),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _testing ? null : _testConnection,
            icon: _testing
                ? const SizedBox(
                    width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.network_check),
            label: Text(_testing ? 'Testing…' : 'Test Connection'),
          ),
        ),
        if (_result != null) ...[
          const SizedBox(height: 12),
          _probeBanner(_result!),
        ],
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: canSave ? _save : null,
            icon: _saving
                ? const SizedBox(
                    width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save_outlined),
            label: const Text('Save Configuration'),
          ),
        ),
        if (!canSave && !_saving)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('A successful "Test Connection" is required before saving.',
                style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
          ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _saving ? null : _resetToDefault,
              icon: const Icon(Icons.restart_alt),
              label: const Text('Reset to Default'),
            ),
            OutlinedButton.icon(
              onPressed:
                  (_saving || !context.watch<ConfigManager>().canRestoreLastWorking)
                      ? null
                      : _restoreLastWorking,
              icon: const Icon(Icons.settings_backup_restore),
              label: const Text('Restore previous working'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _auditCard(ConfigManager config) {
    final entries = config.audit.reversed.take(10).toList(growable: false);
    return _section(
      title: 'Configuration history (this device)',
      subtitle: 'Passwords, tokens and MongoDB credentials are never written here.',
      children: [
        if (entries.isEmpty)
          const Text('No changes recorded yet.',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted))
        else
          ...entries.map(
            (entry) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    entry.success ? Icons.check_circle_outline : Icons.block,
                    size: 16,
                    color: entry.success ? AppColors.success : AppColors.danger,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${entry.action.toUpperCase()} • ${entry.actor}',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        Text(entry.summary,
                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                        Text(formatTimestamp(entry.at),
                            style: const TextStyle(fontSize: 10, color: AppColors.textMuted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

}
