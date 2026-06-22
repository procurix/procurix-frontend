import { useEffect } from 'react';
import { X } from 'lucide-react';
import { RequirementDetail } from '@/app/pages/requirements/components/RequirementDetail';
import { RejectRequirementModal } from '@/app/pages/requirements/components/RequirementModals';
import { TraceabilityDrawer } from '@/app/pages/requirements/components/TraceabilityDrawer';
import { useRequirementActions } from '@/app/pages/requirements/hooks/useRequirementActions';
import { useSession } from '@/app/context/SessionContext';
import { useDesignContext } from '../state/DesignContext';

export function RequirementEditModal() {
  const { sessionId, requirementsData, architecture, editingRequirement, closeRequirementEditor } = useDesignContext();
  const { setCurrentStage } = useSession();

  const {
    setRequirements,
    setSelectedId,
    reloadRequirements,
    upsertRequirement,
    reviewBlockers,
    setReviewFilter,
  } = requirementsData;

  // Wire actions exactly like RequirementsView. The onRequirementsComplete
  // callback is a no-op here — the "Continue to Review" button lives on the
  // canvas, not in this modal.
  const actions = useRequirementActions({
    sessionId,
    selectedRequirement: editingRequirement,
    setRequirements,
    setSelectedId,
    setCurrentStage,
    reloadRequirements,
    upsertRequirement,
    reviewBlockers,
    setReviewFilter,
    onRequirementsComplete: () => { /* no-op in design page */ },
  });

  // Close modal with Escape.
  useEffect(() => {
    if (!editingRequirement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRequirementEditor();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingRequirement, closeRequirementEditor]);

  if (!editingRequirement) return null;

  const reqId = editingRequirement.req_id;
  const history = actions.historyByRequirement[reqId] ?? [];

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-xl">
          <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Edit spec statement</h2>
            <button
              type="button"
              onClick={closeRequirementEditor}
              className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="max-h-[calc(90vh-49px)] overflow-y-auto">
            <RequirementDetail
              requirement={editingRequirement}
              isSaving={actions.savingRequirementId === reqId}
              onApprove={() => actions.handleApprove(editingRequirement)}
              onReject={() => actions.setRejectingRequirement(editingRequirement)}
              onSave={updates => {
                // Wrap actions.handleSave so the architecture gets marked stale
                // after a successful save. handleSave already toasts on failure;
                // we don't need to check the result here.
                void Promise.resolve(actions.handleSave(reqId, updates)).then(() => {
                  architecture.markStale();
                });
              }}
              onTraceSource={actions.openTraceability}
              proposal={actions.proposal}
              proposingAction={actions.proposingAction}
              onAiAction={actions.handleAiAction}
              onApplyProposal={() => {
                void Promise.resolve(actions.handleApplyProposal()).then(() => {
                  architecture.markStale();
                });
              }}
              onDismissProposal={() => actions.setProposal(null)}
              history={history}
            />
          </div>
        </div>
      </div>

      {actions.traceMpn && (
        <TraceabilityDrawer
          mpn={actions.traceMpn}
          evidence={actions.partSpecs[actions.traceMpn]}
          loading={actions.loadingTrace}
          onClose={() => actions.setTraceMpn(null)}
        />
      )}

      {actions.rejectingRequirement && (
        <RejectRequirementModal
          requirement={actions.rejectingRequirement}
          reason={actions.rejectReason}
          setReason={actions.setRejectReason}
          isSaving={actions.savingRequirementId === actions.rejectingRequirement.req_id}
          onClose={() => {
            actions.setRejectingRequirement(null);
            actions.setRejectReason('');
          }}
          onConfirm={() => {
            // Reject removes the requirement on success. Close our edit
            // modal so we don't show an empty/stale row, and mark the
            // architecture stale since the requirement set changed.
            void Promise.resolve(
              actions.handleReject(actions.rejectingRequirement!, actions.rejectReason),
            ).then(() => {
              architecture.markStale();
              closeRequirementEditor();
            });
          }}
        />
      )}
    </>
  );
}
