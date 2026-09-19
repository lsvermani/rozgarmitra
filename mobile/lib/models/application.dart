class JobApplication {
  final String id;
  final String jobId;
  final String jobTitle;
  final String status; // APPLIED, SHORTLISTED, SELECTED, REJECTED, COMPLETED
  final String? workerId;
  final String? workerName;
  final num? jobPayment;
  final DateTime appliedAt;

  JobApplication({
    required this.id,
    required this.jobId,
    required this.jobTitle,
    required this.status,
    this.workerId,
    this.workerName,
    this.jobPayment,
    required this.appliedAt,
  });

  factory JobApplication.fromJson(Map<String, dynamic> json) {
    final job = json['jobId'];
    final worker = json['workerId'];
    return JobApplication(
      id: json['_id'] ?? '',
      jobId: job is Map ? (job['_id'] ?? '') : (job ?? ''),
      jobTitle: job is Map ? (job['title'] ?? '') : '',
      status: json['status'] ?? 'APPLIED',
      workerId: worker is Map ? worker['_id'] : worker,
      workerName: worker is Map ? worker['name'] : null,
      jobPayment: job is Map ? job['payment'] : null,
      appliedAt: DateTime.tryParse(json['appliedAt'] ?? json['createdAt'] ?? '') ?? DateTime.now(),
    );
  }
}
