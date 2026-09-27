class WorkerOffer {
  final String id;
  final String jobId;
  final String workerId;
  final num proposedAmount;
  final String message;
  final bool availabilityConfirmation;
  final String status; // PENDING, ACCEPTED, REJECTED, WITHDRAWN, EXPIRED
  final DateTime createdAt;

  WorkerOffer({
    required this.id,
    required this.jobId,
    required this.workerId,
    required this.proposedAmount,
    this.message = '',
    this.availabilityConfirmation = true,
    required this.status,
    required this.createdAt,
  });

  factory WorkerOffer.fromJson(Map<String, dynamic> json) {
    return WorkerOffer(
      id: json['_id'] ?? '',
      jobId: json['jobId'] is Map ? (json['jobId']['_id'] ?? '') : (json['jobId'] ?? ''),
      workerId: json['workerId'] is Map ? (json['workerId']['_id'] ?? '') : (json['workerId'] ?? ''),
      proposedAmount: json['proposedAmount'] ?? 0,
      message: json['message'] ?? '',
      availabilityConfirmation: json['availabilityConfirmation'] ?? true,
      status: json['status'] ?? 'PENDING',
      createdAt: DateTime.tryParse(json['createdAt'] ?? '') ?? DateTime.now(),
    );
  }
}
