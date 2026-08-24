import { NavLink, Outlet } from 'react-router-dom';
import { FileStack, Inbox, BookOpen } from 'lucide-react';
import { cn } from '@/app/shared/components/ui/utils';
import { INGESTION_BASE } from '@/app/services/api/ingestion';
import { useIngestionHealth } from '@/app/pages/ingestion/hooks/useIngestionHealth';
import { IngestionDevProvider } from '@/app/pages/ingestion/state/IngestionDevContext';
import { CapabilityBadges } from './CapabilityBadges';
import { IngestionDevToolbar } from './IngestionDevToolbar';

const NAV_ITEMS = [
  { to: '/ingestion/inbox', label: 'Inbox', icon: Inbox },
  { to: '/ingestion/documents', label: 'Documents', icon: FileStack },
  { to: '/ingestion/vocabulary', label: 'Vocabulary', icon: BookOpen },
] as const;

export function IngestionLayout() {
  return (
    <IngestionDevProvider>
      <IngestionLayoutInner />
    </IngestionDevProvider>
  );
}

function IngestionLayoutInner() {
  const { capabilities, isLoading, error, health } = useIngestionHealth();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Supplemental docs
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Document ingestion</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Upload spreadsheets, review parsed tables, extract facts, and build your
            term and metric vocabulary.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <CapabilityBadges
            capabilities={capabilities}
            isLoading={isLoading}
            error={error}
          />
          <p className="text-xs text-slate-500">
            {health?.ok ? 'Connected' : 'Offline'} · {INGESTION_BASE}
          </p>
        </div>
      </header>

      {!isLoading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Cannot reach the ingestion backend at <code className="font-mono">{INGESTION_BASE}</code>.
          {' '}Start it with the steps in{' '}
          <code className="font-mono">nontechnical_ingestion/manual/GETTING_STARTED.md</code>.
          <div className="mt-1 font-mono text-xs text-red-700">{error}</div>
        </div>
      )}

      <IngestionDevToolbar />

      <nav className="flex gap-1 border-b border-slate-200">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ capabilities, isLoading, error, health }} />
    </div>
  );
}
