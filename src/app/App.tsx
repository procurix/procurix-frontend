import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { SessionProvider } from './context/SessionContext';
import { ImpactPreviewProvider } from './context/ImpactPreviewContext';
import { Layout } from './shared/components/Layout';

const LibraryPage = lazy(() => import('./pages/library/LibraryPage').then(module => ({ default: module.LibraryPage })));
const UploadPage = lazy(() => import('./pages/upload/UploadPage').then(module => ({ default: module.UploadPage })));
const ValidatePage = lazy(() => import('./pages/validate/validatePage').then(module => ({ default: module.ValidatePage })));
const FundamentalPage = lazy(() => import('./pages/fundamental/FundamentalPage').then(module => ({ default: module.FundamentalPage })));
const ClassificationPage = lazy(() => import('./pages/classification/ClassificationPage').then(module => ({ default: module.ClassificationPage })));
const EnrichmentPage = lazy(() => import('./pages/enrichment/EnrichmentPage').then(module => ({ default: module.EnrichmentPage })));
const AnalysisPage = lazy(() => import('./pages/analysis/AnalysisPage').then(module => ({ default: module.AnalysisPage })));
const ArchitecturePage = lazy(() => import('./pages/architecture/ArchitecturePage').then(module => ({ default: module.ArchitecturePage })));
const ArchitectureFixturePage = lazy(() => import('./pages/architecture/ArchitectureFixturePage').then(module => ({ default: module.ArchitectureFixturePage })));
const RequirementsPage = lazy(() => import('./pages/requirements/RequirementsPage').then(module => ({ default: module.RequirementsPage })));
const SubsystemsPage = lazy(() => import('./pages/subsystems/SubsystemsPage').then(module => ({ default: module.SubsystemsPage })));
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
      <SessionProvider>
        <ImpactPreviewProvider>
        <Toaster position="top-right" richColors />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/upload" element={<Layout showStageIndicator={true}><UploadPage /></Layout>} />
            <Route path="/part-identification" element={<Layout showStageIndicator={true}><FundamentalPage /></Layout>} />
            <Route path="/system-identification" element={<Layout showStageIndicator={true}><AnalysisPage /></Layout>} />
            <Route path="/classification" element={<Layout showStageIndicator={true}><ClassificationPage /></Layout>} />
            <Route path="/enrichment" element={<Layout showStageIndicator={true}><EnrichmentPage /></Layout>} />
            <Route path="/validate" element={<Layout showStageIndicator={true}><ValidatePage /></Layout>} />
            <Route path="/requirements" element={<Layout showStageIndicator={true}><RequirementsPage /></Layout>} />
            <Route path="/architecture" element={<Layout showStageIndicator={true}><ArchitecturePage /></Layout>} />
            <Route path="/architecture/fixtures" element={<ArchitectureFixturePage />} />
            <Route path="/subsystems" element={<Layout showStageIndicator={true}><SubsystemsPage /></Layout>} />
            <Route path="/review" element={<Layout><ReviewPage /></Layout>} />
            <Route path="/completed" element={<CompletedPage />} />
            <Route path="/optimization" element={<OptimizationPage />} />
            <Route path="/chat" element={<Layout showStageIndicator={true}><ChatConsolePage /></Layout>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ImpactPreviewProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
