import { Badge } from '@/app/shared/components/ui/badge';
import { cn } from '@/app/shared/components/ui/utils';
import {
  DOCUMENT_PARSE_STATUS_STYLES,
  type DocumentParseStatus,
} from './documentListUtils';

interface StatusBadgeProps {
  status: DocumentParseStatus;
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(DOCUMENT_PARSE_STATUS_STYLES[status], className)}
    >
      {label}
    </Badge>
  );
}
