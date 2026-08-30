import { Badge } from '@/app/shared/components/ui/badge';
import { cn } from '@/app/shared/components/ui/utils';
import type { IngestionCapabilities } from '@/app/services/api/ingestion';

const CAPABILITY_LABELS: Record<keyof IngestionCapabilities, string> = {
  database: 'Database',
  parsing: 'Parsing',
  agents: 'Agents',
  ner_schema: 'NER schema',
  ner_bucket_service: 'Bucket service',
};

interface CapabilityBadgesProps {
  capabilities: IngestionCapabilities | null;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

export function CapabilityBadges({
  capabilities,
  isLoading,
  error,
  className,
}: CapabilityBadgesProps) {
  if (isLoading) {
    return (
      <div className={cn('flex flex-wrap gap-1.5', className)}>
        <Badge variant="outline" className="text-slate-500">
          Checking backend…
        </Badge>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex flex-wrap gap-1.5', className)}>
        <Badge variant="destructive">Backend unreachable</Badge>
      </div>
    );
  }

  if (!capabilities) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {(Object.keys(CAPABILITY_LABELS) as Array<keyof IngestionCapabilities>).map((key) => {
        const ready = capabilities[key];
        return (
          <Badge
            key={key}
            variant={ready ? 'secondary' : 'outline'}
            className={cn(
              ready
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-slate-50 text-slate-500',
            )}
            title={ready ? `${CAPABILITY_LABELS[key]} ready` : `${CAPABILITY_LABELS[key]} unavailable`}
          >
            {CAPABILITY_LABELS[key]}
          </Badge>
        );
      })}
    </div>
  );
}
