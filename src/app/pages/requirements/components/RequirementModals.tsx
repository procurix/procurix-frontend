import type { Dispatch, SetStateAction } from 'react';
import { ChevronDown, Loader2, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/app/shared/components/ui/utils';
import type { Requirement as APIRequirement } from '@/app/services/api';
import type { DraftRequirement } from '../types';
import { displayCategory, verificationOptions } from '../utils';

export function RejectRequirementModal({
  requirement,
  reason,
  setReason,
  isSaving,
  onClose,
  onConfirm,
}: {
  requirement: APIRequirement;
  reason: string;
  setReason: (value: string) => void;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-950">Reject Requirement</h3>
            <p className="mt-1 text-sm text-gray-600">
              Record why this requirement should be removed from the reviewed baseline.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="font-mono text-xs font-semibold text-gray-500">
            {requirement.req_key || requirement.req_id.slice(0, 8)}
          </div>
          <div className="mt-1 text-sm font-semibold text-gray-900">{requirement.title}</div>
        </div>

        <label className="mt-4 grid gap-1 text-sm font-medium text-gray-700">
          Rejection reason
          <textarea
            value={reason}
            onChange={event => setReason(event.target.value)}
            rows={4}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500"
            placeholder="Example: duplicate of REQ-12, not supported by source evidence, out of project scope..."
          />
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isSaving || !reason.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Reject
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function CreateRequirementModal({
  draft,
  setDraft,
  categories,
  selectedSourceParts,
  nonAuxiliaryParts,
  loadingParts,
  showPartDropdown,
  setShowPartDropdown,
  toggleSourcePart,
  onClose,
  onCreate,
}: {
  draft: DraftRequirement;
  setDraft: Dispatch<SetStateAction<DraftRequirement>>;
  categories: string[];
  selectedSourceParts: string[];
  nonAuxiliaryParts: string[];
  loadingParts: boolean;
  showPartDropdown: boolean;
  setShowPartDropdown: (value: boolean) => void;
  toggleSourcePart: (mpn: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-950">Create Requirement</h3>
          <button onClick={onClose} className="rounded-md p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Category
              <select value={draft.category} onChange={event => setDraft(prev => ({ ...prev, category: event.target.value }))} className="rounded-md border border-gray-300 px-3 py-2">
                {Array.from(new Set([...categories, 'functional', 'power', 'interface', 'safety', 'performance', 'compliance', 'environmental'])).map(category => (
                  <option key={category} value={category}>{displayCategory(category)}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Priority
              <select value={draft.priority} onChange={event => setDraft(prev => ({ ...prev, priority: event.target.value }))} className="rounded-md border border-gray-300 px-3 py-2">
                <option value="must_have">Must have</option>
                <option value="should_have">Should have</option>
                <option value="nice_to_have">Nice to have</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Title
            <input value={draft.title} onChange={event => setDraft(prev => ({ ...prev, title: event.target.value }))} className="rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Requirement statement
            <textarea value={draft.description} onChange={event => setDraft(prev => ({ ...prev, description: event.target.value }))} rows={4} className="rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Specification
            <textarea value={draft.specification} onChange={event => setDraft(prev => ({ ...prev, specification: event.target.value }))} rows={2} className="rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Verification method
              <select value={draft.verification_method} onChange={event => setDraft(prev => ({ ...prev, verification_method: event.target.value }))} className="rounded-md border border-gray-300 px-3 py-2">
                <option value="">Not set</option>
                {verificationOptions.map(option => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <div className="relative grid gap-1 text-sm font-medium text-gray-700">
              Source components
              <button type="button" onClick={() => setShowPartDropdown(!showPartDropdown)} className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-left font-normal">
                {selectedSourceParts.length ? `${selectedSourceParts.length} selected` : 'Select sources'}
                <ChevronDown className={cn('h-4 w-4 transition-transform', showPartDropdown && 'rotate-180')} />
              </button>
              {showPartDropdown && (
                <div className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                  {loadingParts ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading</div>
                  ) : nonAuxiliaryParts.length ? (
                    nonAuxiliaryParts.map(mpn => (
                      <label key={mpn} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-blue-50">
                        <input type="checkbox" checked={selectedSourceParts.includes(mpn)} onChange={() => toggleSourcePart(mpn)} />
                        <span className="font-mono">{mpn}</span>
                      </label>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">No parts available</div>
                  )}
                </div>
              )}
            </div>
          </div>
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Acceptance criteria
            <textarea value={draft.acceptance_criteria} onChange={event => setDraft(prev => ({ ...prev, acceptance_criteria: event.target.value }))} rows={3} className="rounded-md border border-gray-300 px-3 py-2" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={onCreate} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Create</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
