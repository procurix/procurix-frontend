import { Loader2, Zap } from 'lucide-react';
import { useDesignContext } from '../state/DesignContext';
import {
  graphSegmentsFromData,
  proposedDeltaSummary,
} from '../utils/technicalGraphMappers';

export function TechnicalGraphActionBar() {
  const { technicalGraph } = useDesignContext();
  const {
    envelope,
    view,
    phase,
    status,
    primaryActions,
    busy,
    error,
    data,
    dispatch,
    selectedSegmentId,
    setSelectedSegmentId,
  } = technicalGraph;

  const isCached = Boolean(envelope?._cached);

  if (!technicalGraph.hasRun) return null;

  const segments = graphSegmentsFromData(data);
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const delta = proposedDeltaSummary(data);
  const coverage = (data.coverage || {}) as {
    uncovered_part_ids?: string[];
    coverage_ratio?: number;
  };
  const validation = (data.run_validation || {}) as { status?: string; messages?: string[] };
  const plannerError = data.planner_error as { message?: string } | undefined;

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600">
          {view || 'technical graph'}
        </span>
        {phase && (
          <span className="text-[11px] text-slate-500">phase: {phase}</span>
        )}
        {status && (
          <span className="text-[11px] text-slate-500">status: {status}</span>
        )}
        {isCached && (
          <span className="flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700" title="Response served from local cache — no LLM call was made">
            <Zap className="h-3 w-3" /> cached
          </span>
        )}
        {busy && (
          <span className="flex items-center gap-1 text-[11px] text-blue-600">
            <Loader2 className="h-3 w-3 animate-spin" /> Working…
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {segments.length > 0 && (
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              value={selectedSegmentId || ''}
              onChange={(event) => setSelectedSegmentId(event.target.value || null)}
              disabled={busy}
            >
              <option value="">Select segment</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                  {segment.status ? ` (${segment.status})` : ''}
                </option>
              ))}
            </select>
          )}
          {primaryActions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={busy}
              onClick={() => void dispatch(action.id)}
              className="rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
              title={action.description || action.label}
            >
              {action.label || action.id}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
      {plannerError?.message && (
        <p className="mt-2 text-xs text-amber-700">{plannerError.message}</p>
      )}
      {view === 'question_gate' && (
        <div className="mt-2 space-y-1 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <div className="font-medium">Human input needed</div>
          {questions.map((question) => {
            const q = question as { id?: string; prompt?: string };
            return (
              <p key={q.id || q.prompt}>
                {q.prompt || 'Resolve the open question to continue.'}
              </p>
            );
          })}
          {(coverage.uncovered_part_ids?.length ?? 0) > 0 && (
            <p>
              Uncovered parts: {coverage.uncovered_part_ids!.length}
              {typeof coverage.coverage_ratio === 'number'
                ? ` (${Math.round(coverage.coverage_ratio * 100)}% covered)`
                : ''}
              . Edit support is not in this MVP — reject/restart or finish coverage in Dev UI.
            </p>
          )}
        </div>
      )}
      {(view === 'circuit_segment_review' || view === 'final_graph_review') && (
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <DeltaCard title="Nets" rows={delta.nets} />
          <DeltaCard title="Connections" rows={delta.connections} />
          <DeltaCard title="Pin mappings" rows={delta.pins} />
          <DeltaCard title="Blockers" rows={delta.blockers} />
        </div>
      )}
      {view === 'final_graph_review' && (
        <p className="mt-2 text-xs text-slate-600">
          Validation: {validation.status || 'unknown'}
          {Array.isArray(validation.messages) && validation.messages.length > 0
            ? ` — ${validation.messages[0]}`
            : ''}
        </p>
      )}
      {segments.length > 0 && (view === 'graph_segment_plan_editor' || view === 'graph_segment_queue') && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {segments.map((segment) => (
            <li
              key={segment.id}
              className={`rounded border px-2 py-1 text-[11px] ${
                selectedSegmentId === segment.id
                  ? 'border-blue-300 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedSegmentId(segment.id)}
                disabled={busy}
              >
                {segment.name}
                <span className="ml-1 text-slate-500">
                  ({segment.part_ids.length} parts
                  {segment.status ? ` · ${segment.status}` : ''})
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeltaCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
      <div className="text-[11px] font-medium text-slate-600">
        {title} ({rows.length})
      </div>
      <ul className="mt-1 max-h-16 space-y-0.5 overflow-y-auto text-[10px] text-slate-500">
        {rows.length === 0 && <li>none</li>}
        {rows.slice(0, 8).map((row) => (
          <li key={row} className="truncate" title={row}>{row}</li>
        ))}
        {rows.length > 8 && <li>+{rows.length - 8} more</li>}
      </ul>
    </div>
  );
}
