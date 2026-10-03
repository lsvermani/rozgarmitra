import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { LanguageProvider } from './context/LanguageContext';
import { LocationProvider } from './context/LocationContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Jobs from './pages/Jobs';
import Reports from './pages/Reports';
import Applications from './pages/Applications';
import ActivityLogs from './pages/ActivityLogs';
import OtpVerifications from './pages/OtpVerifications';
import WhatsAppSettings from './pages/WhatsAppSettings';
import SmsGatewaySettings from './pages/SmsGatewaySettings';
import Msg91Login from './pages/Msg91Login';
import WorkerLogin from './pages/WorkerLogin';
import WorkerDashboard from './pages/WorkerDashboard';
import ProductPreview from './pages/ProductPreview';
import EntryWork from './pages/EntryWork';
import LoginRM from './pages/LoginRM';
import PublicApp from './pages/PublicApp';
import './styles.css';

/**
 * The production build is served from a sub-path (see `base` in vite.config.js),
 * so the router must strip that prefix. `BASE_URL` is '/' in dev and ends with a
 * slash in build output â€” React Router expects no trailing slash.
 */
const routerBase = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

function AdminOrCreatorRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/entrywork" replace />;
  if (!['admin', 'job_creator'].includes(user.role)) return <Navigate to="/entrywork" replace />;
  return children;
}

function WorkerRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/entrywork" replace />;
  if (user.role !== 'worker') return <Navigate to="/entrywork" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/entrywork" element={<EntryWork />} />
        {/* Optional MSG91 WhatsApp OTP sign-in. Separate from /entrywork so the
            existing SMS / Firebase flow is never affected. */}
        <Route path="/msg91-login" element={<Msg91Login />} />
      <Route path="/login-rm" element={<LoginRM />} />
      <Route path="/worker/login" element={<WorkerLogin />} />
      <Route path="/find-work" element={<PublicApp />} />
      <Route path="/register" element={<PublicApp />} />
      <Route path="/job/:id" element={<PublicApp />} />
      <Route path="/terms" element={<PublicApp />} />
      <Route path="/privacy" element={<PublicApp />} />
      <Route path="/contact" element={<PublicApp />} />
      <Route path="/" element={<PublicApp />} />
      <Route
        path="/worker"
        element={
          <WorkerRoute>
            <WorkerDashboard />
          </WorkerRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminOrCreatorRoute>
            <Layout />
          </AdminOrCreatorRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="applications" element={<Applications />} />
        <Route path="logs" element={<ActivityLogs />} />
        <Route path="otp-verifications" element={<OtpVerifications />} />
        <Route path="whatsapp" element={<WhatsAppSettings />} />
        <Route path="sms-gateway" element={<SmsGatewaySettings />} />
        <Route path="reports" element={<Reports />} />
        <Route path="preview" element={<ProductPreview />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <LocationProvider>
        <AuthProvider>
          <BrowserRouter basename={routerBase}>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </LocationProvider>
    </LanguageProvider>
  );
}

