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
      localStorage.removeItem('rm_admin_token');
      localStorage.removeItem('rm_admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  sendOtp: (mobile, role) => api.post('/auth/send-otp', { mobile, role }),
  verifyOtp: (mobile, otp) => api.post('/auth/verify-otp', { mobile, otp }),
};

export const jobsApi = {
  list: (params) => api.get('/jobs', { params }),
  create: (data) => api.post('/jobs', data),
  apply: (id) => api.post(`/jobs/${id}/apply`),
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

export default api;
