import { useEffect, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle,
  Edit2,
  FileSearch,
  Loader2,
  ShieldCheck,
  Sparkles,
  SplitSquareHorizontal,
  Target,
  Trash2,
} from 'lucide-react';
import type { Requirement as APIRequirement, RequirementProposal } from '@/app/services/api';
import type { RequirementHistoryEvent } from '@/app/services/api';
import { confidencePercent, displayCategory, formatTraceValue, qualityChecks } from '../utils';
import { AiAction, FieldPill, QualityBadge, SectionTitle, StatusBadge } from './RequirementPrimitives';

export function RequirementDetail({
  requirement,
  isSaving,
  onApprove,
  onReject,
  onSave,
  onTraceSource,
  proposal,
  proposingAction,
  onAiAction,
  onApplyProposal,
  onDismissProposal,
  history = [],
}: {
  requirement: APIRequirement;
  isSaving: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSave: (updates: Partial<APIRequirement>) => void;
  onTraceSource: (mpn: string) => void;
  proposal: RequirementProposal | null;
  proposingAction: string | null;
  onAiAction: (action: string) => void;
  onApplyProposal: () => void;
  onDismissProposal: () => void;
  history?: RequirementHistoryEvent[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<APIRequirement>>({});
  const checks = qualityChecks(requirement);
  const sources = [...(requirement.source_mpns ?? requirement.bom_reference ?? []), ...(requirement.source_standards ?? [])];
  const specDuplicatesDescription = requirement.specification?.trim() && requirement.specification.trim() === requirement.description?.trim();

  useEffect(() => {
    setEditing(false);
    setDraft({
      title: requirement.title,
      description: requirement.description,
      specification: requirement.specification,
      category: requirement.category,
      priority: requirement.priority,
      verification_method: requirement.verification_method,
      acceptance_criteria: requirement.acceptance_criteria,
      rationale: requirement.rationale,
    });
  }, [requirement.req_id]);

  const save = () => {
    onSave(draft);
    setEditing(false);
  };

  return (
    <div className="space-y-4 p-5">
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-gray-500">{requirement.req_key || requirement.original_req_id || requirement.req_id.slice(0, 8)}</span>
              <StatusBadge status={requirement.status} />
              <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{displayCategory(requirement.category)}</span>
            </div>
            {editing ? (
              <input
                value={draft.title ?? ''}
                onChange={event => setDraft(prev => ({ ...prev, title: event.target.value }))}
                className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-lg font-semibold outline-none focus:border-blue-500"
              />
            ) : (
              <h2 className="mt-3 text-xl font-semibold text-gray-950">{requirement.title}</h2>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <>
                <button onClick={save} disabled={isSaving} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save
                </button>
                <button onClick={() => setEditing(false)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Edit2 className="h-4 w-4" />
                  Edit
                </button>
                <button onClick={onApprove} disabled={isSaving || requirement.status === 'confirmed'} className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-300">
                  <ShieldCheck className="h-4 w-4" />
                  Approve
                </button>
                <button onClick={onReject} disabled={isSaving} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                  Reject
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <FieldPill label="Priority" value={(requirement.priority ?? 'must_have').replace(/_/g, ' ')} />
          <FieldPill label="Verification" value={requirement.verification_method?.replace(/_/g, ' ') || 'not set'} warn={!requirement.verification_method} />
          <FieldPill label="Confidence" value={`${confidencePercent(requirement)}%`} warn={confidencePercent(requirement) < 70} />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <SectionTitle icon={<Target className="h-4 w-4" />} title="Requirement Statement" />
        {editing ? (
          <textarea
            value={draft.description ?? ''}
            onChange={event => setDraft(prev => ({ ...prev, description: event.target.value }))}
            rows={5}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500"
          />
        ) : (
          <p className="mt-3 text-sm leading-6 text-gray-800">{requirement.description}</p>
        )}

        {!specDuplicatesDescription && (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Specification / Acceptance</div>
            {editing ? (
              <textarea
                value={draft.specification ?? ''}
                onChange={event => setDraft(prev => ({ ...prev, specification: event.target.value }))}
                rows={3}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500"
              />
            ) : (
              <p className="mt-2 rounded-md bg-gray-50 p-3 text-sm leading-6 text-gray-800">{requirement.specification || 'No separate specification provided.'}</p>
            )}
          </div>
        )}

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Acceptance Criteria</div>
          {editing ? (
            <textarea
              value={draft.acceptance_criteria ?? ''}
              onChange={event => setDraft(prev => ({ ...prev, acceptance_criteria: event.target.value }))}
              rows={3}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500"
              placeholder="How will the requirement be accepted?"
            />
          ) : (
            <p className="mt-2 text-sm leading-6 text-gray-700">{requirement.acceptance_criteria || 'No acceptance criteria set.'}</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <SectionTitle icon={<FileSearch className="h-4 w-4" />} title="Traceability" />
        <div className="mt-3 flex flex-wrap gap-2">
          {sources.length ? sources.map(source => (
            <button
              key={source}
              type="button"
              onClick={() => onTraceSource(source)}
              className="rounded-md bg-blue-50 px-2 py-1 font-mono text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              {source}
            </button>
          )) : (
            <span className="text-sm text-gray-500">No source components or standards linked.</span>
          )}
        </div>
        {requirement.rationale && (
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">AI Rationale</div>
            <p className="mt-1 text-sm leading-6 text-gray-700">{requirement.rationale}</p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <SectionTitle icon={<CheckCircle className="h-4 w-4" />} title="Quality Signals" />
        <div className="mt-3 flex flex-wrap gap-2">
          {checks.map(check => <QualityBadge key={check.label} label={check.label} tone={check.tone} />)}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <SectionTitle icon={<FileSearch className="h-4 w-4" />} title="Change History" />
        {history.length ? (
          <div className="mt-3 space-y-3">
            {history.slice(0, 6).map((event, index) => (
              <div key={event.id || `${event.event_type || 'change'}-${event.created_at || index}`} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold capitalize text-gray-900">{String(event.event_type || 'change').replace(/_/g, ' ')}</div>
                  <div className="text-xs text-gray-500">{event.created_at ? new Date(event.created_at).toLocaleString() : 'No timestamp'}</div>
                </div>
                <div className="mt-1 text-xs text-gray-500">Actor: {event.actor || 'system'}</div>
                {event.reason && <p className="mt-2 text-sm leading-5 text-gray-700">{event.reason}</p>}
                {(event.before || event.after) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-blue-700">View field changes</summary>
                    <pre className="mt-2 max-h-56 overflow-auto rounded bg-white p-2 text-xs text-gray-700">
                      {formatTraceValue({ before: event.before, after: event.after })}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">No change history recorded yet.</p>
        )}
      </div>

      <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50 p-5">
        <SectionTitle icon={<Bot className="h-4 w-4" />} title="AI Assist" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <AiAction icon={<Sparkles className="h-4 w-4" />} label="Make testable" action="make_testable" loading={proposingAction === 'make_testable'} onClick={onAiAction} />
          <AiAction icon={<SplitSquareHorizontal className="h-4 w-4" />} label="Split if too broad" action="split" loading={proposingAction === 'split'} onClick={onAiAction} />
          <AiAction icon={<FileSearch className="h-4 w-4" />} label="Explain evidence" action="explain_evidence" loading={proposingAction === 'explain_evidence'} onClick={onAiAction} />
          <AiAction icon={<Target className="h-4 w-4" />} label="Suggest criteria" action="suggest_criteria" loading={proposingAction === 'suggest_criteria'} onClick={onAiAction} />
        </div>
        {proposal && (
          <div className="mt-4 rounded-md border border-blue-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-950">Review AI Proposal</div>
                <p className="mt-1 text-sm leading-6 text-gray-600">{proposal.rationale || 'AI proposed an edit for review.'}</p>
              </div>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                {proposal.confidence != null ? `${Math.round((proposal.confidence <= 1 ? proposal.confidence * 100 : proposal.confidence))}%` : 'AI'}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {Object.entries(proposal.payload ?? {}).length ? Object.entries(proposal.payload ?? {}).map(([key, value]) => (
                <div key={key} className="rounded-md bg-gray-50 p-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{key.replace(/_/g, ' ')}</div>
                  <div className="mt-1 text-sm text-gray-800">{Array.isArray(value) ? value.join(', ') : String(value ?? '')}</div>
                </div>
              )) : (
                <div className="rounded-md bg-gray-50 p-2 text-sm text-gray-700">No direct field edit proposed. Use the rationale/evidence for review.</div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onDismissProposal} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Dismiss</button>
              <button onClick={onApplyProposal} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">Apply Proposal</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
