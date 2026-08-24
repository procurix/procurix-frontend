import type { FactBatch, FactCardDraft } from '@/app/services/api/ingestion';

export type FactReviewDecision = 'approved' | 'rejected' | 'pending' | 'edited' | 'added';

export function isFactRejected(fact: FactCardDraft): boolean {
  return fact.review_status === 'rejected';
}

export function isFactApprovedForCommit(fact: FactCardDraft): boolean {
  return fact.review_status !== 'rejected';
}

export function countFactReviewStates(facts: FactCardDraft[]): {
  approved: number;
  rejected: number;
  pending: number;
} {
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  for (const fact of facts) {
    if (fact.review_status === 'rejected') rejected += 1;
    else if (fact.review_status === 'pending') pending += 1;
    else approved += 1;
  }
  return { approved, rejected, pending };
}

/** Match backend: non-rejected facts are kept; normalize indecisive statuses on batch confirm. */
export function normalizeFactBatchForApproval(batch: FactBatch): FactBatch {
  return {
    ...batch,
    facts: batch.facts.map((fact) => {
      if (fact.review_status === 'rejected') {
        return { ...fact, review_status: 'rejected' };
      }
      if (fact.review_status === 'pending' || fact.review_status === 'edited' || fact.review_status === 'added') {
        return { ...fact, review_status: 'approved' };
      }
      return { ...fact, review_status: fact.review_status || 'approved' };
    }),
  };
}

export function factReviewStatusLabel(status: string): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'edited':
      return 'Edited';
    case 'added':
      return 'Added';
    default:
      return 'Pending';
  }
}
