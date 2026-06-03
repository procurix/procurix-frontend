export type RequirementStatus = 'suggested' | 'edited' | 'confirmed' | 'rejected' | 'needs_evidence' | string;

export type ReviewFilter = 'all' | 'open' | 'approved' | 'gaps' | 'low-confidence';
export type RequirementsWorkspaceView = 'review' | 'matrix';

export interface DraftRequirement {
  category: string;
  title: string;
  description: string;
  specification: string;
  priority: string;
  verification_method: string;
  acceptance_criteria: string;
}

export interface QualityCheck {
  label: string;
  tone: 'good' | 'warn' | 'neutral';
}

export interface RequirementReviewBlocker {
  reqId: string;
  label: string;
  reasons: string[];
}
