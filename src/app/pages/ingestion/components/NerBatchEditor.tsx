import { Check, X } from 'lucide-react';
import type {
  NerBucketMapping,
  NerCandidateBatch,
  NerCandidateCard,
  NerClusterBatch,
  NerClusterCard,
  NerMappingBatch,
  NerStageBatch,
} from '@/app/services/api/ingestion';
import { Input } from '@/app/shared/components/ui/input';
import { Button } from '@/app/shared/components/ui/button';
import { Badge } from '@/app/shared/components/ui/badge';
import { cn } from '@/app/shared/components/ui/utils';
import { isNerItemRejected, mappingDecisionLabel, nerReviewStatusLabel } from './nerReviewUtils';

interface NerBatchEditorProps {
  stage: 'candidate' | 'cluster' | 'mapping';
  batch: NerStageBatch;
  editable: boolean;
  reviewable?: boolean;
  onChange: (batch: NerStageBatch) => void;
}

export function NerBatchEditor({
  stage,
  batch,
  editable,
  reviewable,
  onChange,
}: NerBatchEditorProps) {
  if (stage === 'candidate') {
    return (
      <CandidateBatchEditor
        batch={batch as NerCandidateBatch}
        editable={editable}
        reviewable={reviewable}
        onChange={onChange}
      />
    );
  }
  if (stage === 'cluster') {
    return (
      <ClusterBatchEditor
        batch={batch as NerClusterBatch}
        editable={editable}
        reviewable={reviewable}
        onChange={onChange}
      />
    );
  }
  return (
    <MappingBatchEditor
      batch={batch as NerMappingBatch}
      editable={editable}
      reviewable={reviewable}
      onChange={onChange}
    />
  );
}

function CandidateBatchEditor({
  batch,
  editable,
  reviewable,
  onChange,
}: {
  batch: NerCandidateBatch;
  editable: boolean;
  reviewable?: boolean;
  onChange: (batch: NerStageBatch) => void;
}) {
  const updateCandidate = (
    listKey: 'term_candidates' | 'metric_candidates' | 'uncertain_candidates',
    index: number,
    next: NerCandidateCard,
  ) => {
    const list = [...(batch[listKey] ?? [])];
    list[index] = next;
    onChange({ ...batch, [listKey]: list });
  };

  const setReviewStatus = (
    listKey: 'term_candidates' | 'metric_candidates' | 'uncertain_candidates',
    index: number,
    review_status: string,
  ) => {
    const list = batch[listKey] ?? [];
    const item = list[index];
    if (!item) return;
    updateCandidate(listKey, index, { ...item, review_status });
  };

  return (
    <div className="space-y-4">
      {batch.term_candidates.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Term candidates</h4>
          <div className="space-y-3">
            {batch.term_candidates.map((candidate, index) => (
              <CandidateCard
                key={candidate.candidate_id}
                candidate={candidate}
                editable={editable}
                reviewable={reviewable}
                onChange={(next) => updateCandidate('term_candidates', index, next)}
                onApprove={() => setReviewStatus('term_candidates', index, 'approved')}
                onReject={() => setReviewStatus('term_candidates', index, 'rejected')}
              />
            ))}
          </div>
        </section>
      )}
      {batch.metric_candidates.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Metric candidates</h4>
          <div className="space-y-3">
            {batch.metric_candidates.map((candidate, index) => (
              <CandidateCard
                key={candidate.candidate_id}
                candidate={candidate}
                editable={editable}
                reviewable={reviewable}
                onChange={(next) => updateCandidate('metric_candidates', index, next)}
                onApprove={() => setReviewStatus('metric_candidates', index, 'approved')}
                onReject={() => setReviewStatus('metric_candidates', index, 'rejected')}
              />
            ))}
          </div>
        </section>
      )}
      {(batch.uncertain_candidates?.length ?? 0) > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Uncertain candidates</h4>
          <div className="space-y-3">
            {batch.uncertain_candidates!.map((candidate, index) => (
              <CandidateCard
                key={candidate.candidate_id}
                candidate={candidate}
                editable={editable}
                reviewable={reviewable}
                onChange={(next) => updateCandidate('uncertain_candidates', index, next)}
                onApprove={() => setReviewStatus('uncertain_candidates', index, 'approved')}
                onReject={() => setReviewStatus('uncertain_candidates', index, 'rejected')}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  editable,
  reviewable,
  onChange,
  onApprove,
  onReject,
}: {
  candidate: NerCandidateCard;
  editable: boolean;
  reviewable?: boolean;
  onChange: (next: NerCandidateCard) => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const rejected = isNerItemRejected(candidate);

  return (
    <article
      className={cn(
        'rounded-lg border border-l-4 bg-white p-4',
        rejected
          ? 'border-slate-200 border-l-red-400 bg-slate-50 opacity-75'
          : 'border-slate-200 border-l-violet-500',
      )}
    >
      <ReviewableCardHeader
        title={candidate.candidate_type}
        id={candidate.candidate_id}
        reviewStatus={candidate.review_status}
        reviewable={reviewable}
        rejected={rejected}
        onApprove={onApprove}
        onReject={onReject}
      />
      <div
        className={cn(
          'grid gap-3 sm:grid-cols-2',
          rejected && 'pointer-events-none opacity-60',
        )}
      >
        <Field label="Raw text">
          {editable && !rejected ? (
            <Input
              value={candidate.raw_text}
              onChange={(e) => onChange({ ...candidate, raw_text: e.target.value, review_status: 'edited' })}
            />
          ) : (
            <p className={cn('text-sm', rejected && 'line-through')}>{candidate.raw_text}</p>
          )}
        </Field>
        <Field label="Canonical name">
          {editable && !rejected ? (
            <Input
              value={candidate.canonical_name}
              onChange={(e) =>
                onChange({ ...candidate, canonical_name: e.target.value, review_status: 'edited' })
              }
            />
          ) : (
            <p className={cn('text-sm', rejected && 'line-through')}>{candidate.canonical_name}</p>
          )}
        </Field>
      </div>
      {candidate.rationale && (
        <p className="mt-2 text-xs text-slate-500">{candidate.rationale}</p>
      )}
    </article>
  );
}

function ClusterBatchEditor({
  batch,
  editable,
  reviewable,
  onChange,
}: {
  batch: NerClusterBatch;
  editable: boolean;
  reviewable?: boolean;
  onChange: (batch: NerStageBatch) => void;
}) {
  const updateCluster = (index: number, next: NerClusterCard) => {
    const clusters = [...batch.clusters];
    clusters[index] = next;
    onChange({ ...batch, clusters });
  };

  return (
    <div className="space-y-3">
      {batch.clusters.map((cluster, index) => {
        const rejected = isNerItemRejected(cluster);
        return (
          <article
            key={cluster.cluster_id}
            className={cn(
              'rounded-lg border border-l-4 bg-white p-4',
              rejected
                ? 'border-slate-200 border-l-red-400 bg-slate-50 opacity-75'
                : 'border-slate-200 border-l-indigo-500',
            )}
          >
            <ReviewableCardHeader
              title={cluster.cluster_type}
              id={cluster.cluster_id}
              reviewStatus={cluster.review_status}
              reviewable={reviewable}
              rejected={rejected}
              onApprove={() => updateCluster(index, { ...cluster, review_status: 'approved' })}
              onReject={() => updateCluster(index, { ...cluster, review_status: 'rejected' })}
            />
            <div className={cn(rejected && 'pointer-events-none opacity-60')}>
              <Field label="Canonical name">
                {editable && !rejected ? (
                  <Input
                    value={cluster.canonical_name}
                    onChange={(e) =>
                      updateCluster(index, {
                        ...cluster,
                        canonical_name: e.target.value,
                        review_status: 'edited',
                      })
                    }
                  />
                ) : (
                  <p className={cn('text-sm', rejected && 'line-through')}>{cluster.canonical_name}</p>
                )}
              </Field>
              {cluster.aliases.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Aliases: {cluster.aliases.join(', ')}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MappingBatchEditor({
  batch,
  editable,
  reviewable,
  onChange,
}: {
  batch: NerMappingBatch;
  editable: boolean;
  reviewable?: boolean;
  onChange: (batch: NerStageBatch) => void;
}) {
  const updateMapping = (index: number, next: NerBucketMapping) => {
    const bucket_mappings = [...batch.bucket_mappings];
    bucket_mappings[index] = next;
    onChange({ ...batch, bucket_mappings });
  };

  return (
    <div className="space-y-3">
      {batch.bucket_mappings.map((mapping, index) => {
        const entity = batch.entities.find((e) => e.entity_id === mapping.entity_id);
        const rejected = isNerItemRejected(mapping);
        return (
          <article
            key={mapping.mapping_id}
            className={cn(
              'rounded-lg border border-l-4 bg-white p-4',
              rejected
                ? 'border-slate-200 border-l-red-400 bg-slate-50 opacity-75'
                : 'border-slate-200 border-l-teal-500',
            )}
          >
            <ReviewableCardHeader
              title={mapping.bucket_type}
              id={mapping.mapping_id}
              reviewStatus={mapping.review_status}
              reviewable={reviewable}
              rejected={rejected}
              onApprove={() => updateMapping(index, { ...mapping, review_status: 'approved' })}
              onReject={() => updateMapping(index, { ...mapping, review_status: 'rejected' })}
            />
            <div
              className={cn(
                'grid gap-3 sm:grid-cols-2',
                rejected && 'pointer-events-none opacity-60',
              )}
            >
              <Field label="Entity">
                <p className={cn('text-sm text-slate-700', rejected && 'line-through')}>
                  {entity?.raw_text ?? mapping.bucket_canonical_name}
                </p>
              </Field>
              <Field label="Bucket action">
                <p className="text-sm text-slate-700">{mappingDecisionLabel(mapping.decision)}</p>
              </Field>
              <Field label="Bucket name">
                {editable && !rejected ? (
                  <Input
                    value={mapping.bucket_canonical_name}
                    onChange={(e) =>
                      updateMapping(index, {
                        ...mapping,
                        bucket_canonical_name: e.target.value,
                        review_status: 'edited',
                      })
                    }
                  />
                ) : (
                  <p className={cn('text-sm', rejected && 'line-through')}>
                    {mapping.bucket_canonical_name}
                  </p>
                )}
              </Field>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ReviewableCardHeader({
  title,
  id,
  reviewStatus,
  reviewable,
  rejected,
  onApprove,
  onReject,
}: {
  title: string;
  id: string;
  reviewStatus: string;
  reviewable?: boolean;
  rejected: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className={cn('text-sm font-semibold text-slate-900', rejected && 'line-through')}>
          {title}
        </p>
        {reviewable && (
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              rejected && 'border-red-200 bg-red-50 text-red-800',
              reviewStatus === 'approved' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              reviewStatus === 'needs_review' && 'border-amber-200 bg-amber-50 text-amber-900',
              reviewStatus === 'edited' && 'border-amber-200 bg-amber-50 text-amber-900',
            )}
          >
            {nerReviewStatusLabel(reviewStatus)}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {reviewable && onApprove && onReject && (
          <>
            <Button
              type="button"
              size="sm"
              variant={rejected ? 'outline' : 'default'}
              disabled={!rejected && reviewStatus === 'approved'}
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
        <span className="text-xs text-slate-500">{id}</span>
      </div>
    </div>
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
