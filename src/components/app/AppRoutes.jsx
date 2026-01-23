import React, { Suspense, lazy, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { useAuth } from '@/components/AuthContext';

// Lazy load pages for better performance
const Index = lazy(() => import('../../pages/Index'));
const LoginPage = lazy(() => import('../../pages/LoginPage'));
const StillPendingPage = lazy(() => import('../../pages/StillPendingPage'));
const SignupPage = lazy(() => import('../../pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('../../pages/ForgotPasswordPage'));
const ResetCodePage = lazy(() => import('../../pages/ResetCodePage'));
const SetNewPasswordPage = lazy(() => import('../../pages/SetNewPasswordPage'));
const ResetPasswordPage = lazy(() => import('../../pages/ResetPasswordPage'));
const OtpVerificationPage = lazy(
  () => import('../../pages/OtpVerificationPage')
);
const FaceScanPage = lazy(() => import('../../pages/FaceScanPage'));
const FaceRegistrationPage = lazy(
  () => import('../../pages/FaceRegistrationPage')
);
const VerifyIdentityPage = lazy(() => import('../../pages/VerifyIdentityPage'));
const VerifyIdentityPendingPage = lazy(
  () => import('../../pages/VerifyIdentityPendingPage')
);
const VerifyIdentityRejectedPage = lazy(
  () => import('../../pages/VerifyIdentityRejectedPage')
);
const VerifyEmailPage = lazy(() => import('../../pages/VerifyEmailPage'));
const NotFound = lazy(() => import('../../pages/NotFound'));
import HelpPage from '../../pages/HelpPage';
const SettingsPage = lazy(() => import('../../pages/SettingsPage'));

// Lazy load components
const MenuManagement = lazy(() => import('../MenuManagement'));
const SalesAnalytics = lazy(() => import('../SalesAnalytics'));
const EmployeeSchedule = lazy(
  () => import('@/components/EmployeeSchedule.jsx')
);
const CustomerFeedback = lazy(() => import('../CustomerFeedback'));
const POS = lazy(() => import('../POS'));
const Catering = lazy(() => import('../Catering'));
const CateringMenuPage = lazy(() => import('../catering/CateringMenuPage'));
const Inventory = lazy(() => import('../Inventory'));
const Payments = lazy(() => import('../Payments'));
const Users = lazy(() => import('../Users'));
const UserLogs = lazy(() => import('../UserLogs'));
const Notifications = lazy(() => import('../Notifications'));
const MainLayout = lazy(() => import('../../layouts/MainLayout'));

// Loading component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Role restriction helper
const RoleGuard = ({ disallowRoles = [], redirectTo = '/', children }) => {
  const { hasRole } = useAuth();
  if (disallowRoles.some((role) => hasRole(role))) {
    return <Navigate to={redirectTo} replace />;
  }
  return children;
};

// Admin-only route wrapper
const AdminRoute = ({ children }) => {
  const { user, hasRole } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!hasRole('admin')) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-6">
        <div className="max-w-xl w-full border rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">
            Your account can't access User Management, please contact the Admin
          </p>
        </div>
      </div>
    );
  }
  return children;
};

// Public route wrapper (redirects to dashboard if already logged in)
const PublicRoute = ({ children }) => {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// App routes component
const AppRoutes = () => {
  const TitleSetter = () => {
    const location = useLocation();
    useEffect(() => {
      const map = {
        '/': 'Dashboard',
        '/login': 'Login',
        '/still-pending': 'Approval Pending',
        '/signup': 'Sign Up',
        '/forgot-password': 'Forgot Password',
        '/reset-code': 'Reset Code',
        '/set-new-password': 'New Password',
        '/reset-password': 'Reset Password',
        '/otp': 'OTP Verification',
        '/face-scan': 'Face Scan',
        '/face-registration': 'Face Registration',
        '/verify': 'Verify Identity',
        '/verify/pending-confirmation': 'Verification Pending',
        '/verify/rejected': 'Verification Rejected',
        '/verify-email': 'Verify Email',
        '/menu': 'Menu Management',
        '/analytics': 'Analytics',
        '/employees': 'Employee Schedule',

        '/feedback': 'Customer Feedback',
        '/pos': 'Point of Sale',
        '/catering': 'Catering',
        '/catering-menu-selection': 'Catering Menu',
        '/inventory': 'Inventory',
        '/payments': 'Payments',
        '/users': 'User Management',
        '/logs': 'Activity Logs',
        '/notifications': 'Notifications',
        '/settings': 'Settings',
        '/help': 'Help',
      };
      const base = 'TechnoMart';
      const key = location.pathname;
      const title = map[key] ? `${map[key]} - ${base}` : base;
      document.title = title;
    }, [location.pathname]);
    return null;
  };
  return (
    <BrowserRouter>
      <TitleSetter />
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/still-pending"
            element={
              <PublicRoute>
                <StillPendingPage />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <SignupPage />
              </PublicRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicRoute>
                <ForgotPasswordPage />
              </PublicRoute>
            }
          />
          <Route
            path="/reset-code"
            element={
              <PublicRoute>
                <ResetCodePage />
              </PublicRoute>
            }
          />
          <Route
            path="/set-new-password"
            element={
              <PublicRoute>
                <SetNewPasswordPage />
              </PublicRoute>
            }
          />
          <Route
            path="/reset-password"
            element={
              <PublicRoute>
                <ResetPasswordPage />
              </PublicRoute>
            }
          />
          <Route
            path="/otp"
            element={
              <PublicRoute>
                <OtpVerificationPage />
              </PublicRoute>
            }
          />
          <Route
            path="/face-scan"
            element={
              <PublicRoute>
                <FaceScanPage />
              </PublicRoute>
            }
          />
          <Route
            path="/face-registration"
            element={
              <ProtectedRoute>
                <FaceRegistrationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/verify"
            element={
              <PublicRoute>
                <VerifyIdentityPage />
              </PublicRoute>
            }
          />
          <Route
            path="/verify/pending-confirmation"
            element={
              <PublicRoute>
                <VerifyIdentityPendingPage />
              </PublicRoute>
            }
          />
          <Route
            path="/verify/rejected"
            element={
              <PublicRoute>
                <VerifyIdentityRejectedPage />
              </PublicRoute>
            }
          />
          <Route
            path="/verify-email"
            element={
              <PublicRoute>
                <VerifyEmailPage />
              </PublicRoute>
            }
          />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu"
            element={
              <ProtectedRoute>
                <RoleGuard disallowRoles={['staff']}>
                  <MainLayout title="Menu Management">
                    <MenuManagement />
                  </MainLayout>
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <RoleGuard disallowRoles={['staff']}>
                  <MainLayout title="Analytics">
                    <SalesAnalytics />
                  </MainLayout>
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <ProtectedRoute>
                <MainLayout title="Employee Schedule">
                  <EmployeeSchedule />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/feedback"
            element={
              <ProtectedRoute>
                <RoleGuard disallowRoles={['staff']}>
                  <MainLayout title="Customer Feedback">
                    <CustomerFeedback />
                  </MainLayout>
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pos"
            element={
              <ProtectedRoute>
                <MainLayout title="Point of Sale">
                  <POS />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/catering"
            element={
              <ProtectedRoute>
                <RoleGuard disallowRoles={['staff']}>
                  <MainLayout title="Catering Management">
                    <Catering />
                  </MainLayout>
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/catering-menu-selection/:eventId"
            element={
              <ProtectedRoute>
                <RoleGuard disallowRoles={['staff']}>
                  <MainLayout title="Catering Menu">
                    <CateringMenuPage />
                  </MainLayout>
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <RoleGuard disallowRoles={['staff']}>
                  <MainLayout title="Inventory Management">
                    <Inventory />
                  </MainLayout>
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <RoleGuard disallowRoles={['staff']}>
                  <MainLayout title="Payment Management">
                    <Payments />
                  </MainLayout>
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <MainLayout title="User Management">
                    <Users />
                  </MainLayout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/logs"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <MainLayout title="Activity Logs">
                    <UserLogs />
                  </MainLayout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <MainLayout title="Notifications">
                  <Notifications />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <MainLayout title="Settings">
                  <SettingsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/help"
            element={
              <ProtectedRoute>
                <MainLayout title="Help Center">
                  <HelpPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Catch all route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default AppRoutes;
