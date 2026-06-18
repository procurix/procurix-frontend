import { useEffect } from 'react';
import { X } from 'lucide-react';
import { TraceabilityMatrix } from '@/app/pages/requirements/components/TraceabilityMatrix';
import { useDesignContext } from '../state/DesignContext';

interface RequirementsMatrixModalProps {
  open: boolean;
  onClose: () => void;
}

// Modal wrapper around the existing TraceabilityMatrix component. Same
// matrix that was behind the Review/Matrix toggle on the old Requirements
// page — surfaced here as a popup so the rail stays compact. Selecting a
// requirement inside the matrix closes the modal and opens the edit modal
// for that row; clicking a component delegates to the rail's traceability
// drawer (currently no-op — wire later if needed).

export function RequirementsMatrixModal({ open, onClose }: RequirementsMatrixModalProps) {
  const { sessionId, requirementsData, openRequirementEditor } = useDesignContext();
  const { requirements, setSelectedId, reloadRequirements } = requirementsData;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <header className="shrink-0 flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Traceability matrix</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-hidden">
          <TraceabilityMatrix
            designId={sessionId}
            onSelectRequirement={reqId => {
              setSelectedId(reqId);
              const req = requirements.find(r => r.req_id === reqId);
              if (req) {
                openRequirementEditor(req);
                onClose();
              }
            }}
            onChanged={() => { void reloadRequirements(); }}
          />
        </div>
      </div>
    </div>
  );
}
