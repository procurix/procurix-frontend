import type { CatalogMention } from '@/app/services/api/ingestion';

interface MentionListPanelProps {
  mentions: CatalogMention[];
}

export function MentionListPanel({ mentions }: MentionListPanelProps) {
  if (!mentions.length) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-slate-900">
        Persisted mentions ({mentions.length})
      </h4>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Kind</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Raw</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Normalized</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Bucket</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {mentions.map((mention) => (
              <tr key={mention.mention_id}>
                <td className="px-3 py-2 text-slate-700">{mention.entity_kind}</td>
                <td className="px-3 py-2 text-slate-900">{mention.raw_text}</td>
                <td className="px-3 py-2 text-slate-600">{mention.normalized_text}</td>
                <td className="px-3 py-2 text-slate-700">{mention.bucket_label ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600">{mention.decision ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
