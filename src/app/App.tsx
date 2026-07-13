import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { SessionProvider } from './context/SessionContext';
import { ImpactPreviewProvider } from './context/ImpactPreviewContext';
import { AuthGuard } from './shared/components/AuthGuard';
import { Layout } from './shared/components/Layout';
import { SessionExpiredModal } from './shared/components/SessionExpiredModal';

const LandingPage = lazy(() => import('./pages/landing/LandingPage').then(module => ({ default: module.LandingPage })));
const LoginPage = lazy(() => import('./pages/auth/LoginPage').then(module => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage').then(module => ({ default: module.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage').then(module => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage').then(module => ({ default: module.ResetPasswordPage })));
const PortalPage = lazy(() => import('./pages/portal/PortalPage').then(module => ({ default: module.PortalPage })));
const LibraryPage = lazy(() => import('./pages/library/LibraryPage').then(module => ({ default: module.LibraryPage })));
const UploadPage = lazy(() => import('./pages/upload/UploadPage').then(module => ({ default: module.UploadPage })));
const ValidatePage = lazy(() => import('./pages/validate/validatePage').then(module => ({ default: module.ValidatePage })));
const FundamentalPage = lazy(() => import('./pages/fundamental/FundamentalPage').then(module => ({ default: module.FundamentalPage })));
const ClassificationPage = lazy(() => import('./pages/classification/ClassificationPage').then(module => ({ default: module.ClassificationPage })));
const EnrichmentPage = lazy(() => import('./pages/enrichment/EnrichmentPage').then(module => ({ default: module.EnrichmentPage })));
const AnalysisPage = lazy(() => import('./pages/analysis/AnalysisPage').then(module => ({ default: module.AnalysisPage })));
const ArchitecturePage = lazy(() => import('./pages/architecture/ArchitecturePage').then(module => ({ default: module.ArchitecturePage })));
const ArchitectureFixturePage = lazy(() => import('./pages/architecture/ArchitectureFixturePage').then(module => ({ default: module.ArchitectureFixturePage })));
const DesignDefinitionPage = lazy(() => import('./pages/design-definition/DesignDefinitionPage').then(module => ({ default: module.DesignDefinitionPage })));
const RequirementsPage = lazy(() => import('./pages/requirements/RequirementsPage').then(module => ({ default: module.RequirementsPage })));
const SubsystemsPage = lazy(() => import('./pages/subsystems/SubsystemsPage').then(module => ({ default: module.SubsystemsPage })));
const DesignPage = lazy(() => import('./pages/design/DesignPage').then(module => ({ default: module.DesignPage })));
const ReviewPage = lazy(() => import('./pages/review/ReviewPage').then(module => ({ default: module.ReviewPage })));
const CompletedPage = lazy(() => import('./pages/completed/CompletedPage').then(module => ({ default: module.CompletedPage })));
const OptimizationPage = lazy(() => import('./pages/optimization/OptimizationPage').then(module => ({ default: module.OptimizationPage })));
const ChatConsolePage = lazy(() => import('./pages/chat/ChatConsolePage').then(module => ({ default: module.ChatConsolePage })));

function RouteLoading() {
  return (
    <div className="min-h-screen bg-white text-slate-500 flex items-center justify-center text-sm">
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionProvider>
        <ImpactPreviewProvider>
        <Toaster position="top-right" richColors />
        <SessionExpiredModal />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            {/* Public by design — the recovery link creates a session, but guarding
                this route would race the redirect against session detection. */}
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Authed — AuthGuard redirects to /login if no session */}
            <Route path="/portal" element={<AuthGuard><PortalPage /></AuthGuard>} />
            <Route path="/library" element={<AuthGuard><LibraryPage /></AuthGuard>} />
            <Route path="/upload" element={<AuthGuard><Layout showStageIndicator={true}><UploadPage /></Layout></AuthGuard>} />
            <Route path="/part-identification" element={<AuthGuard><Layout showStageIndicator={true}><FundamentalPage /></Layout></AuthGuard>} />
            <Route path="/system-identification" element={<AuthGuard><Layout showStageIndicator={true}><AnalysisPage /></Layout></AuthGuard>} />
            <Route path="/classification" element={<AuthGuard><Layout showStageIndicator={true}><ClassificationPage /></Layout></AuthGuard>} />
            <Route path="/enrichment" element={<AuthGuard><Layout showStageIndicator={true}><EnrichmentPage /></Layout></AuthGuard>} />
            <Route path="/validate" element={<AuthGuard><Layout showStageIndicator={true}><ValidatePage /></Layout></AuthGuard>} />
            <Route path="/requirements" element={<AuthGuard><Layout showStageIndicator={true}><RequirementsPage /></Layout></AuthGuard>} />
            <Route path="/design-definition" element={<AuthGuard><Layout fixedLayout><DesignDefinitionPage /></Layout></AuthGuard>} />
            <Route path="/architecture" element={<AuthGuard><Layout showStageIndicator={true}><ArchitecturePage /></Layout></AuthGuard>} />
            <Route path="/architecture/fixtures" element={<AuthGuard><ArchitectureFixturePage /></AuthGuard>} />
            <Route path="/subsystems" element={<AuthGuard><Layout showStageIndicator={true}><SubsystemsPage /></Layout></AuthGuard>} />
            <Route path="/design" element={<AuthGuard><Layout showStageIndicator={true}><DesignPage /></Layout></AuthGuard>} />
            <Route path="/review" element={<AuthGuard><Layout><ReviewPage /></Layout></AuthGuard>} />
            <Route path="/completed" element={<AuthGuard><CompletedPage /></AuthGuard>} />
            <Route path="/optimization" element={<AuthGuard><OptimizationPage /></AuthGuard>} />
            <Route path="/chat" element={<AuthGuard><Layout showStageIndicator={true}><ChatConsolePage /></Layout></AuthGuard>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ImpactPreviewProvider>
        </SessionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
