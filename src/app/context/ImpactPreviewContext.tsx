import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, Trash2, X } from 'lucide-react';
import { Button } from '@/app/shared/components/ui/button';
import { Badge } from '@/app/shared/components/ui/badge';
import {
  previewImpact,
  type EffectKind,
  type ImpactItem,
  type ImpactReport,
} from '@/app/services/api';
import {
  ImpactCancelledError,
  ImpactPreviewContext,
  type WithImpactPreviewOptions,
} from './impactPreview';

interface PendingDecision {
  report: ImpactReport;
  verb: string;
  resolve: (proceed: boolean) => void;
}

export function ImpactPreviewProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [ack, setAck] = useState(false);
  const inFlight = useRef(false);

  const showModal = useCallback((report: ImpactReport, verb: string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setAck(false);
      setPending({ report, verb, resolve });
    });
  }, []);

  const closeModal = useCallback((proceed: boolean) => {
    if (pending) {
      pending.resolve(proceed);
      setPending(null);
      setAck(false);
    }
  }, [pending]);

  const withImpactPreview = useCallback(async <T,>(opts: WithImpactPreviewOptions<T>): Promise<T> => {
    if (inFlight.current) {
      throw new Error('Another impact preview is in progress');
    }
    inFlight.current = true;
    try {
      let report: ImpactReport | null = null;
      try {
        report = await previewImpact(opts.designId, { action: opts.action, target: opts.target });
      } catch (e) {
        console.warn('[impact] preview network error', e);
      }

      if (report && (report.downstream.length > 0 || opts.forcePopup)) {
        const proceed = await showModal(report, opts.verb);
        if (!proceed) {
          throw new ImpactCancelledError(opts.verb);
        }
      }

      return await opts.apply();
    } finally {
      inFlight.current = false;
    }
  }, [showModal]);

  const value = useMemo(() => ({ withImpactPreview }), [withImpactPreview]);

  return (
    <ImpactPreviewContext.Provider value={value}>
      {children}
      {pending && (
        <ImpactModal
          report={pending.report}
          verb={pending.verb}
          ack={ack}
          onAckChange={setAck}
          onCancel={() => closeModal(false)}
          onConfirm={() => closeModal(true)}
        />
      )}
    </ImpactPreviewContext.Provider>
  );
}

function effectBadge(effect: EffectKind) {
  const map: Record<EffectKind, { label: string; cls: string }> = {
    hard_delete: { label: 'will be deleted', cls: 'bg-red-50 text-red-700 border-red-200' },
    unlink_and_flag: { label: 'unlinked + flagged', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    flag: { label: 'flagged stale', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    no_change: { label: 'no change', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  };
  const info = map[effect] || map.no_change;
  return <Badge variant="outline" className={`text-[10px] ${info.cls}`}>{info.label}</Badge>;
}

function ImpactModal({
  report, verb, ack, onAckChange, onCancel, onConfirm,
}: {
  report: ImpactReport;
  verb: string;
  ack: boolean;
  onAckChange: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const grouped: Record<string, ImpactItem[]> = {};
  for (const item of report.downstream) {
    const key = item.parent_context || 'Other';
    (grouped[key] = grouped[key] || []).push(item);
  }
  const requiresAck = report.downstream.some(
    (i) => i.predicted_effect === 'hard_delete' || i.predicted_effect === 'unlink_and_flag',
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-100 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {verb} will affect {report.summary.total_affected} item
                {report.summary.total_affected === 1 ? '' : 's'} downstream
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                {verb}: <span className="font-medium text-slate-800">{report.target.label}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          {Object.entries(report.summary.by_predicted_effect).map(([k, v]) => (
            <Badge key={k} variant="outline" className="text-[10px]">
              {v} {k.replace('_', ' ')}
            </Badge>
          ))}
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-4">
          {Object.entries(grouped).map(([ctx, items]) => (
            <div key={ctx} className="mb-4 last:mb-0">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {ctx} ({items.length})
              </div>
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div
                    key={item.entity_id}
                    className="rounded border border-slate-200 bg-white p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-800">{item.label}</span>
                      <Badge variant="outline" className="text-[10px] bg-slate-100">
                        {item.current_state}
                      </Badge>
                      {effectBadge(item.predicted_effect)}
                      {item.predicted_effect === 'hard_delete' && (
                        <Trash2 className="h-3 w-3 text-red-500" />
                      )}
                    </div>
                    <div className="mt-1 flex items-start gap-1 text-[11px] text-slate-600">
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                      <span>{item.effect_detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 p-4">
          {requiresAck && (
            <label className="mb-3 flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => onAckChange(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand that {report.summary.by_predicted_effect.hard_delete || 0} item(s)
                will be deleted and downstream entities will lose their links.
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={requiresAck && !ack}>
              Confirm and apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
