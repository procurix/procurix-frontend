import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Filter, GitBranch, ListChecks, Plus, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { cn } from '@/app/shared/components/ui/utils';
import { getClassification } from '@/app/services/api';
import type { DraftRequirement } from '../types';
import { useRequirementActions } from '../hooks/useRequirementActions';
import { useRequirementsData } from '../hooks/useRequirementsData';
import { displayCategory, emptyDraft } from '../utils';
import { SummaryCard } from './RequirementPrimitives';
import { RequirementRow } from './RequirementRow';
import { RequirementDetail } from './RequirementDetail';
import { TraceabilityDrawer } from './TraceabilityDrawer';
import { CreateRequirementModal, RejectRequirementModal } from './RequirementModals';
import { TraceabilityMatrix } from './TraceabilityMatrix';

interface RequirementsViewProps {
  designId?: string | null;
  onRequirementsComplete: () => void;
  onOpenPartReview?: () => void;
}

export function RequirementsView({ designId, onRequirementsComplete, onOpenPartReview }: RequirementsViewProps) {
  const { sessionId: contextSessionId, setCurrentStage, refreshTrigger } = useSession();
  const sessionId = designId ?? contextSessionId;
  const {
    requirements,
    setRequirements,
    setSelectedId,
    selectedRequirement,
    isLoading,
    isGenerating,
    needsGeneration,
    generationComplete,
    triggerGeneration,
    error,
    retry,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    reviewFilter,
    setReviewFilter,
    workspaceView,
    setWorkspaceView,
    categories,
    filteredRequirements,
    summary,
    reviewBlockers,
    reloadRequirements,
    upsertRequirement,
  } = useRequirementsData(sessionId, refreshTrigger);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draft, setDraft] = useState<DraftRequirement>(emptyDraft);
  const [selectedSourceParts, setSelectedSourceParts] = useState<string[]>([]);
  const [nonAuxiliaryParts, setNonAuxiliaryParts] = useState<string[]>([]);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [loadingParts, setLoadingParts] = useState(false);
  const {
    savingRequirementId,
    traceMpn,
    setTraceMpn,
    partSpecs,
    loadingTrace,
    proposal,
    setProposal,
    proposingAction,
    rejectingRequirement,
    setRejectingRequirement,
    rejectReason,
    setRejectReason,
    historyByRequirement,
    handleApprove,
    handleReject,
    handleSave,
    handleCreateRequirement,
    openTraceability,
    handleAiAction,
    handleApplyProposal,
    handleContinue,
  } = useRequirementActions({
    sessionId,
    selectedRequirement,
    setRequirements,
    setSelectedId,
    setCurrentStage,
    reloadRequirements,
    upsertRequirement,
    reviewBlockers,
    setReviewFilter,
    onRequirementsComplete,
  });

  useEffect(() => {
    if (!showCreateModal || !sessionId || nonAuxiliaryParts.length > 0) return;

    const fetchParts = async () => {
      setLoadingParts(true);
      try {
        const classification = await getClassification(sessionId);
        setNonAuxiliaryParts(
          Object.entries(classification.classification_map)
            .filter(([, classification]) => classification === 'non-auxiliary')
            .map(([mpn]) => mpn)
            .sort(),
        );
      } catch {
        toast.error('Failed to load source components');
      } finally {
        setLoadingParts(false);
      }
    };

    fetchParts();
  }, [showCreateModal, sessionId, nonAuxiliaryParts.length]);

  const toggleSourcePart = (mpn: string) => {
    setSelectedSourceParts(prev => prev.includes(mpn) ? prev.filter(item => item !== mpn) : [...prev, mpn]);
  };

  {/* State: initial read in progress */}
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 p-8">
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
          <h3 className="text-lg font-semibold text-gray-900">Loading requirements</h3>
          <p className="mt-2 max-w-md text-sm text-gray-600">Checking for existing requirements…</p>
        </div>
      </div>
    );
  }

  {/* State: error */}
  if (error && requirements.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 p-8">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <h3 className="mt-3 text-lg font-semibold text-gray-900">Requirements unavailable</h3>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            {error.includes('Part Review') && onOpenPartReview && (
              <button onClick={onOpenPartReview} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Open Part Review
              </button>
            )}
            <button onClick={retry} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  {/* State 1: requirements table is empty and generation has not been triggered */}
  if (needsGeneration) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 p-8">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Sparkles className="mx-auto h-10 w-10 text-blue-500" />
          <h3 className="mt-3 text-lg font-semibold text-gray-900">Requirements not generated yet</h3>
          <p className="mt-2 text-sm text-gray-600">
            AI will extract design constraints from your components, confirmed standards, and
            enriched part context. This typically takes 15–60 seconds.
          </p>
          <button
            onClick={triggerGeneration}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Sparkles className="h-4 w-4" />
            Generate Requirements
          </button>
        </div>
      </div>
    );
  }

  {/* State 2: AI generation actively in flight */}
  if (isGenerating) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 p-8">
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <h3 className="text-lg font-semibold text-gray-900">Generating requirements</h3>
          <p className="mt-2 max-w-md text-sm text-gray-600">
            AI is extracting design constraints from components, standards, and available topology context.
          </p>
        </div>
      </div>
    );
  }

  {/* State 3 (generationComplete && requirements.length === 0) falls into the main return.
      The list pane renders a contextual empty message with re-generate / add actions.
      This lets the CreateRequirementModal at the bottom of the return tree still function. */}

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-950">Requirements Review</h1>
            <p className="text-sm text-gray-500">Approve, edit, and trace AI-suggested requirements before architecture work continues.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-gray-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setWorkspaceView('review')}
                className={cn(
                  'inline-flex items-center gap-2 rounded px-2.5 py-1.5 text-sm font-medium',
                  workspaceView === 'review' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <ListChecks className="h-4 w-4" />
                Review
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceView('matrix')}
                className={cn(
                  'inline-flex items-center gap-2 rounded px-2.5 py-1.5 text-sm font-medium',
                  workspaceView === 'matrix' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <GitBranch className="h-4 w-4" />
                Matrix
              </button>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Add Requirement
            </button>
            <button
              onClick={handleContinue}
              disabled={requirements.length === 0 || reviewBlockers.length > 0}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              title={reviewBlockers.length ? 'Resolve must-have requirement blockers before continuing' : undefined}
            >
              <CheckCircle className="h-4 w-4" />
              Approve All & Continue
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <SummaryCard label="Total" value={requirements.length} />
          <SummaryCard label="Approved" value={summary.approved} tone="good" />
          <SummaryCard label="Open Review" value={summary.open} tone={summary.open ? 'warn' : 'neutral'} />
          <SummaryCard label="Quality Gaps" value={summary.gaps} tone={summary.gaps ? 'warn' : 'neutral'} />
          <SummaryCard label="Review Blockers" value={reviewBlockers.length} tone={reviewBlockers.length ? 'warn' : 'good'} />
        </div>
        {reviewBlockers.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span className="font-semibold">Gate active:</span> approve must-have requirements and add source, verification, and acceptance criteria before continuing.
            <div className="mt-2 flex flex-wrap gap-2">
              {reviewBlockers.slice(0, 4).map(blocker => (
                <button
                  key={blocker.reqId}
                  type="button"
                  onClick={() => setSelectedId(blocker.reqId)}
                  className="rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  {blocker.label}: {blocker.reasons.join(', ')}
                </button>
              ))}
              {reviewBlockers.length > 4 && (
                <span className="rounded-md px-2 py-1 text-xs font-medium text-amber-700">
                  +{reviewBlockers.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {workspaceView === 'matrix' && sessionId ? (
        <TraceabilityMatrix
          designId={sessionId}
          onSelectRequirement={(reqId) => {
            setSelectedId(reqId);
            setWorkspaceView('review');
          }}
          onOpenComponent={openTraceability}
          onChanged={reloadRequirements}
        />
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(460px,1.05fr)_minmax(520px,0.95fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
          <div className="shrink-0 border-b border-gray-200 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search ID, title, source, category..."
                className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700">
                <option value="all">All categories</option>
                {categories.map(category => <option key={category} value={category}>{displayCategory(category)}</option>)}
              </select>
              {([
                ['all', 'All'],
                ['open', 'Open'],
                ['approved', 'Approved'],
                ['gaps', 'Quality gaps'],
                ['low-confidence', 'Low confidence'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setReviewFilter(value)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm',
                    reviewFilter === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {filteredRequirements.length === 0 ? (
              generationComplete ? (
                // State 3: generation ran but produced no rows
                <div className="p-8 text-center">
                  <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
                  <p className="mt-3 text-sm font-medium text-gray-800">Generation completed with no output</p>
                  <p className="mt-1 text-xs text-gray-500 max-w-xs mx-auto">
                    This can happen when non-auxiliary parts lack enriched context or no system type
                    has been confirmed. Enrich more parts or confirm the system type, then re-generate.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={triggerGeneration}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Re-generate
                    </button>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Manually
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-gray-500">No requirements match the current filters.</div>
              )
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredRequirements.map(req => (
                  <RequirementRow
                    key={req.req_id}
                    requirement={req}
                    selected={selectedRequirement?.req_id === req.req_id}
                    onSelect={() => setSelectedId(req.req_id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto bg-gray-50">
          {selectedRequirement ? (
            <RequirementDetail
              requirement={selectedRequirement}
              isSaving={savingRequirementId === selectedRequirement.req_id}
              onApprove={() => handleApprove(selectedRequirement)}
              onReject={() => {
                setRejectingRequirement(selectedRequirement);
                setRejectReason('');
              }}
              onSave={(updates) => handleSave(selectedRequirement.req_id, updates)}
              onTraceSource={openTraceability}
              proposal={proposal?.target_requirement_id === selectedRequirement.req_id ? proposal : null}
              history={historyByRequirement[selectedRequirement.req_id] ?? []}
              proposingAction={proposingAction}
              onAiAction={handleAiAction}
              onApplyProposal={handleApplyProposal}
              onDismissProposal={() => setProposal(null)}
            />
          ) : (
            <div className="p-8 text-center text-sm text-gray-500">Select a requirement to review details.</div>
          )}
        </section>
      </div>
      )}

      {showCreateModal && (
        <CreateRequirementModal
          draft={draft}
          setDraft={setDraft}
          categories={categories}
          selectedSourceParts={selectedSourceParts}
          nonAuxiliaryParts={nonAuxiliaryParts}
          loadingParts={loadingParts}
          showPartDropdown={showPartDropdown}
          setShowPartDropdown={setShowPartDropdown}
          toggleSourcePart={toggleSourcePart}
          onClose={() => {
            setShowCreateModal(false);
            setShowPartDropdown(false);
            setSelectedSourceParts([]);
            setDraft(emptyDraft);
          }}
          onCreate={() => handleCreateRequirement(draft, selectedSourceParts, () => {
            setShowCreateModal(false);
            setDraft(emptyDraft);
            setSelectedSourceParts([]);
          })}
        />
      )}

      {traceMpn && (
        <TraceabilityDrawer
          mpn={traceMpn}
          evidence={partSpecs[traceMpn]}
          loading={loadingTrace}
          onClose={() => setTraceMpn(null)}
        />
      )}

      {rejectingRequirement && (
        <RejectRequirementModal
          requirement={rejectingRequirement}
          reason={rejectReason}
          setReason={setRejectReason}
          isSaving={savingRequirementId === rejectingRequirement.req_id}
          onClose={() => {
            setRejectingRequirement(null);
            setRejectReason('');
          }}
          onConfirm={() => handleReject(rejectingRequirement, rejectReason)}
        />
      )}
    </div>
  );
}
