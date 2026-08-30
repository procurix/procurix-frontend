import type {
  NerCandidateBatch,
  NerCandidateCard,
  NerClusterBatch,
  NerMappingBatch,
  NerStage,
  NerStageBatch,
} from '@/app/services/api/ingestion';

export interface NerReviewable {
  review_status: string;
}

export function isNerItemRejected(item: NerReviewable): boolean {
  return item.review_status === 'rejected';
}

export function isNerItemKept(item: NerReviewable): boolean {
  return item.review_status !== 'rejected';
}

function isNerReviewable(value: unknown): value is NerReviewable {
  return typeof value === 'object' && value !== null && 'review_status' in value;
}

export function countNerReviewStates(items: NerReviewable[]): {
  approved: number;
  rejected: number;
  pending: number;
} {
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  for (const item of items) {
    if (item.review_status === 'rejected') rejected += 1;
    else if (item.review_status === 'pending' || item.review_status === 'needs_review') pending += 1;
    else approved += 1;
  }
  return { approved, rejected, pending };
}

export function normalizeNerItemForApproval<T extends NerReviewable>(item: T): T {
  if (item.review_status === 'rejected') {
    return { ...item, review_status: 'rejected' };
  }
  if (
    item.review_status === 'pending' ||
    item.review_status === 'needs_review' ||
    item.review_status === 'edited' ||
    item.review_status === 'added'
  ) {
    return { ...item, review_status: 'approved' };
  }
  return { ...item, review_status: item.review_status || 'approved' };
}

export function nerReviewStatusLabel(status: string): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'edited':
      return 'Edited';
    case 'added':
      return 'Added';
    case 'needs_review':
      return 'Needs review';
    default:
      return 'Pending';
  }
}

export function listCandidateBatchItems(batch: NerCandidateBatch): NerCandidateCard[] {
  return [
    ...batch.term_candidates,
    ...batch.metric_candidates,
    ...(batch.uncertain_candidates ?? []),
  ];
}

export function listStageBatchItems(batch: NerStageBatch, stage: NerStage): NerReviewable[] {
  if (stage === 'candidate') {
    return listCandidateBatchItems(batch as NerCandidateBatch);
  }
  if (stage === 'cluster') {
    return (batch as NerClusterBatch).clusters;
  }
  const mappingBatch = batch as NerMappingBatch;
  const proposedChanges: NerReviewable[] = [];
  for (const change of mappingBatch.proposed_bucket_changes ?? []) {
    if (isNerReviewable(change)) {
      proposedChanges.push(change);
    }
  }
  return [...mappingBatch.bucket_mappings, ...proposedChanges];
}

export function normalizeNerBatchForApproval(batch: NerStageBatch, stage: NerStage): NerStageBatch {
  if (stage === 'candidate') {
    const candidateBatch = batch as NerCandidateBatch;
    const normalizeList = (items: NerCandidateCard[]) =>
      items.map((item) => normalizeNerItemForApproval(item));
    return {
      ...candidateBatch,
      term_candidates: normalizeList(candidateBatch.term_candidates),
      metric_candidates: normalizeList(candidateBatch.metric_candidates),
      uncertain_candidates: candidateBatch.uncertain_candidates
        ? normalizeList(candidateBatch.uncertain_candidates)
        : undefined,
    };
  }
  if (stage === 'cluster') {
    const clusterBatch = batch as NerClusterBatch;
    return {
      ...clusterBatch,
      clusters: clusterBatch.clusters.map((item) => normalizeNerItemForApproval(item)),
    };
  }
  const mappingBatch = batch as NerMappingBatch;
  return {
    ...mappingBatch,
    bucket_mappings: mappingBatch.bucket_mappings.map((item) =>
      normalizeNerItemForApproval(item),
    ),
    proposed_bucket_changes: mappingBatch.proposed_bucket_changes?.map((change) =>
      isNerReviewable(change) ? normalizeNerItemForApproval(change) : change,
    ),
  };
}

/** User-facing label for bucket mapping decisions (mapping stage only). */
export function mappingDecisionLabel(decision: string): string {
  switch (decision) {
    case 'map_existing':
      return 'Add to existing bucket';
    case 'create_bucket':
      return 'New bucket';
    case 'split_bucket':
      return 'New bucket (split)';
    case 'merge_buckets':
      return 'Merge into existing bucket';
    case 'no_mapping':
      return 'No mapping';
    case 'needs_review':
      return 'Needs review';
    default:
      return decision.replace(/_/g, ' ');
  }
}
