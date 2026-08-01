import { createHash } from 'crypto';
import type { AnalysisInputSnapshot, IdentityAnalysisSettings, IdentityAnalysisState, EvidenceDependencyAudit } from '../types/identityAnalysis';
import type { AccessMode, IdentityEvidenceItem, IdentityCandidate, IdentitySearchProfile, IdentificationAction, BoundedReconstructionQuestion, CriticalUnknown, SourceProvenance, UnknownRegistryItem } from '../types/identityForensics';
import type { IdentityCase } from '../data/refugioCase';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return entries.reduce<Record<string, unknown>>((accumulator, [key, item]) => {
    accumulator[key] = sortKeys(item);
    return accumulator;
  }, {});
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function hashIdentityState(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function hashToVersion(hash: string): number {
  return Number.parseInt(hash.slice(0, 8), 16);
}

function normalizeEvidence(evidence: IdentityEvidenceItem[]): IdentityEvidenceItem[] {
  return [...evidence].sort((left, right) => left.id.localeCompare(right.id)).map((item) => ({
    ...item,
    provenance: [...(item.provenance ?? [])].sort((left, right) => left.citationOrRecordId.localeCompare(right.citationOrRecordId)),
  }));
}

function normalizeCandidates(candidates: IdentityCandidate[]): IdentityCandidate[] {
  return [...candidates].sort((left, right) => left.id.localeCompare(right.id)).map((candidate) => ({
    ...candidate,
    provenance: [...candidate.provenance].sort((left, right) => left.citationOrRecordId.localeCompare(right.citationOrRecordId)),
    supportingEvidenceIds: [...candidate.supportingEvidenceIds].sort(),
    contradictingEvidenceIds: [...candidate.contradictingEvidenceIds].sort(),
    unknownEvidenceIds: [...candidate.unknownEvidenceIds].sort(),
    requiredAssumptions: [...candidate.requiredAssumptions].sort(),
    decisiveTests: [...candidate.decisiveTests].sort(),
  }));
}

function normalizeSearchProfiles(searchProfiles: IdentitySearchProfile[]): IdentitySearchProfile[] {
  return [...searchProfiles].sort((left, right) => left.profileId.localeCompare(right.profileId)).map((profile) => ({
    ...profile,
    supportingEvidenceIds: [...profile.supportingEvidenceIds].sort(),
    contradictingEvidenceIds: [...profile.contradictingEvidenceIds].sort(),
    unknownEvidenceIds: [...profile.unknownEvidenceIds].sort(),
    requiredAssumptions: [...profile.requiredAssumptions].sort(),
    recordsNeeded: [...profile.recordsNeeded].sort(),
    jurisdictionsToSearch: [...profile.jurisdictionsToSearch].sort(),
    evidenceThatWouldWeakenProfile: [...profile.evidenceThatWouldWeakenProfile].sort(),
    limitations: [...profile.limitations].sort(),
  }));
}

function normalizeActions(actions: IdentificationAction[]): IdentificationAction[] {
  return [...actions].sort((left, right) => left.id.localeCompare(right.id)).map((action) => ({
    ...action,
    whyItMatters: [...(action.whyItMatters ?? [])].sort(),
    prerequisites: [...(action.prerequisites ?? [])].sort(),
    authorizationRequired: [...(action.authorizationRequired ?? [])].sort(),
    limitations: [...(action.limitations ?? [])].sort(),
    uncertainty: [...(action.uncertainty ?? [])].sort(),
    supportingEvidenceIds: [...(action.supportingEvidenceIds ?? [])].sort(),
    assumptions: [...(action.assumptions ?? [])].sort(),
    positiveResultNextSteps: [...(action.positiveResultNextSteps ?? [])].sort(),
    negativeResultNextSteps: [...(action.negativeResultNextSteps ?? [])].sort(),
    unknownAvailabilityNextSteps: [...(action.unknownAvailabilityNextSteps ?? [])].sort(),
  }));
}

function normalizeQuestions(questions: BoundedReconstructionQuestion[]): BoundedReconstructionQuestion[] {
  return [...questions].sort((left, right) => left.id.localeCompare(right.id)).map((question) => ({
    ...question,
    facts: [...question.facts].sort(),
    supportingEvidenceIds: [...question.supportingEvidenceIds].sort(),
    contradictingEvidenceIds: [...question.contradictingEvidenceIds].sort(),
    unknowns: [...question.unknowns].sort(),
    assumptions: [...question.assumptions].sort(),
    requiredEvidence: [...question.requiredEvidence].sort(),
    limitations: [...question.limitations].sort(),
  }));
}

function normalizeUnknowns(unknowns: UnknownRegistryItem[]): CriticalUnknown[] {
  return [...unknowns].sort((left, right) => left.id.localeCompare(right.id)).map((unknown) => ({
    id: unknown.id,
    title: unknown.title,
    whyItMatters: unknown.detail,
    currentStatus: unknown.impact === 'high' ? 'unknown' : unknown.impact === 'medium' ? 'partially_known' : 'restricted',
    expectedInformationGain: unknown.impact === 'high' ? 'very_high' : unknown.impact === 'medium' ? 'high' : 'moderate',
    blocksConclusions: [unknown.detail],
    actionToResolve: 'Resolve the unknown through the current case workflow.',
    responsibleSource: 'unknown',
    accessLevel: 'public',
    evidenceIds: [],
  }));
}

function buildEvidenceDependencyAudits(evidence: IdentityEvidenceItem[]): EvidenceDependencyAudit[] {
  const groups = new Map<string, string[]>();

  for (const item of evidence) {
    const independenceGroup = (item as IdentityEvidenceItem & { independenceGroup?: string }).independenceGroup
      ?? item.provenance?.[0]?.citationOrRecordId
      ?? item.id;
    const existing = groups.get(independenceGroup) ?? [];
    existing.push(item.id);
    groups.set(independenceGroup, existing);
  }

  return evidence.map((item) => {
    const independenceGroup = (item as IdentityEvidenceItem & { independenceGroup?: string }).independenceGroup
      ?? item.provenance?.[0]?.citationOrRecordId
      ?? item.id;
    const grouped = groups.get(independenceGroup) ?? [item.id];
    const duplicatedBy = grouped.filter((identifier) => identifier !== item.id);
    const duplicateCount = grouped.length - 1;
    const effectiveWeightAdjustment = Math.max(0.35, 1 - duplicateCount * 0.2);

    return {
      evidenceId: item.id,
      independenceGroup,
      duplicatedBy,
      effectiveWeightAdjustment,
      explanation: duplicatedBy.length > 0
        ? 'This evidence shares an independence group with repeated reporting, so its weight is reduced to avoid double counting.'
        : 'This evidence appears to be independently sourced within the current state.',
    };
  });
}

export interface NormalizeIdentityCaseInput {
  caseRecord: IdentityCase;
  accessMode: AccessMode;
  settings?: IdentityAnalysisSettings;
}

export function normalizeIdentityCase(input: NormalizeIdentityCaseInput): IdentityAnalysisState {
  const settings: IdentityAnalysisSettings = {
    fixtureMode: input.settings?.fixtureMode ?? true,
    runLabel: input.settings?.runLabel,
  };

  const normalizedEvidence = normalizeEvidence(input.caseRecord.evidence ?? []);
  const normalizedCandidateRecords = normalizeCandidates(input.caseRecord.candidateRecords ?? []);
  const normalizedSearchProfiles = normalizeSearchProfiles(input.caseRecord.searchProfiles ?? []);
  const normalizedActions = normalizeActions(input.caseRecord.forensicActions ?? []);
  const normalizedRecordsActions = normalizeActions(input.caseRecord.recordsActions ?? []);
  const normalizedOutreachActions = normalizeActions(input.caseRecord.outreachActions ?? []);
  const normalizedReconstructionQuestions = normalizeQuestions(input.caseRecord.reconstructionQuestions ?? []);
  const normalizedUnknowns = normalizeUnknowns(input.caseRecord.unknowns ?? []);
  const evidenceDependencyAudits = buildEvidenceDependencyAudits(normalizedEvidence);

  const stateHashSource = {
    caseRecord: input.caseRecord,
    accessMode: input.accessMode,
    settings,
    evidenceDependencyAudits,
  };
  const caseStateHash = hashIdentityState(stateHashSource);

  return {
    caseRecord: input.caseRecord,
    accessMode: input.accessMode,
    settings,
    normalizedEvidence,
    normalizedCandidateRecords,
    normalizedSearchProfiles,
    normalizedActions,
    normalizedRecordsActions,
    normalizedOutreachActions,
    normalizedReconstructionQuestions,
    normalizedUnknowns,
    normalizedProvenance: [...(input.caseRecord.provenance ?? [])].sort((left, right) => left.citationOrRecordId.localeCompare(right.citationOrRecordId)),
    coverageMetrics: input.caseRecord.coverageMetrics,
    recordSearchCoverage: input.caseRecord.recordSearchCoverage,
    humanReviewDecisions: input.caseRecord.humanReviewDecisions,
    evidenceDependencyAudits,
    caseStateHash,
    evidenceVersion: hashToVersion(hashIdentityState(normalizedEvidence)),
    candidateVersion: hashToVersion(hashIdentityState(normalizedCandidateRecords)),
    unknownRegistryVersion: hashToVersion(hashIdentityState(normalizedUnknowns)),
    settingsVersion: hashToVersion(hashIdentityState(settings)),
  };
}

export function buildAnalysisSnapshot(state: IdentityAnalysisState, runId: string, createdAt = new Date().toISOString()): AnalysisInputSnapshot {
  return {
    caseId: state.caseRecord.id,
    runId,
    caseStateHash: state.caseStateHash,
    createdAt,
    evidenceVersion: state.evidenceVersion,
    candidateVersion: state.candidateVersion,
    unknownRegistryVersion: state.unknownRegistryVersion,
    settingsVersion: state.settingsVersion,
  };
}