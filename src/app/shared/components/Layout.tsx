import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Cpu, ArrowLeft, Command, MessageSquare } from 'lucide-react';
import { ChatDrawer } from '@/app/shared/components/ChatDrawer';
import { Button } from '@/app/shared/components/ui/button';
import { StageIndicator } from '@/app/shared/components/StageIndicator';
import { useState, useEffect } from 'react';
import { CommandPalette } from '@/app/shared/components/CommandPalette';
import type { SessionStage } from '@/app/types';
import { useSession } from '@/app/context/SessionContext';
import { getBOMBySessionId } from '@/app/services/api';
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

  // Don't show header on library or completed pages
  if (location.pathname === '/' || location.pathname === '/completed') {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b bg-white px-6 py-4 shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <Link to="/">
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

            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Command className="h-4 w-4" />
              <span>Commands</span>
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">⌘K</kbd>
            </button>
          </div>
        </div>

        {showStageIndicator && indicatorStage && (
          <StageIndicator
            currentStage={indicatorStage}
            maxReachedStage={activeMaxReachedStage}
            onStageClick={(stage) => {
              const route = STAGE_TO_ROUTE[stage];
              if (route) navigate(withSession(route, activeSessionId));
            }}
          />
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
    </div>
  );
}
