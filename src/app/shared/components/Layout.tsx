import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Cpu, ArrowLeft, Loader2, LogOut, MessageSquare, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ChatDrawer } from '@/app/shared/components/ChatDrawer';
import { Button } from '@/app/shared/components/ui/button';
import { StageIndicator } from '@/app/shared/components/StageIndicator';
import { useState, useEffect } from 'react';
import { CommandPalette } from '@/app/shared/components/CommandPalette';
import type { SessionStage } from '@/app/types';
import { useAuth } from '@/app/context/AuthContext';
import { useSession } from '@/app/context/SessionContext';
import { deleteDesign, getBOMBySessionId } from '@/app/services/api';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import { getRouteForStage, getStageForNumber, getStageNumber, ROUTE_TO_STAGE, STAGE_TO_ROUTE, withSession } from '@/app/shared/utils/workflowStages';

interface LayoutProps {
  children: React.ReactNode;
  showBackButton?: boolean;
  showStageIndicator?: boolean;
  fixedLayout?: boolean;
}

// Pages that have their own embedded chat — drawer and button hidden there
const PAGES_WITH_OWN_CHAT = new Set(['/system-identification', '/chat']);

export function Layout({ children, showBackButton = true, showStageIndicator = false, fixedLayout = false }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelInFlight, setCancelInFlight] = useState(false);
  const { user, signOut } = useAuth();
  const {
    sessionId,
    setSessionId,
    currentStage: maxReachedStage,
    setCurrentStage,
    refreshTrigger,
  } = useSession();
  const { sessionId: querySessionId } = useQueryParams();
  const [, setIsLoadingBOM] = useState(false);
  const activeSessionId = querySessionId || sessionId;
  const isSyncingUrlSession = Boolean(querySessionId && querySessionId !== sessionId);
  const activeMaxReachedStage = isSyncingUrlSession ? null : maxReachedStage;

  const hasOwnChat = PAGES_WITH_OWN_CHAT.has(location.pathname);
  const usesFixedWorkspace = fixedLayout;

  const getCurrentStage = (): SessionStage | null => {
    return ROUTE_TO_STAGE[location.pathname] || null;
  };

  const currentStage = getCurrentStage();
  const currentRouteStageNumber = getStageNumber(currentStage);
  const indicatorStage = currentStage
    ?? (activeMaxReachedStage !== null && activeMaxReachedStage !== undefined
      ? getStageForNumber(activeMaxReachedStage)
      : null);

  useEffect(() => {
    if (querySessionId && querySessionId !== sessionId) {
      setSessionId(querySessionId);
    }
  }, [querySessionId, sessionId, setSessionId]);

  // Fetch canonical backend stage. This can move backward when a review blocker
  // is discovered, so it must not be gated by the local optimistic stage.
  useEffect(() => {
    let cancelled = false;
    const fetchBOMData = async () => {
      if (location.pathname === '/upload' && !activeSessionId) {
        setCurrentStage(null);
        return;
      }
      if (activeSessionId) {
        setIsLoadingBOM(true);
        try {
          const bom = await getBOMBySessionId(activeSessionId);
          if (!cancelled && bom) setCurrentStage(bom.current_stage);
        } catch (error) {
          if (!cancelled) console.error('Error fetching BOM data:', error);
        } finally {
          if (!cancelled) setIsLoadingBOM(false);
        }
      }
    };
    fetchBOMData();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, refreshTrigger, setCurrentStage, location.pathname]);

  useEffect(() => {
    if (!activeSessionId || !activeMaxReachedStage || !currentRouteStageNumber) return;
    if (currentRouteStageNumber <= activeMaxReachedStage) return;

    const targetRoute = getRouteForStage(activeMaxReachedStage);
    navigate(withSession(targetRoute, activeSessionId), { replace: true });
  }, [activeSessionId, activeMaxReachedStage, currentRouteStageNumber, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close drawer when navigating to a page with its own chat
  useEffect(() => {
    if (hasOwnChat) setDrawerOpen(false);
  }, [location.pathname, hasOwnChat]);

  const handleCommand = (command: string) => {
    const commandRoutes: Record<string, string> = {
      home: '/',
      upload: '/upload',
      'part-identification': '/part-identification',
      'system-identification': '/system-identification',
      classification: '/classification',
      validate: '/validate',
      architecture: '/architecture',
      requirements: '/requirements',
      subsystems: '/subsystems',
      review: '/review',
      completed: '/completed',
      chat: '/chat',
    };
    const route = commandRoutes[command];
    if (route) navigate(withSession(route, activeSessionId));
    setCommandPaletteOpen(false);
  };

  const handleCancelBomUpload = async () => {
    if (!activeSessionId || cancelInFlight) return;
    setCancelInFlight(true);
    try {
      await deleteDesign(activeSessionId);
      toast.success('BOM upload cancelled');
      setSessionId(null);
      setCurrentStage(null);
      setCancelConfirmOpen(false);
      navigate('/portal');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel BOM upload');
    } finally {
      setCancelInFlight(false);
    }
  };

  // Pages that render their own chrome — no Layout header for these. Public
  // pages (landing, login, register) are not wrapped in Layout in App.tsx
  // at all, but we keep '/' here as a defensive no-op in case anything is
  // passed through.
  if (
    location.pathname === '/'
    || location.pathname === '/completed'
    || location.pathname === '/portal'
    || location.pathname === '/library'
    || location.pathname === '/login'
    || location.pathname === '/register'
  ) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b bg-white px-6 py-4 shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <Link to="/portal">
                <Button variant="ghost" size="icon" className="mr-2">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
            )}
            <Cpu className="h-8 w-8 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">BOM Evolution Platform</h1>
              <p className="text-sm text-gray-600">Workflow Stages</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Cancel BOM Upload — only while an active session is being worked
                through the staged workflow. Tucked away from the primary
                actions so it can't be hit accidentally. */}
            {showStageIndicator && activeSessionId && (
              <button
                onClick={() => setCancelConfirmOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                title="Permanently delete this BOM and exit the workflow"
              >
                <XCircle className="h-4 w-4" />
                <span>Cancel BOM Upload</span>
              </button>
            )}

            {/* Chat button — hidden on pages with their own console */}
            {activeSessionId && !hasOwnChat && (
              <button
                onClick={() => setDrawerOpen(prev => !prev)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                  drawerOpen
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                <span>Chat</span>
              </button>
            )}

            {/* Sign out — Supabase signOut + bounce to landing. */}
            {user && (
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            )}
          </div>
        </div>

        {showStageIndicator && indicatorStage && (
          <div className="flex w-full justify-center">
          <StageIndicator
            currentStage={indicatorStage}
            maxReachedStage={activeMaxReachedStage}
            onStageClick={(stage) => {
              const route = STAGE_TO_ROUTE[stage];
              if (route) navigate(withSession(route, activeSessionId));
            }}
          />
          </div>
        )}
      </header>

      <main className={usesFixedWorkspace ? 'min-h-0 flex-1 overflow-hidden' : 'flex-1 overflow-auto'}>
        {children}
      </main>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onCommand={handleCommand}
      />

      {/* Slide-over chat drawer — hidden on pages with their own embedded chat */}
      {!hasOwnChat && (
        <ChatDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      )}

      {cancelConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => !cancelInFlight && setCancelConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">Cancel BOM upload?</h3>
                <p className="mt-1 text-sm text-slate-600">
                  This permanently deletes the design and every spec statement, architecture
                  artifact, and subsystem it contains. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={cancelInFlight}
                onClick={() => setCancelConfirmOpen(false)}
              >
                Keep working
              </Button>
              <Button
                disabled={cancelInFlight}
                onClick={() => void handleCancelBomUpload()}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {cancelInFlight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Delete BOM
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
