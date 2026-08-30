import { Lock, Unlock } from 'lucide-react';
import type { IngestionChunkPipeline } from '@/app/services/api/ingestion';
import { Badge } from '@/app/shared/components/ui/badge';
import { CHUNK_STATUS_STYLES, chunkDisplayTitle } from './chunkUtils';
import { cn } from '@/app/shared/components/ui/utils';

interface ChunkListItemProps {
  chunkPipeline: IngestionChunkPipeline;
  selected: boolean;
  onSelect: () => void;
}

export function ChunkListItem({ chunkPipeline, selected, onSelect }: ChunkListItemProps) {
  const { chunk } = chunkPipeline;
  const isCommitted = chunk.status === 'committed';
  const title = chunkDisplayTitle(chunk.metadata, chunk.id);
  const factCount = chunkPipeline.fact_counts.total ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full flex-col gap-1 border-b border-slate-200 px-3 py-3 text-left transition-colors',
        selected ? 'bg-white shadow-sm' : 'bg-slate-50 hover:bg-slate-100/80',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('min-w-0 truncate text-sm font-medium', selected ? 'text-blue-900' : 'text-slate-900')}>
          {title}
        </p>
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 text-[10px]',
            CHUNK_STATUS_STYLES[chunk.status as keyof typeof CHUNK_STATUS_STYLES] ??
              CHUNK_STATUS_STYLES.parsed,
          )}
        >
          {isCommitted ? (
            <>
              <Lock className="h-2.5 w-2.5" />
              committed
            </>
          ) : (
            <>
              <Unlock className="h-2.5 w-2.5" />
              parsed
            </>
          )}
        </Badge>
      </div>
      <p className="text-xs text-slate-500">
        v{chunk.version}
        {factCount > 0 ? ` · ${factCount} fact${factCount === 1 ? '' : 's'}` : ''}
        {chunkPipeline.mention_count > 0
          ? ` · ${chunkPipeline.mention_count} mention${chunkPipeline.mention_count === 1 ? '' : 's'}`
          : ''}
      </p>
    </button>
  );
}
