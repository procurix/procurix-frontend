import { Check, Eye, EyeOff, X } from 'lucide-react';
import type { FactCardDraft } from '@/app/services/api/ingestion';
import { factHasEvidence } from './evidenceHighlightUtils';
import { Textarea } from '@/app/shared/components/ui/textarea';
import { Button } from '@/app/shared/components/ui/button';
import { Badge } from '@/app/shared/components/ui/badge';
import { cn } from '@/app/shared/components/ui/utils';
import { factReviewStatusLabel, isFactRejected } from './factReviewUtils';

interface FactCardEditorProps {
  fact: FactCardDraft;
  index: number;
  editable: boolean;
  reviewable?: boolean;
  onChange: (next: FactCardDraft) => void;
  onApprove?: () => void;
  onReject?: () => void;
  evidenceActive?: boolean;
  onToggleEvidence?: () => void;
}

export function FactCardEditor({
  fact,
  index,
  editable,
  reviewable,
  onChange,
  onApprove,
  onReject,
  evidenceActive,
  onToggleEvidence,
}: FactCardEditorProps) {
  const rejected = isFactRejected(fact);
  const showEvidenceButton = factHasEvidence(fact.evidence) && onToggleEvidence;

  return (
    <article
      className={cn(
        'rounded-lg border border-l-4 bg-white p-4',
        rejected
          ? 'border-slate-200 border-l-red-400 bg-slate-50 opacity-75'
          : evidenceActive
            ? 'border-amber-300 border-l-amber-500 bg-amber-50/30'
            : 'border-slate-200 border-l-blue-500',
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm font-semibold text-slate-900', rejected && 'line-through')}>
            Fact {index + 1}
          </p>
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              rejected && 'border-red-200 bg-red-50 text-red-800',
              fact.review_status === 'approved' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              fact.review_status === 'edited' && 'border-amber-200 bg-amber-50 text-amber-900',
            )}
          >
            {factReviewStatusLabel(fact.review_status)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {showEvidenceButton && (
            <Button
              type="button"
              size="sm"
              variant={evidenceActive ? 'default' : 'outline'}
              onClick={onToggleEvidence}
            >
              {evidenceActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {evidenceActive ? 'Hide evidence' : 'See evidence'}
            </Button>
          )}
          {reviewable && onApprove && onReject && (
            <>
              <Button
                type="button"
                size="sm"
                variant={rejected ? 'outline' : 'default'}
                disabled={!rejected && fact.review_status === 'approved'}
                onClick={onApprove}
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant={rejected ? 'destructive' : 'outline'}
                onClick={onReject}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </>
          )}
          <span className="text-xs text-slate-500">{fact.fact_id}</span>
        </div>
      </div>
      <div className={cn('grid gap-3', rejected && 'pointer-events-none opacity-60')}>
        <Field label="Claim">
          {editable && !rejected ? (
            <Textarea
              value={fact.claim}
              rows={3}
              onChange={(event) =>
                onChange({ ...fact, claim: event.target.value, review_status: 'edited' })
              }
            />
          ) : (
            <p className="text-sm text-slate-800">{fact.claim}</p>
          )}
        </Field>
        {fact.reasoning && (
          <Field label="Reasoning">
            <p className="text-sm text-slate-600">{fact.reasoning}</p>
          </Field>
        )}
        {evidenceActive && fact.evidence && fact.evidence.length > 0 && (
          <Field label="Source evidence">
            <ul className="space-y-2">
              {fact.evidence.map((item, evidenceIndex) => (
                <li
                  key={evidenceIndex}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                >
                  {String(item.text ?? '').trim() || '—'}
                  {item.source_ref ? (
                    <span className="mt-1 block text-xs text-amber-800">
                      {String(item.source_ref)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Field>
        )}
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
