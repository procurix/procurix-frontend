import type { Requirement as APIRequirement } from '@/app/services/api';
import type { DraftRequirement, QualityCheck, RequirementReviewBlocker, RequirementStatus } from './types';

export const emptyDraft: DraftRequirement = {
  category: 'functional',
  title: '',
  description: '',
  specification: '',
  priority: 'must_have',
  verification_method: '',
  acceptance_criteria: '',
};

export const categoryLabels: Record<string, string> = {
  power: 'Power',
  interface: 'Interface',
  functional: 'Functional',
  performance: 'Performance',
  safety: 'Safety',
  compliance: 'Compliance',
  environmental: 'Environmental',
};

export const statusLabels: Record<string, string> = {
  suggested: 'Suggested',
  edited: 'Edited',
  confirmed: 'Approved',
  rejected: 'Rejected',
  needs_evidence: 'Needs Evidence',
};

export const verificationOptions = ['inspection', 'analysis', 'test', 'simulation', 'review'];

export function displayCategory(category: string | null | undefined): string {
  if (!category) return 'Uncategorized';
  return categoryLabels[category] ?? category.replace(/_/g, ' ');
}

export function displayStatus(status: RequirementStatus | null | undefined): string {
  return statusLabels[status ?? 'suggested'] ?? String(status ?? 'suggested');
}

export function confidencePercent(req: APIRequirement): number {
  if (req.confidence == null) return 100;
  return req.confidence <= 1 ? Math.round(req.confidence * 100) : Math.round(req.confidence);
}

export function requirementText(req: APIRequirement): string {
  return req.specification || req.description || req.requirement_text || '';
}

export function qualityChecks(req: APIRequirement): QualityCheck[] {
  const text = requirementText(req);
  const warnings: QualityCheck[] = [];
  const hasSource = (req.source_mpns?.length ?? 0) > 0 || (req.source_standards?.length ?? 0) > 0 || (req.bom_reference?.length ?? 0) > 0;
  const hasVerification = Boolean(req.verification_method);
  const hasCriteria = Boolean(req.acceptance_criteria || req.specification);
  const hasShall = /\bshall\b/i.test(text);
  const tooLong = text.length > 360;
  const lowConfidence = confidencePercent(req) < 70;

  warnings.push(hasSource ? { label: 'Traceable', tone: 'good' } : { label: 'No Source', tone: 'warn' });
  warnings.push(hasVerification ? { label: 'Verification', tone: 'good' } : { label: 'Needs Verification', tone: 'warn' });
  warnings.push(hasCriteria ? { label: 'Criteria', tone: 'good' } : { label: 'Needs Criteria', tone: 'warn' });
  warnings.push(hasShall ? { label: 'Shall Statement', tone: 'good' } : { label: 'Weak Wording', tone: 'warn' });
  if (tooLong) warnings.push({ label: 'Too Broad', tone: 'warn' });
  if (lowConfidence) warnings.push({ label: 'Low Confidence', tone: 'warn' });
  if (!tooLong && !lowConfidence) warnings.push({ label: 'Atomic', tone: 'neutral' });

  return warnings;
}

export function hasQualityGap(req: APIRequirement): boolean {
  return qualityChecks(req).some(check => check.tone === 'warn');
}

export function requirementReviewBlockers(requirements: APIRequirement[]): RequirementReviewBlocker[] {
  return requirements.flatMap((req) => {
    if ((req.priority ?? 'must_have') !== 'must_have' || req.status === 'rejected') return [];

    const reasons: string[] = [];
    const hasSource = (req.source_mpns?.length ?? 0) > 0 || (req.source_standards?.length ?? 0) > 0 || (req.bom_reference?.length ?? 0) > 0;
    if (req.status !== 'confirmed') reasons.push('must be approved');
    if (!hasSource) reasons.push('needs traceability');
    if (!req.verification_method) reasons.push('needs verification method');
    if (!req.acceptance_criteria && !req.specification) reasons.push('needs acceptance criteria');

    if (!reasons.length) return [];
    return [{
      reqId: req.req_id,
      label: req.req_key || req.title || req.req_id.slice(0, 8),
      reasons,
    }];
  });
}

export function normalizeRequirementForUi(req: APIRequirement): APIRequirement {
  return {
    ...req,
    status: req.status ?? 'suggested',
    priority: req.priority ?? 'must_have',
    category: req.category ?? 'functional',
    title: req.title || req.original_req_id || req.req_key || 'Untitled requirement',
    specification: req.specification || '',
    description: req.description || req.requirement_text || '',
    source_mpns: req.source_mpns ?? req.bom_reference ?? [],
    source_standards: req.source_standards ?? [],
    bom_reference: req.bom_reference ?? req.source_mpns ?? [],
  };
}

export function formatTraceValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}
