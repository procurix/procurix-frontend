import type { ReactNode } from 'react';
import { AlertTriangle, Check, CircleDot, Loader2 } from 'lucide-react';
import { cn } from '@/app/shared/components/ui/utils';
import { displayStatus } from '../utils';

export function SummaryCard({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'good' | 'warn' }) {
  return (
    <div className={cn(
      'rounded-md border p-3',
      tone === 'good' ? 'border-green-200 bg-green-50' : tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50',
    )}>
      <div className="text-2xl font-semibold text-gray-950">{value}</div>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  const normalized = status ?? 'suggested';
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      normalized === 'confirmed' && 'bg-green-100 text-green-700',
      normalized === 'rejected' && 'bg-red-100 text-red-700',
      normalized === 'edited' && 'bg-blue-100 text-blue-700',
      normalized === 'suggested' && 'bg-amber-100 text-amber-700',
      !['confirmed', 'rejected', 'edited', 'suggested'].includes(normalized) && 'bg-gray-100 text-gray-700',
    )}>
      {displayStatus(normalized)}
    </span>
  );
}

export function QualityBadge({ label, tone }: { label: string; tone: 'good' | 'warn' | 'neutral' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium',
      tone === 'good' && 'border-green-200 bg-green-50 text-green-700',
      tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-700',
      tone === 'neutral' && 'border-gray-200 bg-white text-gray-600',
    )}>
      {tone === 'good' ? <Check className="h-3 w-3" /> : tone === 'warn' ? <AlertTriangle className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function FieldPill({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn('rounded-md border p-3', warn ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50')}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold capitalize text-gray-900">{value}</div>
    </div>
  );
}

export function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
      {icon}
      {title}
    </div>
  );
}

export function AiAction({
  icon,
  label,
  action,
  loading,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  action: string;
  loading: boolean;
  onClick: (action: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(action)}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
