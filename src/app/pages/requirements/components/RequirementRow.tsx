import type { Requirement as APIRequirement } from '@/app/services/api';
import { cn } from '@/app/shared/components/ui/utils';
import { confidencePercent, displayCategory, qualityChecks, requirementText } from '../utils';
import { StatusBadge } from './RequirementPrimitives';

export function RequirementRow({
  requirement,
  selected,
  onSelect,
}: {
  requirement: APIRequirement;
  selected: boolean;
  onSelect: () => void;
}) {
  const gaps = qualityChecks(requirement).filter(check => check.tone === 'warn').length;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full px-4 py-3 text-left transition-colors hover:bg-gray-50',
        selected && 'bg-blue-50 hover:bg-blue-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-gray-500">
              {requirement.req_key || requirement.original_req_id || requirement.req_id.slice(0, 8)}
            </span>
            <StatusBadge status={requirement.status} />
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              {displayCategory(requirement.category)}
            </span>
          </div>
          <div className="mt-1 line-clamp-1 text-sm font-semibold text-gray-950">{requirement.title}</div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">{requirementText(requirement)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold text-gray-700">{confidencePercent(requirement)}%</div>
          <div className={cn('mt-1 text-xs', gaps ? 'text-amber-700' : 'text-green-700')}>
            {gaps ? `${gaps} gap${gaps > 1 ? 's' : ''}` : 'clean'}
          </div>
        </div>
      </div>
    </button>
  );
}
