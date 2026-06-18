import { useState } from 'react';
import { CheckCircle, GitBranch, FileText, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { confirmAllRequirements } from '@/app/services/api';
import { RequirementRow } from '@/app/pages/requirements/components/RequirementRow';
import { useDesignContext } from '../state/DesignContext';
import { RequirementsMatrixModal } from './RequirementsMatrixModal';

export function RequirementsRail({ collapsed }: { collapsed: boolean }) {
  const { sessionId, requirementsData, openRequirementEditor } = useDesignContext();
  const {
    requirements,
    selectedId,
    setSelectedId,
    isLoading,
    summary,
    needsGeneration,
    isGenerating,
    triggerGeneration,
    error,
    retry,
    reloadRequirements,
  } = requirementsData;
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  const unapprovedCount = requirements.length - summary.approved;

  const handleApproveAll = async () => {
    if (approvingAll || requirements.length === 0) return;
    setApprovingAll(true);
    try {
      await confirmAllRequirements(sessionId, { force: true });
      await reloadRequirements();
      toast.success('All requirements approved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve all requirements');
    } finally {
      setApprovingAll(false);
    }
  };

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-3 py-4 text-slate-500">
        <FileText className="h-5 w-5" />
        <div className="text-[10px] font-semibold text-slate-600">{requirements.length}</div>
        <div
          className="text-[10px] text-amber-600"
          title={`${summary.gaps} requirements with quality gaps`}
        >
          {summary.gaps > 0 ? `⚠ ${summary.gaps}` : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-800">Requirements</h2>
          <span className="text-xs text-slate-500">{requirements.length}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {requirements.length > 0 && unapprovedCount > 0 && (
              <button
                type="button"
                onClick={() => void handleApproveAll()}
                disabled={approvingAll}
                className="relative flex h-7 w-7 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-60"
                title={`Approve all ${unapprovedCount} remaining requirement${unapprovedCount === 1 ? '' : 's'}`}
                aria-label="Approve all remaining requirements"
              >
                {approvingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span className="absolute -right-1 -top-1 rounded-full bg-emerald-600 px-1 text-[9px] font-semibold leading-[14px] text-white">
                      {unapprovedCount}
                    </span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMatrixOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
              title="Open traceability matrix"
              aria-label="Open traceability matrix"
            >
              <GitBranch className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <RequirementsMatrixModal open={matrixOpen} onClose={() => setMatrixOpen(false)} />
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-xs text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading requirements…
          </div>
        ) : error ? (
          <div className="space-y-2 px-4 py-6 text-xs text-slate-600">
            <div className="flex items-start gap-2 text-red-700">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={retry}
              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Retry
            </button>
          </div>
        ) : requirements.length === 0 ? (
          <div className="space-y-3 px-4 py-6 text-xs text-slate-600">
            <p>
              {needsGeneration
                ? 'No requirements yet. Generate them from the BOM and confirmed classifications.'
                : 'No requirements exist for this session.'}
            </p>
            <button
              type="button"
              onClick={() => void triggerGeneration()}
              disabled={isGenerating}
              className="flex w-full items-center justify-center gap-1.5 rounded bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" /> Generate Requirements
                </>
              )}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {requirements.map(req => (
              <li key={req.req_id}>
                <RequirementRow
                  requirement={req}
                  selected={req.req_id === selectedId}
                  onSelect={() => {
                    setSelectedId(req.req_id);
                    openRequirementEditor(req);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
