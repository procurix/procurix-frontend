import { AlertCircle } from 'lucide-react';

// Small inline hint shown next to a disabled button explaining why. Keep the
// list short and concrete — each reason should map to a single thing the
// user has to do.

interface DisabledReasonHintProps {
  reasons: string[];
}

export function DisabledReasonHint({ reasons }: DisabledReasonHintProps) {
  if (reasons.length === 0) return null;
  return (
    <div className="mt-1 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
      <div>
        {reasons.length === 1 ? (
          reasons[0]
        ) : (
          <ul className="list-disc pl-3">
            {reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
