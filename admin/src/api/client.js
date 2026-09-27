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
  verifyOtp: (mobile, otp, role, name) => api.post('/auth/verify-otp', { mobile, otp, ...(role ? { role } : {}), ...(name ? { name } : {}) }),
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
  toggleBlock: (id) => api.put(`/admin/users/${id}/block`),
  verifyUser: (id) => api.put(`/admin/users/${id}/verify`),
  getJobs: (params) => api.get('/admin/jobs', { params }),
  removeJob: (id) => api.delete(`/admin/jobs/${id}`),
  getReports: (params) => api.get('/admin/reports', { params }),
  updateReport: (id, status) => api.put(`/admin/reports/${id}`, { status }),
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
