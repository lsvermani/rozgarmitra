import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../worker/job_list_screen.dart' show kCategories;

class PostJobScreen extends StatefulWidget {
  const PostJobScreen({super.key});

  @override
  State<PostJobScreen> createState() => _PostJobScreenState();
}

class _PostJobScreenState extends State<PostJobScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _skillsCtrl = TextEditingController();
  final _workersCtrl = TextEditingController(text: '1');
  final _paymentCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  String? _category;
  DateTime? _date;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;
  bool _submitting = false;
  String? _error;

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime(bool isStart) async {
    final picked = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 9, minute: 0));
    if (picked != null) setState(() => isStart ? _startTime = picked : _endTime = picked);
  }

  String _fmtTime(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_formKey.currentState!.validate() || _category == null || _date == null || _startTime == null || _endTime == null) {
      setState(() => _error = 'Please fill all required fields.');
      return;
    }
    setState(() => _submitting = true);
    try {
      await context.read<ApiService>().post('/jobs', {
        'title': _titleCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'category': _category,
        'requiredSkills': _skillsCtrl.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList(),
        'workersRequired': int.tryParse(_workersCtrl.text) ?? 1,
        'date': _date!.toIso8601String(),
        'startTime': _fmtTime(_startTime!),
        'endTime': _fmtTime(_endTime!),
        'duration': '1 Day',
        'payment': num.tryParse(_paymentCtrl.text) ?? 0,
        'paymentUnit': 'day',
        'location': {'city': _cityCtrl.text.trim(), 'address': _cityCtrl.text.trim(), 'state': '', 'pincode': ''},
      });
      if (mounted) context.pop(true);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Post a Job')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TextFormField(
              controller: _titleCtrl,
              decoration: const InputDecoration(labelText: 'Job Title'),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              value: _category,
              decoration: const InputDecoration(labelText: 'Category'),
              items: kCategories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => _category = v),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _descCtrl,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Description'),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _skillsCtrl,
              decoration: const InputDecoration(labelText: 'Required Skills (comma separated)'),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _workersCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Number of Workers'),
            ),
            const SizedBox(height: 14),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(_date == null ? 'Select Date' : '${_date!.day}/${_date!.month}/${_date!.year}'),
              trailing: const Icon(Icons.calendar_today),
              onTap: _pickDate,
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(_startTime == null ? 'Start Time' : _fmtTime(_startTime!)),
              trailing: const Icon(Icons.access_time),
              onTap: () => _pickTime(true),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(_endTime == null ? 'End Time' : _fmtTime(_endTime!)),
              trailing: const Icon(Icons.access_time),
              onTap: () => _pickTime(false),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _cityCtrl,
              decoration: const InputDecoration(labelText: 'Location (City / Area)'),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _paymentCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Payment (₹ / Day)'),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Posting...' : 'POST JOB'),
            ),
          ],
        ),
      ),
    );
  }
}
