import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rm_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const storedUser = JSON.parse(localStorage.getItem('rm_admin_user') || 'null');
      localStorage.removeItem('rm_admin_token');
      localStorage.removeItem('rm_admin_user');
      window.location.href = storedUser?.role === 'admin' ? `${import.meta.env.BASE_URL}login` : `${import.meta.env.BASE_URL}entrywork`;
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  sendOtp: (mobile, role, name) => api.post('/auth/send-otp', { mobile, role, ...(name ? { name } : {}) }),
  /**
   * `liveLocation` is the coordinate object produced by `utils/liveLocation.js`.
   * The backend stores it on the audit row, which is what fills the Activity
   * Logs "Live location" column. Omitted when null so an unlocated visitor
   * still signs in normally.
   */
  verifyOtp: (mobile, otp, role, name, liveLocation) =>
    api.post('/auth/verify-otp', {
      mobile,
      otp,
      ...(role ? { role } : {}),
      ...(name ? { name } : {}),
      ...(liveLocation ? { liveLocation } : {}),
    }),
  /**
   * Records the sign-out for the audit trail. Fire-and-forget: the caller
   * clears its stored token either way, so a failure here must not block logout.
   */
  logout: (token, liveLocation) =>
    api.post(
      '/auth/logout',
      liveLocation ? { liveLocation } : {},
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    ),
};

export const usersApi = {
  getProfile: () => api.get('/users/profile'),
  /**
   * `token` is passed explicitly because during registration the OTP has been
   * verified but the visitor is not signed in yet, so there is nothing in
   * localStorage for the request interceptor to attach. Once signed in the
   * argument can be omitted and the stored session is used.
   */
  updateProfile: (data, token) =>
    api.put('/users/profile', data, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined),
};

export const jobsApi = {
  list: (params) => api.get('/jobs', { params }),
  create: (data) => api.post('/jobs', data),
  apply: (id) => api.post(`/jobs/${id}/apply`),
};

export const applicationsApi = {
  list: (params) => api.get('/applications', { params }),
  updateStatus: (id, status) => api.put(`/applications/${id}/status`, { status }),
};

export const offersApi = {
  submit: (jobId, data) => api.post(`/offers/jobs/${jobId}`, data),
  edit: (id, data) => api.put(`/offers/${id}`, data),
  withdraw: (id) => api.put(`/offers/${id}/withdraw`),
  getMyOffers: () => api.get('/offers/my'),
  getJobOffers: (jobId) => api.get(`/offers/job/${jobId}`),
  select: (id) => api.post(`/offers/${id}/select`),
  reject: (id) => api.post(`/offers/${id}/reject`),
};

export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getUsers: (params) => api.get('/admin/users', { params }),
  // Admin edit of a user's name / mobile / role / rating.
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  toggleBlock: (id) => api.put(`/admin/users/${id}/block`),
  verifyUser: (id) => api.put(`/admin/users/${id}/verify`),
  getJobs: (params) => api.get('/admin/jobs', { params }),
  // Admin edit of a job's title / category / creator / payment.
  updateJob: (id, data) => api.put(`/admin/jobs/${id}`, data),
  removeJob: (id) => api.delete(`/admin/jobs/${id}`),
  getReports: (params) => api.get('/admin/reports', { params }),
  updateReport: (id, status) => api.put(`/admin/reports/${id}`, { status }),
  // Activity Logs page. `filters` is passed straight through as query params.
  getActivityLogs: (params) => api.get('/admin/activity-logs', { params }),
  getActivitySummary: () => api.get('/admin/activity-logs/summary'),

  /** OTP Verification Log - who verified, when, and whether it passed. */
  getOtpVerifications: (params) => api.get('/admin/otp-verifications', { params }),
  getOtpSummary: (params) => api.get('/admin/otp-verifications/summary', { params }),
  getLiveLocations: () => api.get('/admin/activity-logs/live'),
};

/**
 * WhatsApp OTP.
 *
 * The browser only ever talks to this backend. `WHATSAPP_ACCESS_TOKEN`,
 * `WHATSAPP_PHONE_NUMBER_ID` and the HMAC pepper live in the server's
 * environment and are never sent here - the config endpoint returns booleans and
 * a masked hint instead.
 */
/**
 * Android SMS gateway (admin phone + physical SIM as the OTP sender).
 *
 * Admin-only: every route here is behind `settings.configure` or `logs.view`
 * server-side. `SMS_GATEWAY_SECRET` is never returned - the config endpoint
 * reports a boolean and a masked hint.
 */
export const smsGatewayApi = {
  config: () => api.get('/sms-gateway/admin/config'),
  devices: () => api.get('/sms-gateway/admin/devices'),
  stats: () => api.get('/sms-gateway/admin/stats'),
  /** body: { phone } - queues a test message to an arbitrary recipient. */
  sendTestSms: (phone) => api.post('/sms-gateway/admin/test-sms', { phone }),
  /** Releases jobs whose lease expired, so they stop sitting as `unknown`. */
  sweep: () => api.post('/sms-gateway/admin/sweep', {}),
};

/**
 * Admin Panel OTP login (POST /api/auth/request-otp, /api/auth/verify-otp).
 *
 * The browser only ever talks to this backend. The SMS gateway credentials, the
 * HMAC pepper and the OTP itself live exclusively in the server's environment
 * and are never returned here - which is why no call in this object has any way
 * to read them.
 */
export const adminOtpApi = {
  /**
   * body: { phone }. Starts the cooldown and returns the policy the UI needs to
   * drive its countdown. Returns the code itself only when the server has
   * ADMIN_OTP_TEST_MODE on, which it refuses in production.
   */
  requestOtp: (phone) => api.post('/auth/request-otp', { phone }),

  /** body: { phone, otp } -> { token, user }, i.e. the normal admin session. */
  verifyOtp: (phone, otp) => api.post('/auth/verify-otp', { phone, otp }),
};

/** Provider-neutral OTP, chosen by OTP_PROVIDER (gateway / otpdev / ...). */
export const otpApi = {
  sendOtp: (phone, role, purpose = 'registration') =>
    api.post('/auth/send-otp', { phone, purpose, ...(role ? { role } : {}) }),
  verifyOtp: (phone, otp, role, purpose = 'registration', name) =>
    api.post('/auth/verify-otp', {
      phone, otp, purpose,
      ...(role ? { role } : {}),
      ...(name ? { name } : {}),
    }),
};

export const whatsappApi = {
  /** Whether the service is usable, plus the policy a client should enforce. */
  status: () => api.get('/auth/whatsapp/status'),

  /** body: { phone, role?, purpose? }. Never returns the OTP. */
  sendOtp: (phone, role, purpose = 'registration') =>
    api.post('/auth/whatsapp/send-otp', { phone, purpose, ...(role ? { role } : {}) }),

  resendOtp: (phone, role, purpose = 'registration') =>
    api.post('/auth/whatsapp/resend-otp', { phone, purpose, ...(role ? { role } : {}) }),

  /** body: { phone, otp, role?, purpose?, name? } -> { token, user }. */
  verifyOtp: (phone, otp, role, purpose = 'registration', name) =>
    api.post('/auth/whatsapp/verify-otp', {
      phone,
      otp,
      purpose,
      ...(role ? { role } : {}),
      ...(name ? { name } : {}),
    }),

  // --- admin only; the server refuses these without settings.configure ---
  getConfig: () => api.get('/auth/whatsapp/admin/config'),
  testConnection: () => api.post('/auth/whatsapp/admin/test-connection', {}),
  getStats: (params) => api.get('/auth/whatsapp/admin/stats', { params }),
  getFailures: () => api.get('/auth/whatsapp/admin/failures'),
};

export const categoryApi = {
  list: () => api.get('/categories'),
};

export const locationApi = {
  /** Detect locality from the visitor's IP address. */
  detect: () => api.get('/location/detect'),
  /** Reverse geocode GPS coordinates into locality / city / state / pincode. */
  reverse: (lat, lng) => api.get('/location/reverse', { params: { lat, lng } }),
};

export default api;
