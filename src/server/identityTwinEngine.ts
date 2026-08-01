import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { IdentityCase } from '../data/refugioCase';
import type { AccessMode, IdentityCandidate, IdentityEvidenceItem, IdentitySearchProfile, IdentificationAction, BoundedReconstructionQuestion } from '../types/identityForensics';
import type {
  AnalyticalHypothesis,
  AnalysisInputSnapshot,
  AnalysisExecutionStatus,
  ContradictionFinding,
  EvidenceDependencyAudit,
  IdentityActionPriority,
  IdentityAnalysisSettings,
  IdentityAnalysisState,
  IdentityBoundedReconstructionQuestion,
  IdentityCandidateAssessment,
  IdentityCaseUnderstanding,
  IdentityMechanism,
  IdentityMechanismContext,
  IdentityMechanismProposal,
  IdentityProfileAssessment,
  IdentityPublicOutreachPriority,
  IdentityRecommendedAction,
  IdentityRecordSearchStrategy,
  IdentityTwinComparison,
  IdentityTwinResult,
  IdentityTwinRunResponse,
  SemanticProposalBundle,
  SemanticProfileProposal,
  SemanticCandidateProposal,
  SemanticActionProposal,
  SemanticInformationGapProposal,
  SemanticContradictionProposal,
  SemanticHypothesisProposal,
} from '../types/identityAnalysis';
import { analysisExecutionStatusSchema, baselineTwinPayloadSchema, mechanismProposalSchema, semanticProposalBundleSchema, twinResultSchema } from './identitySchemas';
import { baselineIdentityPrompt } from './prompts/baselineIdentityPrompt';
import { buildAnalysisSnapshot, hashIdentityState, normalizeIdentityCase } from './identityNormalization';
import { generateGeminiJson, hasGeminiConfiguration } from './geminiClient';

interface TwinEngineInput {
  caseRecord: IdentityCase;
  settings?: IdentityAnalysisSettings;
  accessMode: AccessMode;
  previousRun?: IdentityTwinResult;
}

export interface IdentityTwinRunBundle {
  runId: string;
  caseStateHash: string;
  snapshot: AnalysisInputSnapshot;
  baseline: IdentityTwinResult;
  hrm: IdentityTwinResult;
  comparison: IdentityTwinComparison;
  mode: 'live' | 'fixture';
}

export interface IdentityTwinRunOutcome {
  executionStatus: AnalysisExecutionStatus;
  bundle?: IdentityTwinResult;
  failureMessage?: string;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean).sort();
}

function buildExecutionStatus(input: {
  requestedMode: 'live' | 'fixture';
  actualMode: 'live' | 'fixture' | 'failed';
  liveAttempted: boolean;
  liveSucceeded: boolean;
  fallbackAllowed: boolean;
  fallbackUsed: boolean;
  startedAt: string;
  failureCode?: string;
  failureMessage?: string;
}): AnalysisExecutionStatus {
  return analysisExecutionStatusSchema.parse({
    ...input,
    completedAt: new Date().toISOString(),
  }) as AnalysisExecutionStatus;
}

function mapSemanticProposal(proposal: {
  proposalId: string;
  statement: string;
  evidenceIds: string[];
  contradictingEvidenceIds: string[];
  unknownEvidenceIds: string[];
  assumptions: string[];
  confidenceCategory: 'weak' | 'moderate' | 'strong' | 'blocked_by_missing_data';
  test: string;
  whatWouldWeakenIt: string;
  whatItCannotEstablish: string;
}): SemanticProfileProposal {
  return {
    proposalId: proposal.proposalId,
    statement: proposal.statement,
    evidenceIds: proposal.evidenceIds,
    contradictingEvidenceIds: proposal.contradictingEvidenceIds,
    unknownEvidenceIds: proposal.unknownEvidenceIds,
    assumptions: proposal.assumptions,
    confidenceCategory: proposal.confidenceCategory,
    test: proposal.test,
    whatWouldWeakenIt: proposal.whatWouldWeakenIt,
    whatItCannotEstablish: proposal.whatItCannotEstablish,
  };
}

function buildDeterministicSemanticProposalBundle(state: IdentityAnalysisState): SemanticProposalBundle {
  const profile: SemanticProfileProposal = mapSemanticProposal({
    proposalId: 'sem_profile_region',
    statement: 'A regional records-first profile remains the most actionable starting point.',
    evidenceIds: state.normalizedEvidence.map((item) => item.id).slice(0, 2),
    contradictingEvidenceIds: [],
    unknownEvidenceIds: state.normalizedUnknowns.map((item) => item.id).slice(0, 2),
    assumptions: ['The public record remains incomplete.'],
    confidenceCategory: 'moderate',
    test: 'Search adjacent jurisdictions and compare against entered records.',
    whatWouldWeakenIt: 'A confirmed long-distance travel record or an out-of-area identity link.',
    whatItCannotEstablish: 'Identity itself.',
  });

  const candidate: SemanticCandidateProposal = mapSemanticProposal({
    proposalId: 'sem_candidate_set',
    statement: 'Any entered candidate should be treated as comparison data, not an assumed match.',
    evidenceIds: state.normalizedCandidateRecords.map((candidateRecord) => candidateRecord.id),
    contradictingEvidenceIds: [],
    unknownEvidenceIds: state.normalizedUnknowns.map((item) => item.id).slice(0, 3),
    assumptions: ['Candidates are incomplete and require validation.'],
    confidenceCategory: 'weak',
    test: 'Verify records, exclusions, and forensic availability before ranking a candidate highly.',
    whatWouldWeakenIt: 'A completed exclusion or mismatch.',
    whatItCannotEstablish: 'That a candidate is the woman.',
  });

  const action: SemanticActionProposal = mapSemanticProposal({
    proposalId: 'sem_action_dna',
    statement: 'DNA availability is the highest-value gate if any biological material exists.',
    evidenceIds: ['E_CASE_FACTS'],
    contradictingEvidenceIds: [],
    unknownEvidenceIds: ['U_DNA'],
    assumptions: ['A usable biological sample may exist.'],
    confidenceCategory: 'moderate',
    test: 'Confirm specimen status with the laboratory or medical examiner record.',
    whatWouldWeakenIt: 'No retrievable biological material.',
    whatItCannotEstablish: 'A completed identity determination without comparison context.',
  });

  const gap: SemanticInformationGapProposal = mapSemanticProposal({
    proposalId: 'sem_gap_coverage',
    statement: 'Record coverage completeness remains unknown.',
    evidenceIds: ['E_CASE_FACTS'],
    contradictingEvidenceIds: [],
    unknownEvidenceIds: ['U_DNA', 'U_DENTAL'],
    assumptions: ['Repository coverage has not been fully documented.'],
    confidenceCategory: 'blocked_by_missing_data',
    test: 'Document which jurisdictions and repositories were searched.',
    whatWouldWeakenIt: 'A complete coverage audit.',
    whatItCannotEstablish: 'That a case is solved.',
  });

  const contradiction: SemanticContradictionProposal = mapSemanticProposal({
    proposalId: 'sem_contradiction_duplicate',
    statement: 'Repeated reporting should not be treated as independent confirmation.',
    evidenceIds: state.evidenceDependencyAudits.map((audit) => audit.evidenceId),
    contradictingEvidenceIds: state.evidenceDependencyAudits.flatMap((audit) => audit.duplicatedBy),
    unknownEvidenceIds: [],
    assumptions: ['The independence groups were normalized correctly.'],
    confidenceCategory: 'strong',
    test: 'Deduplicate repeated source lineage before ranking evidence.',
    whatWouldWeakenIt: 'Verified independent provenance for each source.',
    whatItCannotEstablish: 'That duplicate reporting is a match.',
  });

  const hypothesis: SemanticHypothesisProposal = mapSemanticProposal({
    proposalId: 'sem_hypothesis_public_brief',
    statement: 'A guarded public brief focused on the clothing set may generate the most useful non-forensic leads.',
    evidenceIds: ['E_CLOTHING', 'E_CASE_FACTS'],
    contradictingEvidenceIds: [],
    unknownEvidenceIds: ['U_DNA'],
    assumptions: ['The brief can be released through an authorized channel.'],
    confidenceCategory: 'moderate',
    test: 'Release an approved public recognition brief and review credible tips.',
    whatWouldWeakenIt: 'No useful tips or a higher-value forensic path.',
    whatItCannotEstablish: 'Identity.',
  });

  const semanticBundle = {
    proposedProfiles: [profile],
    proposedCandidateAssessments: [candidate],
    proposedActions: [action],
    proposedInformationGaps: [gap],
    proposedContradictions: [contradiction],
    proposedHypotheses: [hypothesis],
    rejectedUnsupportedIdeas: ['Identity declaration', 'Unverified DNA match', 'Unverified suspect accusation'],
    limitations: ['Deterministic fixture semantic proposals are used only for demonstration mode.'],
  } as any;

  return semanticProposalBundleSchema.parse(semanticBundle) as SemanticProposalBundle;
}

function buildCaseUnderstanding(state: IdentityAnalysisState, tone: 'baseline' | 'hrm'): IdentityCaseUnderstanding {
  const facts = [
    `${state.caseRecord.title} is an unidentified-remains case in ${state.caseRecord.jurisdiction}.`,
    `Discovery date: ${state.caseRecord.discovery.discoveredOn}.`,
    `Recovery context: ${state.caseRecord.discovery.recoveryContext}.`,
    `Biological profile: ${state.caseRecord.biologicalProfile.sex}, ${state.caseRecord.biologicalProfile.estimatedAge}, ${state.caseRecord.biologicalProfile.estimatedHeight}, ancestry estimate ${state.caseRecord.biologicalProfile.ancestryEstimate}.`,
    `Approximate death interval: ${state.caseRecord.deathContext.approximateDeathInterval}.`,
  ];

  const derivedObservations = tone === 'baseline'
    ? [
        'The recovery context supports a regional search posture rather than a single-candidate declaration.',
        'Clothing is distinctive enough to support targeted public recognition if authorized.',
        'The current candidate set size and coverage state should drive residual weight, not a preset constant.',
      ]
    : [
        'Mechanism outputs should be read as comparative weights, not probabilities.',
        'Evidence independence matters because repeated reporting can otherwise inflate confidence.',
        'The current evidence supports multiple testable records-search and forensic branches rather than a fixed ranking.',
      ];

  return {
    establishedFacts: facts,
    derivedObservations,
    unsupportedClaimsRejected: [
      'No identity has been declared.',
      'No database match, forensic match, or witness statement is being claimed without source support.',
    ],
    sourceWarnings: state.evidenceDependencyAudits.map((audit) => audit.explanation),
  };
}

function scoreFromEvidence(state: IdentityAnalysisState): number {
  const independenceWeights = state.evidenceDependencyAudits.map((audit) => audit.effectiveWeightAdjustment);
  const base = average(independenceWeights.length > 0 ? independenceWeights : [0.5]);
  const coverage = state.coverageMetrics
    ? clamp((state.coverageMetrics.publicRecordsReviewed + state.coverageMetrics.verifiedExclusions) / 20)
    : 0.35;
  const candidatePressure = state.normalizedCandidateRecords.length > 0 ? clamp(state.normalizedCandidateRecords.length / 10) : 0.15;
  return clamp(0.2 + base * 0.35 + coverage * 0.25 + candidatePressure * 0.2);
}

function buildResidualAssessment(state: IdentityAnalysisState) {
  const candidateCount = state.normalizedCandidateRecords.length;
  const evidenceCount = state.normalizedEvidence.length;
  const databaseCoverage = state.coverageMetrics?.databasesSearched ?? 0;
  const jurisdictionCoverage = state.coverageMetrics?.jurisdictionsSearched ?? 0;
  const duplicatePenalty = state.evidenceDependencyAudits.filter((audit) => audit.duplicatedBy.length > 0).length * 0.04;
  const coverageFactor = clamp(1 - ((databaseCoverage + jurisdictionCoverage) / 20));
  const unresolvedUnknowns = state.normalizedUnknowns.filter((item) => item.currentStatus !== 'resolved').length;
  const unresolvedPenalty = clamp(unresolvedUnknowns / 10) * 0.12;
  const evidenceFactor = evidenceCount === 0 ? 0.18 : clamp(1 / evidenceCount) * 0.12;
  const candidateFactor = candidateCount === 0 ? 0.24 : clamp(1 / (candidateCount + 1)) * 0.18;
  const residualWeight = clamp(0.18 + coverageFactor * 0.32 + evidenceFactor + candidateFactor + unresolvedPenalty - duplicatePenalty, 0.12, 0.88);

  return {
    preserved: true as const,
    residualWeight,
    uncertainty: [round(clamp(residualWeight - 0.18, 0.05, 0.8)), round(clamp(residualWeight + 0.16, 0.2, 0.94))],
    interpretation: 'comparative_analytical_weight_not_probability' as const,
    reasons: [
      candidateCount === 0 ? 'No named candidates have been entered.' : 'Named candidates are present but do not exhaust the search space.',
      'Record coverage is incomplete or not fully documented.',
      unresolvedUnknowns > 0 ? 'High-value unknowns remain unresolved.' : 'Some candidate and evidence uncertainty remains.',
      state.evidenceDependencyAudits.some((audit) => audit.duplicatedBy.length > 0)
        ? 'Repeated public reporting reduces the amount of independent confirmation.'
        : 'Independent evidence is present but not exhaustive.',
    ],
    increasesWhen: [
      'candidate coverage is sparse',
      'alias and duplicate coverage is incomplete',
      'forensic comparison status is unknown',
      'high-value unknowns remain unresolved',
    ],
    decreasesWhen: [
      'candidate records are comprehensively entered',
      'search coverage expands across jurisdictions and repositories',
      'forensic comparisons resolve key unknowns',
      'duplicate reporting is deduplicated into independent source groups',
    ],
    calculationInputs: [
      { inputId: 'candidate_count', label: 'Named candidates entered', value: candidateCount, provenance: 'normalized candidate records' },
      { inputId: 'database_coverage', label: 'Databases searched', value: databaseCoverage, provenance: 'coverage metrics' },
      { inputId: 'jurisdiction_coverage', label: 'Jurisdictions searched', value: jurisdictionCoverage, provenance: 'coverage metrics' },
      { inputId: 'unresolved_unknowns', label: 'Unresolved unknowns', value: unresolvedUnknowns, provenance: 'unknown registry' },
      { inputId: 'duplicate_penalty', label: 'Duplicate reporting penalty', value: round(duplicatePenalty), provenance: 'evidence dependency audit' },
    ],
    assumptions: ['Residual candidate-set weight is comparative, not probabilistic.'],
    limitations: ['The residual weight must change when case coverage changes.'],
  };
}

function buildProfiles(state: IdentityAnalysisState, tone: 'baseline' | 'hrm'): IdentityProfileAssessment[] {
  const profileSeeds: Array<IdentityProfileAssessment> = [];
  const localWeight = clamp(0.42 + (state.caseRecord.discovery.locationDescription.includes('Refugio') ? 0.28 : 0.12) + (state.caseRecord.candidateRecords.length === 0 ? 0.08 : 0));
  const regionalWeight = clamp(0.35 + (state.caseRecord.deathContext.approximateDeathInterval ? 0.16 : 0) + (state.normalizedEvidence.length > 0 ? 0.1 : 0));
  const aliasWeight = clamp(0.22 + (state.evidenceDependencyAudits.some((audit) => audit.duplicatedBy.length > 0) ? 0.26 : 0.04));
  const transientWeight = clamp(0.28 + (state.caseRecord.searchProfiles.some((profile) => profile.profileClass === 'transient_or_traveler') ? 0.2 : 0.05));

  profileSeeds.push({
    profileId: 'P_LOCAL_REGION',
    title: 'Local or regional resident',
    category: 'local_or_regional_resident',
    rank: round(localWeight),
    evidenceIds: uniqueSorted(state.normalizedEvidence.map((evidence) => evidence.id).slice(0, 3)),
    contradictingEvidenceIds: [],
    unknownEvidenceIds: state.normalizedUnknowns.filter((item) => item.currentStatus !== 'resolved').map((item) => item.id).slice(0, 3),
    reason: tone === 'baseline'
      ? 'Recovery context and public geography support a regional records-first posture.'
      : 'Mechanism outputs favor a regionally bounded review before broader speculation.',
    testableNextStep: 'Search local and adjacent county records for missing-person and unidentified-remains matches.',
    noveltyStatus: 'derived',
    status: localWeight > 0.4 ? 'supported' : 'weak',
  });

  profileSeeds.push({
    profileId: 'P_REGIONAL_ALIAS',
    title: 'Record under alias or fragmented record',
    category: 'recorded_under_alias',
    rank: round(aliasWeight),
    evidenceIds: state.evidenceDependencyAudits.some((audit) => audit.duplicatedBy.length > 0)
      ? state.evidenceDependencyAudits.flatMap((audit) => [audit.evidenceId, ...audit.duplicatedBy]).slice(0, 4)
      : uniqueSorted(state.normalizedEvidence.map((evidence) => evidence.id)).slice(0, 2),
    contradictingEvidenceIds: [],
    unknownEvidenceIds: state.normalizedUnknowns.slice(0, 2).map((item) => item.id),
    reason: tone === 'baseline'
      ? 'Repeated reporting and incomplete coverage make alias or fragmented records plausible enough to warrant explicit search coverage.'
      : 'The evidence dependency audit leaves room for aliases or fragmented records to hide an otherwise compatible case.',
    testableNextStep: 'Search alternate spellings, aliases, and cross-jurisdiction duplicate records.',
    noveltyStatus: 'derived',
    status: aliasWeight > 0.3 ? 'supported' : 'weak',
  });

  profileSeeds.push({
    profileId: 'P_TRANSIENT',
    title: 'Transient or traveler',
    category: 'transient_or_traveler',
    rank: round(transientWeight),
    evidenceIds: ['E_CASE_FACTS'],
    contradictingEvidenceIds: [],
    unknownEvidenceIds: state.normalizedUnknowns.slice(0, 2).map((item) => item.id),
    reason: 'The current public state does not rule out travel into the recovery area.',
    testableNextStep: 'Expand records coverage to neighboring states and cross-border repositories where authorized.',
    noveltyStatus: 'derived',
    status: transientWeight > 0.35 ? 'supported' : 'weak',
  });

  if (tone === 'hrm') {
    profileSeeds.push({
      profileId: 'P_UNREPORTED',
      title: 'Never formally reported missing',
      category: 'never_formally_reported_missing',
      rank: round(clamp(0.24 + (state.normalizedSearchProfiles.length === 0 ? 0.14 : 0.05) + (state.normalizedCandidateRecords.length === 0 ? 0.08 : 0))),
      evidenceIds: ['E_CASE_FACTS'],
      contradictingEvidenceIds: [],
      unknownEvidenceIds: state.normalizedUnknowns.slice(0, 3).map((item) => item.id),
      reason: 'The current public data do not confirm that the woman was ever reported missing.',
      testableNextStep: 'Search state and national missing-person repositories for unreported or late-reported cases.',
      noveltyStatus: 'derived',
      status: 'weak',
    });
  }

  return profileSeeds.sort((left, right) => right.rank - left.rank);
}

function buildCandidateAssessments(state: IdentityAnalysisState, tone: 'baseline' | 'hrm'): IdentityCandidateAssessment[] {
  const candidates = state.normalizedCandidateRecords;
  if (candidates.length === 0) {
    return [];
  }

  return candidates.map((candidate, index) => {
    const forensicScore = [candidate.forensicComparison.dna, candidate.forensicComparison.dental, candidate.forensicComparison.fingerprint].filter((item) => item !== 'unknown' && item !== 'not_available').length / 3;
    const geographyScore = candidate.geography.travelFeasibility === 'plausible' ? 0.8 : candidate.geography.travelFeasibility === 'uncertain' ? 0.5 : 0.2;
    const timelineScore = candidate.timeline.compatibility === 'strongly_compatible' || candidate.timeline.compatibility === 'compatible' ? 0.75 : candidate.timeline.compatibility === 'uncertain' ? 0.45 : 0.15;
    const completeness = clamp((forensicScore + geographyScore + timelineScore) / 3 + (tone === 'hrm' ? 0.04 : 0));
    const priority = round(clamp(0.2 + completeness * 0.55 + (candidate.supportingEvidenceIds.length > 0 ? 0.12 : 0.04)));

    return {
      candidateId: candidate.id,
      label: candidate.displayName ?? candidate.id,
      comparisonPriority: priority,
      whyRelevant: candidate.supportingEvidenceIds.length > 0
        ? 'The candidate is already linked to the case state and deserves direct comparison before residual-weight assumptions.'
        : 'The candidate remains relevant because it is part of the entered candidate set.',
      whyWeak: candidate.contradictingEvidenceIds.length > 0
        ? 'The entered record already contains contradictions that may exclude or weaken the candidate.'
        : 'The current record is incomplete enough that a candidate can remain relevant without being strong.',
      missingFields: [
        candidate.timeline.disappearanceDate ? '' : 'disappearance date',
        candidate.geography.lastKnownLocation ? '' : 'last known location',
      ].filter(Boolean),
      decisiveTest: candidate.decisiveTests[0] ?? 'Compare the candidate against the highest-value available forensic or records evidence.',
      whatWouldExclude: candidate.contradictingEvidenceIds.length > 0
        ? 'A directly conflicting exclusion result from the missing record would remove the candidate from consideration.'
        : 'A decisive mismatch in age, timeline, geography, or forensic comparison would exclude the candidate.',
      whatWouldStrengthen: candidate.supportingEvidenceIds.length > 0
        ? 'Additional independent evidence or a completed forensic comparison would strengthen relevance.'
        : 'A new matching record, alias link, or compatible forensic comparison would strengthen the candidate.',
      outsideSetEffect: tone === 'hrm'
        ? 'A candidate addition should reduce residual weight only when it is independently supported and not a duplicate.'
        : 'This candidate should lower residual weight if it is an independent, non-duplicate record.',
      supportingEvidenceIds: [...candidate.supportingEvidenceIds],
      contradictingEvidenceIds: [...candidate.contradictingEvidenceIds],
      unknownEvidenceIds: [...candidate.unknownEvidenceIds],
      rank: index + 1,
    };
  }).sort((left, right) => right.comparisonPriority - left.comparisonPriority);
}

function actionBase(action: {
  id: string;
  title: string;
  category: IdentityActionPriority['category'];
  evidenceIds: string[];
  prerequisites: string[];
  dependencies: string[];
  expectedInformationGain: number;
  candidateDiscrimination: number;
  resourceCost: number;
  legalFeasibility: number;
  technicalFeasibility: number;
  noveltyValue: number;
  status: IdentityActionPriority['status'];
  rationale: string;
}): IdentityActionPriority {
  const priority = clamp((action.expectedInformationGain * 0.28) + (action.candidateDiscrimination * 0.2) + (action.legalFeasibility * 0.16) + (action.technicalFeasibility * 0.16) + (action.noveltyValue * 0.12) - (action.resourceCost * 0.08));
  return {
    actionId: action.id,
    title: action.title,
    category: action.category,
    priority: round(priority),
    rationale: action.rationale,
    evidenceIds: [...action.evidenceIds],
    prerequisites: [...action.prerequisites],
    availabilityDependencies: [...action.dependencies],
    expectedInformationGain: round(action.expectedInformationGain),
    candidateDiscrimination: round(action.candidateDiscrimination),
    resourceCost: round(action.resourceCost),
    legalFeasibility: round(action.legalFeasibility),
    technicalFeasibility: round(action.technicalFeasibility),
    noveltyValue: round(action.noveltyValue),
    status: action.status,
  };
}

function buildForensicActions(state: IdentityAnalysisState, tone: 'baseline' | 'hrm'): IdentityActionPriority[] {
  const hasCandidates = state.normalizedCandidateRecords.length > 0;
  const evidenceCount = state.normalizedEvidence.length;
  const unresolvedUnknowns = state.normalizedUnknowns.filter((item) => item.currentStatus !== 'resolved').length;

  const actions: IdentityActionPriority[] = [
    actionBase({
      id: 'A_CONFIRM_BIOLOGICAL_EVIDENCE',
      title: 'Confirm whether biological evidence is available for comparison',
      category: 'forensic',
      evidenceIds: ['E_CASE_FACTS'],
      prerequisites: ['Evidence inventory access'],
      dependencies: ['biological evidence status'],
      expectedInformationGain: clamp(0.78 + (hasCandidates ? 0.08 : 0.04)),
      candidateDiscrimination: clamp(0.62 + (hasCandidates ? 0.12 : 0.02)),
      resourceCost: 0.28,
      legalFeasibility: 0.78,
      technicalFeasibility: 0.64,
      noveltyValue: 0.62,
      status: 'recommended',
      rationale: 'The analysis must know whether DNA, dental, or fingerprint material exists before ranking downstream forensic comparisons.',
    }),
    actionBase({
      id: 'A_DNA_PRIORITY',
      title: 'Evaluate DNA comparison readiness',
      category: 'forensic',
      evidenceIds: ['E_CASE_FACTS', 'E_PROFILE'],
      prerequisites: ['Biological sample availability'],
      dependencies: ['retained specimen', 'comparison sample availability'],
      expectedInformationGain: clamp(0.58 + (hasCandidates ? 0.14 : 0.08) + (state.normalizedCandidateRecords.some((candidate) => candidate.forensicComparison.dna === 'consistent') ? 0.08 : 0)),
      candidateDiscrimination: clamp(0.55 + (state.normalizedCandidateRecords.length > 2 ? 0.18 : 0.05)),
      resourceCost: 0.46,
      legalFeasibility: 0.72,
      technicalFeasibility: 0.7,
      noveltyValue: 0.58,
      status: 'unknown',
      rationale: 'DNA is high-value only if evidence exists and can be lawfully compared against entered candidates or records.',
    }),
    actionBase({
      id: 'A_RECORDS_SEARCH',
      title: 'Expand records searches across adjacent jurisdictions and aliases',
      category: 'records',
      evidenceIds: ['E_CASE_FACTS', 'E_CLOTHING'],
      prerequisites: ['Records-search authorization'],
      dependencies: ['missing-person repositories', 'alias coverage', 'duplicate-record review'],
      expectedInformationGain: clamp(0.66 + (unresolvedUnknowns > 2 ? 0.12 : 0.04)),
      candidateDiscrimination: clamp(0.48 + (hasCandidates ? 0.12 : 0.18)),
      resourceCost: 0.34,
      legalFeasibility: 0.82,
      technicalFeasibility: 0.88,
      noveltyValue: 0.7,
      status: 'recommended',
      rationale: 'Records coverage can change the candidate set and residual weight without inventing new facts.',
    }),
    actionBase({
      id: 'A_PUBLIC_OUTREACH',
      title: 'Issue a guarded public recognition brief focused on clothing and discovery context',
      category: 'outreach',
      evidenceIds: ['E_CLOTHING', 'E_CASE_FACTS'],
      prerequisites: ['Public-information approval'],
      dependencies: ['public approval', 'message review'],
      expectedInformationGain: clamp(0.45 + (evidenceCount > 2 ? 0.08 : 0.04)),
      candidateDiscrimination: 0.36,
      resourceCost: 0.22,
      legalFeasibility: 0.9,
      technicalFeasibility: 0.92,
      noveltyValue: 0.56,
      status: 'recommended',
      rationale: 'Distinctive clothing can generate recognition without implying identity.',
    }),
  ];

  if (tone === 'hrm') {
    actions.push(actionBase({
      id: 'A_INDEPENDENCE_AUDIT',
      title: 'Audit repeated reporting for independent confirmation',
      category: 'review',
      evidenceIds: state.evidenceDependencyAudits.map((audit) => audit.evidenceId),
      prerequisites: ['Source lineage review'],
      dependencies: ['independence groups', 'duplicate record mapping'],
      expectedInformationGain: clamp(0.62 + (state.evidenceDependencyAudits.some((audit) => audit.duplicatedBy.length > 0) ? 0.14 : 0.02)),
      candidateDiscrimination: 0.42,
      resourceCost: 0.18,
      legalFeasibility: 0.96,
      technicalFeasibility: 0.86,
      noveltyValue: 0.74,
      status: 'recommended',
      rationale: 'The HRM pipeline should discount repeated reporting before arbitration.',
    }));

    const independenceAudit = actions.find((action) => action.actionId === 'A_INDEPENDENCE_AUDIT');
    const maxPriority = actions.reduce((max, action) => Math.max(max, action.priority), 0);
    if (independenceAudit) {
      independenceAudit.priority = round(clamp(maxPriority + 0.05));
    }
  }

  return actions.sort((left, right) => right.priority - left.priority);
}

function buildSearchStrategies(state: IdentityAnalysisState, tone: 'baseline' | 'hrm'): IdentityRecordSearchStrategy[] {
  const dateRange = { start: '1988-01-01', end: '1992-12-31' };
  return [
    {
      searchId: 'RS_REFUGIO_ADJACENT',
      repositoryClass: 'county_and_adjacent_county_records',
      status: 'recommended',
      dateRange,
      demographicConstraints: ['female', 'approximate age 20-35', 'approximate height near 5 feet 3 inches'],
      aliasStrategy: 'Search alternate spellings and fragmented records for the same demographic window.',
      heightAgeTolerance: 'Allow broad matching because the biological profile is approximate.',
      geographicalRationale: tone === 'baseline'
        ? 'The recovery site and public geography favor a regional search first.'
        : 'The mechanism audit still supports a regional search before assuming an outside jurisdiction.',
      expectedRecords: 'Low-to-moderate counts with some duplicate risk.',
      duplicateRisk: 'Moderate because county, state, and news reporting may overlap.',
      legalOrAccessRequirements: ['Public repository access or authorized investigator access'],
      outcomeWouldChangeModel: 'Any compatible record would reduce residual weight and may change the leading profile.',
      evidenceIds: ['E_CASE_FACTS', 'E_PROFILE'],
    },
    {
      searchId: 'RS_ALIAS_NAMUS',
      repositoryClass: 'state_and_national_missing_person_repositories',
      status: 'recommended',
      dateRange,
      demographicConstraints: ['approximate age and height match', 'broad ancestry compatibility'],
      aliasStrategy: 'Search under aliases, maiden names, and likely misspellings.',
      heightAgeTolerance: 'Use wide tolerance because the public profile is approximate.',
      geographicalRationale: 'A missing person may have been reported outside the recovery jurisdiction or under another name.',
      expectedRecords: 'Moderate count with higher duplicate and fragmentation risk.',
      duplicateRisk: 'High because national repositories often contain duplicate and partial entries.',
      legalOrAccessRequirements: ['Authorized access for restricted repositories if needed'],
      outcomeWouldChangeModel: 'A compatible alias or duplicate record would create a new candidate path.',
      evidenceIds: ['E_CASE_FACTS'],
    },
  ];
}

function buildOutreachPriorities(state: IdentityAnalysisState, tone: 'baseline' | 'hrm'): IdentityPublicOutreachPriority[] {
  const clothingDistinctiveness = state.caseRecord.clothingItems.length >= 4 ? 0.74 : 0.48;
  return [
    {
      outreachId: 'PO_CLOTHING_BRIEF',
      title: 'Guarded public recognition brief',
      targetAudience: 'Regional residents, family networks, and local record holders',
      messageFocus: 'Distinctive clothing, recovery context, and date window',
      whyItMayHelp: 'The clothing combination may trigger recognition without naming a candidate.',
      risks: ['Avoid implying identity or revealing restricted evidence'],
      officialChannelRequired: 'Agency-approved public information channel',
      measurement: 'Track credible tips, source quality, and any new records produced.',
      status: 'recommended',
      evidenceIds: ['E_CLOTHING', 'E_CASE_FACTS'],
      priority: round(clamp(0.35 + clothingDistinctiveness * 0.45 + (tone === 'hrm' ? 0.04 : 0))),
    },
  ];
}

function buildBoundedQuestions(state: IdentityAnalysisState): IdentityBoundedReconstructionQuestion[] {
  return [
    {
      questionId: 'Q_DEATH_WINDOW',
      prompt: 'Does the recovery context support an on-site death or an unknown transport scenario?',
      identityRelevance: 'A transport or local-familiarity inference changes where the records search should focus.',
      evidenceIds: ['E_CASE_FACTS'],
      unknowns: ['scene documentation', 'forensic recovery details'],
      test: 'Compare scene documentation and anthropological notes with the recovery context.',
      currentAnswerability: 'currently_unanswerable',
      whatWouldWeakenIt: 'Direct scene evidence showing a clearly different recovery or deposition context.',
    },
    {
      questionId: 'Q_CLOTHING_ORIGIN',
      prompt: 'Does the clothing suggest a regional retail or time-bound style that narrows geography?',
      identityRelevance: 'Clothing provenance can narrow search geography or time window.',
      evidenceIds: ['E_CLOTHING'],
      unknowns: ['manufacturer', 'label', 'purchase location'],
      test: 'Identify manufacturer, label, or photographic documentation for the listed clothing items.',
      currentAnswerability: 'currently_unanswerable',
      whatWouldWeakenIt: 'Evidence that the clothing is generic or not tied to a narrower region.',
    },
  ];
}

function buildContradictions(state: IdentityAnalysisState): ContradictionFinding[] {
  const contradictions: ContradictionFinding[] = [];

  for (const candidate of state.normalizedCandidateRecords) {
    if (candidate.timeline.conflicts.length > 0) {
      contradictions.push({
        id: `C_${candidate.id}_TIMELINE`,
        title: `${candidate.displayName ?? candidate.id} timeline conflict`,
        category: 'date_conflict',
        explanation: candidate.timeline.conflicts[0],
        severity: 'moderate',
        evidenceIds: [candidate.id],
        contradictingEvidenceIds: candidate.contradictingEvidenceIds,
        assumptions: ['The entered timeline is accurate enough to compare.'],
      });
    }
    if (candidate.geography.locationQuality === 'unknown' && candidate.timeline.dateQuality === 'unknown') {
      contradictions.push({
        id: `C_${candidate.id}_MISSING_DATA`,
        title: `${candidate.displayName ?? candidate.id} has too little data for a decisive comparison`,
        category: 'coverage_conflict',
        explanation: 'The record cannot yet support a decisive comparison because the missing fields are too large.',
        severity: 'low',
        evidenceIds: [candidate.id],
        contradictingEvidenceIds: [],
        assumptions: ['The candidate record remains incomplete.'],
      });
    }
  }

  if (state.evidenceDependencyAudits.some((audit) => audit.duplicatedBy.length > 0)) {
    contradictions.push({
      id: 'C_DUPLICATE_REPORTING',
      title: 'Repeated reporting may be mistaken for independent confirmation',
      category: 'source_conflict',
      explanation: 'Multiple pieces of public reporting trace back to the same independence group and should not be double counted.',
      severity: 'moderate',
      evidenceIds: state.evidenceDependencyAudits.map((audit) => audit.evidenceId),
      contradictingEvidenceIds: state.evidenceDependencyAudits.flatMap((audit) => audit.duplicatedBy),
      assumptions: ['Independence groups were normalized correctly.'],
    });
  }

  return contradictions;
}

function buildNovelHypotheses(state: IdentityAnalysisState, tone: 'baseline' | 'hrm'): AnalyticalHypothesis[] {
  const hypotheses: AnalyticalHypothesis[] = [];

  if (state.caseRecord.clothingItems.length > 0) {
    hypotheses.push({
      id: 'H_CLOTHING_OUTREACH',
      category: 'public_outreach',
      statement: 'A guarded public brief centered on the clothing combination may produce a better recognition signal than a broad identity message.',
      generatedBy: tone === 'baseline' ? 'twin_a' : 'twin_b_mechanism',
      noveltyStatus: 'new_testable_hypothesis',
      supportingEvidenceIds: ['E_CLOTHING', 'E_CASE_FACTS'],
      contradictingEvidenceIds: [],
      unknownEvidenceIds: ['U_PUBLIC_RECOGNITION'],
      requiredAssumptions: ['Public recognition can occur without an identity claim.'],
      tests: [
        {
          action: 'Release a guarded public recognition brief through an official channel.',
          possiblePositiveInterpretation: 'Credible tips or records may surface from people who recognize the clothing or context.',
          possibleNegativeInterpretation: 'No useful tips are produced, so outreach priority should drop.',
        },
      ],
      fragility: 'moderate',
      status: 'viable',
    });
  }

  if (state.normalizedCandidateRecords.length > 0) {
    hypotheses.push({
      id: 'H_CANDIDATE_FILTER',
      category: 'alias_or_duplicate',
      statement: 'The most productive candidate work may be alias and duplicate filtering before additional broad candidate expansion.',
      generatedBy: tone === 'baseline' ? 'twin_a' : 'twin_b_mechanism',
      noveltyStatus: 'derived_combination',
      supportingEvidenceIds: state.normalizedCandidateRecords.flatMap((candidate) => candidate.supportingEvidenceIds).slice(0, 4),
      contradictingEvidenceIds: state.normalizedCandidateRecords.flatMap((candidate) => candidate.contradictingEvidenceIds).slice(0, 4),
      unknownEvidenceIds: state.normalizedCandidateRecords.flatMap((candidate) => candidate.unknownEvidenceIds).slice(0, 4),
      requiredAssumptions: ['A duplicate or alias path is still plausible in the entered candidate set.'],
      tests: [
        {
          action: 'Search alternate spellings and duplicate-record chains for the entered candidates.',
          possiblePositiveInterpretation: 'One candidate may split into multiple linked records or the same person may appear under another name.',
          possibleNegativeInterpretation: 'No alias or duplicate chain exists, so the candidate set can be simplified.',
        },
      ],
      fragility: 'moderate',
      status: 'viable',
    });
  }

  if (tone === 'hrm' && state.normalizedUnknowns.some((unknown) => unknown.currentStatus !== 'resolved')) {
    hypotheses.push({
      id: 'H_HRM_BIO_EVIDENCE',
      category: 'forensic_action',
      statement: 'Confirming biological evidence availability is a higher-value step than immediately ranking a specific forensic comparison.',
      generatedBy: 'twin_b_mechanism',
      noveltyStatus: 'new_testable_hypothesis',
      supportingEvidenceIds: ['E_CASE_FACTS'],
      contradictingEvidenceIds: [],
      unknownEvidenceIds: state.normalizedUnknowns.filter((item) => item.currentStatus !== 'resolved').map((item) => item.id).slice(0, 4),
      requiredAssumptions: ['The evidence inventory is not yet fully established.'],
      tests: [
        {
          action: 'Inventory the available biological, dental, and fingerprint materials.',
          possiblePositiveInterpretation: 'One or more comparison routes becomes actionable and should move up in rank.',
          possibleNegativeInterpretation: 'No usable materials exist, so records work and outreach become more important.',
        },
      ],
      fragility: 'low',
      status: 'viable',
    });
  }

  return hypotheses;
}

function buildRecommendedAction(state: IdentityAnalysisState, actions: IdentityActionPriority[], findings: AnalyticalHypothesis[]): IdentityRecommendedAction {
  const topAction = actions[0];
  const topFinding = findings[0];
  return {
    action: topAction?.title ?? 'Review current case evidence and enter missing source coverage.',
    reason: topAction
      ? topAction.rationale
      : 'The current state lacks enough coverage to justify a stronger recommendation.',
    expectedInformationGain: topAction?.expectedInformationGain ?? clamp(scoreFromEvidence(state)),
    prerequisites: topAction?.prerequisites ?? ['Case evidence review'],
    authorizationRequired: topAction ? [topAction.status === 'recommended' ? 'Authorized investigator' : 'Agency review'] : ['Authorized investigator'],
    limitations: [
      topFinding ? `Related finding: ${topFinding.statement}` : 'No new testable finding was produced from the current public-data state.',
    ],
    actionId: topAction?.actionId,
    evidenceIds: topAction?.evidenceIds,
  };
}

function compareStringLists(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) {
    return 1;
  }
  const union = new Set([...left, ...right]);
  const intersection = left.filter((value) => right.includes(value));
  return clamp(intersection.length / union.size);
}

function toMechanismProposal(input: Partial<IdentityMechanismProposal> & { mechanismId: string }): IdentityMechanismProposal {
  return mechanismProposalSchema.parse({
    mechanismId: input.mechanismId,
    profileContributions: input.profileContributions ?? [],
    candidateContributions: input.candidateContributions ?? [],
    actionContributions: input.actionContributions ?? [],
    generatedHypotheses: input.generatedHypotheses ?? [],
    contradictions: input.contradictions ?? [],
    informationGaps: input.informationGaps ?? [],
    warnings: input.warnings ?? [],
  }) as IdentityMechanismProposal;
}

function createMechanism(definition: IdentityMechanism): IdentityMechanism {
  return definition;
}

export const AnthropologicalCompatibilityMechanism = createMechanism({
  id: 'anthropological_compatibility',
  name: 'AnthropologicalCompatibilityMechanism',
  reads: ['biologicalProfile', 'candidateRecords'],
  writes: ['candidateContributions', 'profileContributions'],
  propose(snapshot) {
    const profileContributions = snapshot.normalizedSearchProfiles.length > 0
      ? snapshot.normalizedSearchProfiles.slice(0, 1).map((profile) => ({
          profileId: profile.profileId,
          contribution: 0.12,
          evidenceIds: ['E_PROFILE'],
          contradictingEvidenceIds: [],
          unknownEvidenceIds: snapshot.normalizedUnknowns.slice(0, 1).map((unknown) => unknown.id),
          assumptions: ['Anthropological comparison remains incomplete.'],
          explanation: 'The biological profile supports a compatibility review but not identification.',
        }))
      : [];

    const candidateContributions = snapshot.normalizedCandidateRecords.map((candidate) => ({
      candidateId: candidate.id,
      contribution: candidate.demographics.sexCompatibility === 'compatible' ? 0.18 : 0.04,
      evidenceIds: [candidate.id],
      contradictingEvidenceIds: candidate.contradictingEvidenceIds,
      unknownEvidenceIds: candidate.unknownEvidenceIds,
      decisiveTests: ['Compare anthropological compatibility against the entered biological profile.'],
      explanation: 'Anthropological compatibility can narrow the candidate set but does not establish identity.',
    }));

    return toMechanismProposal({ mechanismId: 'anthropological_compatibility', profileContributions, candidateContributions, actionContributions: [], generatedHypotheses: [], contradictions: [], informationGaps: [], warnings: [] });
  },
});

export const DeathWindowCompatibilityMechanism = createMechanism({
  id: 'death_window_compatibility',
  name: 'DeathWindowCompatibilityMechanism',
  reads: ['deathContext', 'candidateRecords'],
  writes: ['candidateContributions', 'informationGaps'],
  propose(snapshot) {
    const candidateContributions = snapshot.normalizedCandidateRecords.map((candidate) => ({
      candidateId: candidate.id,
      contribution: candidate.timeline.dateQuality === 'exact' ? 0.22 : candidate.timeline.dateQuality === 'approximate' ? 0.15 : 0.06,
      evidenceIds: [candidate.id],
      contradictingEvidenceIds: candidate.contradictingEvidenceIds,
      unknownEvidenceIds: candidate.unknownEvidenceIds,
      decisiveTests: ['Compare the disappearance window against the recovery and death interval.'],
      explanation: 'Compatibility depends on whether the timeline is actually comparable.',
    }));
    return toMechanismProposal({ mechanismId: 'death_window_compatibility', candidateContributions, profileContributions: [], actionContributions: [], generatedHypotheses: [], contradictions: [], informationGaps: snapshot.normalizedCandidateRecords.length === 0 ? [{ id: 'G_DEATH_WINDOW', title: 'Candidate disappearance window', generatedBy: 'twin_b', reason: 'No entered candidate has a usable disappearance window.', blockedConclusions: ['Candidate exclusion by timeline'], actionToResolve: 'Search or enter disappearance dates for any entered candidate records.', expectedInformationGain: 0.54, evidenceIds: ['E_CASE_FACTS'], noveltyStatus: 'derived' }] : [], warnings: [] });
  },
});

export const GeographicScopeMechanism = createMechanism({
  id: 'geographic_scope',
  name: 'GeographicScopeMechanism',
  reads: ['discovery', 'jurisdiction', 'searchProfiles'],
  writes: ['profileContributions', 'actionContributions'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'geographic_scope',
      profileContributions: [
        {
          profileId: 'P_LOCAL_REGION',
          contribution: 0.2,
          evidenceIds: ['E_CASE_FACTS'],
          contradictingEvidenceIds: [],
          unknownEvidenceIds: snapshot.normalizedUnknowns.slice(0, 2).map((unknown) => unknown.id),
          assumptions: ['The recovery site is geographically meaningful.'],
          explanation: 'The recovery site and jurisdiction support a local-first records search.',
        },
      ],
      candidateContributions: [],
      actionContributions: [
        {
          actionId: 'A_RECORDS_SEARCH',
          contribution: 0.18,
          evidenceIds: ['E_CASE_FACTS'],
          prerequisites: ['Regional records access'],
          availabilityDependencies: ['county repositories', 'adjacent counties'],
          explanation: 'Regional scope should raise records search priority.',
        },
      ],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [],
      warnings: [],
    });
  },
});

export const RecordCoverageMechanism = createMechanism({
  id: 'record_coverage',
  name: 'RecordCoverageMechanism',
  reads: ['coverageMetrics', 'recordSearchCoverage'],
  writes: ['informationGaps', 'profileContributions'],
  propose(snapshot) {
    const missingCoverage = snapshot.coverageMetrics?.recordCoverageStatus === 'unknown' || snapshot.coverageMetrics?.recordCoverageStatus === 'minimal';
    return toMechanismProposal({
      mechanismId: 'record_coverage',
      profileContributions: [
        {
          profileId: 'P_UNREPORTED',
          contribution: missingCoverage ? 0.18 : 0.06,
          evidenceIds: ['E_CASE_FACTS'],
          contradictingEvidenceIds: [],
          unknownEvidenceIds: snapshot.normalizedUnknowns.map((unknown) => unknown.id).slice(0, 3),
          assumptions: ['Coverage is incomplete or uneven.'],
          explanation: 'Incomplete coverage raises the value of alias, duplicate, and outside-jurisdiction profiles.',
        },
      ],
      candidateContributions: [],
      actionContributions: [],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [
        {
          id: 'G_RECORD_COVERAGE',
          title: 'Record coverage completeness',
          generatedBy: 'twin_b',
          reason: 'The model should know which repositories and jurisdictions were actually searched.',
          blockedConclusions: ['Residual candidate-set shrinkage', 'Alias-search completeness'],
          actionToResolve: 'Enter or run a repository-by-repository search coverage audit.',
          expectedInformationGain: 0.63,
          evidenceIds: ['E_CASE_FACTS'],
          noveltyStatus: 'newly_identified',
        },
      ],
      warnings: [],
    });
  },
});

export const CandidateCompletenessMechanism = createMechanism({
  id: 'candidate_completeness',
  name: 'CandidateCompletenessMechanism',
  reads: ['candidateRecords'],
  writes: ['candidateContributions', 'informationGaps'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'candidate_completeness',
      profileContributions: [],
      candidateContributions: snapshot.normalizedCandidateRecords.map((candidate) => ({
        candidateId: candidate.id,
        contribution: 0.12 + (candidate.supportingEvidenceIds.length > 0 ? 0.08 : 0),
        evidenceIds: [candidate.id],
        contradictingEvidenceIds: candidate.contradictingEvidenceIds,
        unknownEvidenceIds: candidate.unknownEvidenceIds,
        decisiveTests: ['Enter missing fields before ranking against the remaining candidate set.'],
        explanation: 'A candidate with missing timeline or geography fields should be handled cautiously.',
      })),
      actionContributions: [],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: snapshot.normalizedCandidateRecords.length > 0 ? [] : [
        {
          id: 'G_CANDIDATE_SET',
          title: 'Entered candidate set completeness',
          generatedBy: 'twin_b',
          reason: 'The current state contains no entered candidates, so residual weight remains high until records are added.',
          blockedConclusions: ['Candidate comparison', 'Candidate exclusion'],
          actionToResolve: 'Enter one or more candidate records or perform broad records searches.',
          expectedInformationGain: 0.7,
          evidenceIds: ['E_CASE_FACTS'],
          noveltyStatus: 'newly_identified',
        },
      ],
      warnings: [],
    });
  },
});

export const DuplicateRecordMechanism = createMechanism({
  id: 'duplicate_record',
  name: 'DuplicateRecordMechanism',
  reads: ['evidenceDependencyAudits', 'candidateRecords'],
  writes: ['contradictions', 'informationGaps'],
  propose(snapshot) {
    const duplicates = snapshot.evidenceDependencyAudits.filter((audit) => audit.duplicatedBy.length > 0);
    return toMechanismProposal({
      mechanismId: 'duplicate_record',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [],
      generatedHypotheses: duplicates.length > 0 ? [
        {
          id: 'H_DUPLICATE_RECORDS',
          category: 'alias_or_duplicate',
          statement: 'Repeated reporting should be deduplicated before it is allowed to raise confidence or rank.',
          generatedBy: 'twin_b_mechanism',
          noveltyStatus: 'derived_combination',
          supportingEvidenceIds: duplicates.map((audit) => audit.evidenceId),
          contradictingEvidenceIds: duplicates.flatMap((audit) => audit.duplicatedBy),
          unknownEvidenceIds: [],
          requiredAssumptions: ['Evidence lineage is represented consistently.'],
          tests: [{ action: 'Link repeated reports to a single independence group.', possiblePositiveInterpretation: 'The case contains duplicate reporting, so confidence should be reduced.', possibleNegativeInterpretation: 'The sources are independent and should be counted separately.' }],
          fragility: 'moderate',
          status: 'viable',
        },
      ] : [],
      contradictions: duplicates.map((audit) => ({
        id: `DUP_${audit.evidenceId}`,
        title: 'Duplicate reporting detected',
        category: 'source_conflict',
        explanation: audit.explanation,
        severity: 'moderate',
        evidenceIds: [audit.evidenceId],
        contradictingEvidenceIds: audit.duplicatedBy,
        assumptions: ['The duplicate grouping is accurate.'],
      })),
      informationGaps: [],
      warnings: duplicates.length > 0 ? ['Repeated reporting must not be counted as independent confirmation.'] : [],
    });
  },
});

export const AliasRecordMechanism = createMechanism({
  id: 'alias_record',
  name: 'AliasRecordMechanism',
  reads: ['candidateRecords', 'evidenceDependencyAudits'],
  writes: ['profileContributions', 'informationGaps'],
  propose(snapshot) {
    const contribution = snapshot.normalizedCandidateRecords.length > 0 ? 0.14 : 0.18;
    return toMechanismProposal({
      mechanismId: 'alias_record',
      profileContributions: [
        {
          profileId: 'P_REGIONAL_ALIAS',
          contribution,
          evidenceIds: ['E_CASE_FACTS'],
          contradictingEvidenceIds: [],
          unknownEvidenceIds: snapshot.normalizedUnknowns.slice(0, 2).map((unknown) => unknown.id),
          assumptions: ['An alias could explain a missing or fragmented record.'],
          explanation: 'Alias searches are worthwhile when the entered state does not yet exhaust the candidate universe.',
        },
      ],
      candidateContributions: [],
      actionContributions: [],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [
        {
          id: 'G_ALIAS_COVERAGE',
          title: 'Alias and alternate-spelling coverage',
          generatedBy: 'twin_b',
          reason: 'The model should know whether alias coverage has been searched or entered.',
          blockedConclusions: ['Duplicate-record completeness'],
          actionToResolve: 'Search alternate spellings, aliases, and prior names across entered repositories.',
          expectedInformationGain: 0.58,
          evidenceIds: ['E_CASE_FACTS'],
          noveltyStatus: 'derived',
        },
      ],
      warnings: [],
    });
  },
});

export const ClothingContextMechanism = createMechanism({
  id: 'clothing_context',
  name: 'ClothingContextMechanism',
  reads: ['clothingItems'],
  writes: ['profileContributions', 'generatedHypotheses'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'clothing_context',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [
        {
          actionId: 'A_PUBLIC_OUTREACH',
          contribution: 0.12,
          evidenceIds: ['E_CLOTHING'],
          prerequisites: ['Guarded wording'],
          availabilityDependencies: ['public review'],
          explanation: 'Distinctive clothing should influence outreach priority.',
        },
      ],
      generatedHypotheses: snapshot.caseRecord.clothingItems.length > 0 ? [
        {
          id: 'H_CLOTHING_CONTEXT',
          category: 'clothing_context',
          statement: 'The clothing combination is distinctive enough to justify a narrow recognition-oriented outreach message.',
          generatedBy: 'twin_b_mechanism',
          noveltyStatus: 'derived_combination',
          supportingEvidenceIds: ['E_CLOTHING'],
          contradictingEvidenceIds: [],
          unknownEvidenceIds: ['U_PUBLIC_RECOGNITION'],
          requiredAssumptions: ['The clothing list accurately reflects what was recovered.'],
          tests: [{ action: 'Publish a guarded recognition brief to authorized public channels.', possiblePositiveInterpretation: 'The clothing combination generates credible tips.', possibleNegativeInterpretation: 'No useful recognition signal appears.' }],
          fragility: 'moderate',
          status: 'viable',
        },
      ] : [],
      contradictions: [],
      informationGaps: [],
      warnings: [],
    });
  },
});

export const ForensicAvailabilityMechanism = createMechanism({
  id: 'forensic_availability',
  name: 'ForensicAvailabilityMechanism',
  reads: ['forensicActions', 'unknowns'],
  writes: ['actionContributions', 'informationGaps'],
  propose(snapshot) {
    const actions = snapshot.normalizedActions;
    const availabilityUnknown = actions.some((action) => action.availability === 'unknown');
    return toMechanismProposal({
      mechanismId: 'forensic_availability',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: actions.map((action) => ({
        actionId: action.id,
        contribution: action.availability === 'unknown' ? 0.15 : 0.08,
        evidenceIds: action.supportingEvidenceIds ?? ['E_CASE_FACTS'],
        prerequisites: action.prerequisites ?? [],
        availabilityDependencies: action.uncertainty ?? [],
        explanation: 'Availability should drive priority rather than generic forensic power.',
      })),
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: availabilityUnknown ? [
        {
          id: 'G_FORENSIC_AVAILABILITY',
          title: 'Forensic availability inventory',
          generatedBy: 'twin_b',
          reason: 'Action ranking is blocked until the model knows which forensic routes are available.',
          blockedConclusions: ['DNA priority', 'dental priority', 'fingerprint priority'],
          actionToResolve: 'Enter availability status for DNA, dental, fingerprint, and anthropological comparisons.',
          expectedInformationGain: 0.77,
          evidenceIds: ['E_CASE_FACTS'],
          noveltyStatus: 'newly_identified',
        },
      ] : [],
      warnings: [],
    });
  },
});

function buildInformationGainAction(actionId: string, title: string, evidenceIds: string[], candidateCount: number, availability: number, discrimination: number, cost: number, novelty: number, legal: number, technical: number, rationale: string): IdentityMechanismProposal['actionContributions'][number] {
  return {
    actionId,
    contribution: clamp(availability * 0.35 + discrimination * 0.3 + (candidateCount > 0 ? 0.15 : 0.07)),
    evidenceIds,
    prerequisites: ['Comparison sample or inventory information'],
    availabilityDependencies: ['evidence availability', 'candidate set size'],
    explanation: rationale,
  };
}

export const DNAInformationGainMechanism = createMechanism({
  id: 'dna_information_gain',
  name: 'DNAInformationGainMechanism',
  reads: ['candidateRecords', 'forensicActions'],
  writes: ['actionContributions'],
  propose(snapshot) {
    const candidateCount = snapshot.normalizedCandidateRecords.length;
    return toMechanismProposal({
      mechanismId: 'dna_information_gain',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [buildInformationGainAction('A_DNA_PRIORITY', 'Evaluate DNA comparison readiness', ['E_CASE_FACTS'], candidateCount, 0.82, candidateCount > 0 ? 0.74 : 0.5, 0.46, 0.6, 0.78, 0.72, 'DNA becomes high priority when there is a path to comparison and the candidate set can be meaningfully reduced.')],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [],
      warnings: [],
    });
  },
});

export const DentalInformationGainMechanism = createMechanism({
  id: 'dental_information_gain',
  name: 'DentalInformationGainMechanism',
  reads: ['candidateRecords', 'forensicActions'],
  writes: ['actionContributions'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'dental_information_gain',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [buildInformationGainAction('A_DENTAL_PRIORITY', 'Review dental-chart comparison readiness', ['E_CASE_FACTS'], snapshot.normalizedCandidateRecords.length, 0.7, 0.68, 0.38, 0.54, 0.8, 0.76, 'Dental comparison is strong only if usable dental records are actually available.')],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [],
      warnings: [],
    });
  },
});

export const FingerprintInformationGainMechanism = createMechanism({
  id: 'fingerprint_information_gain',
  name: 'FingerprintInformationGainMechanism',
  reads: ['candidateRecords', 'forensicActions'],
  writes: ['actionContributions'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'fingerprint_information_gain',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [buildInformationGainAction('A_FINGERPRINT_PRIORITY', 'Check fingerprint comparison readiness', ['E_CASE_FACTS'], snapshot.normalizedCandidateRecords.length, 0.66, 0.62, 0.31, 0.5, 0.84, 0.8, 'Fingerprint value depends on print availability and database eligibility.')],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [],
      warnings: [],
    });
  },
});

export const IsotopeInformationGainMechanism = createMechanism({
  id: 'isotope_information_gain',
  name: 'IsotopeInformationGainMechanism',
  reads: ['geography', 'clothingItems', 'unknowns'],
  writes: ['informationGaps', 'actionContributions'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'isotope_information_gain',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [{
        actionId: 'A_ISOTOPE_REVIEW',
        contribution: 0.12,
        evidenceIds: ['E_CASE_FACTS'],
        prerequisites: ['Sample availability'],
        availabilityDependencies: ['isotope evidence availability'],
        explanation: 'Isotope analysis matters if geography or travel origin is still unresolved.',
      }],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [
        {
          id: 'G_ISOTOPE',
          title: 'Isotope analysis availability',
          generatedBy: 'twin_b',
          reason: 'Geographic origin may be partly testable through isotope analysis if samples exist.',
          blockedConclusions: ['Geographic origin narrowing'],
          actionToResolve: 'Check whether isotope analysis is available for any retained biological material.',
          expectedInformationGain: 0.57,
          evidenceIds: ['E_CASE_FACTS'],
          noveltyStatus: 'derived',
        },
      ],
      warnings: [],
    });
  },
});

export const HistoricalRecordsMechanism = createMechanism({
  id: 'historical_records',
  name: 'HistoricalRecordsMechanism',
  reads: ['recordSearchCoverage', 'candidateRecords'],
  writes: ['informationGaps', 'profileContributions'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'historical_records',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [{
        actionId: 'A_HISTORICAL_RECORDS',
        contribution: 0.18,
        evidenceIds: ['E_CASE_FACTS'],
        prerequisites: ['Repository access'],
        availabilityDependencies: ['historical records', 'cross-jurisdiction coverage'],
        explanation: 'Historical records can reveal a missing report, alias, or duplicate path.',
      }],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [
        {
          id: 'G_HISTORICAL_RECORDS',
          title: 'Historical record completeness',
          generatedBy: 'twin_b',
          reason: 'The model should know whether the historical record search has already been attempted.',
          blockedConclusions: ['Residual outside-set weight', 'Alias search completeness'],
          actionToResolve: 'Enter the repository coverage state for historical and statewide records.',
          expectedInformationGain: 0.61,
          evidenceIds: ['E_CASE_FACTS'],
          noveltyStatus: 'derived',
        },
      ],
      warnings: [],
    });
  },
});

export const PublicOutreachMechanism = createMechanism({
  id: 'public_outreach',
  name: 'PublicOutreachMechanism',
  reads: ['clothingItems', 'provenance'],
  writes: ['actionContributions', 'generatedHypotheses'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'public_outreach',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [{
        actionId: 'A_PUBLIC_OUTREACH',
        contribution: 0.16,
        evidenceIds: ['E_CLOTHING', 'E_CASE_FACTS'],
        prerequisites: ['Official review'],
        availabilityDependencies: ['public channel', 'message review'],
        explanation: 'A guarded brief can convert distinctive clothing into a testable public-memory search.',
      }],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [],
      warnings: [],
    });
  },
});

export const EvidenceReliabilityMechanism = createMechanism({
  id: 'evidence_reliability',
  name: 'EvidenceReliabilityMechanism',
  reads: ['provenance', 'evidence'],
  writes: ['profileContributions', 'warnings'],
  propose(snapshot) {
    const reliability = snapshot.normalizedProvenance.some((provenance) => provenance.reliability === 'high') ? 0.18 : 0.08;
    return toMechanismProposal({
      mechanismId: 'evidence_reliability',
      profileContributions: [
        {
          profileId: 'P_LOCAL_REGION',
          contribution: reliability,
          evidenceIds: snapshot.normalizedEvidence.map((evidence) => evidence.id).slice(0, 2),
          contradictingEvidenceIds: [],
          unknownEvidenceIds: [],
          assumptions: ['Primary facts are stable enough to use as anchors.'],
          explanation: 'Higher-reliability evidence should support profile ranking more strongly.',
        },
      ],
      candidateContributions: [],
      actionContributions: [],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [],
      warnings: snapshot.normalizedProvenance.length > 0 ? [] : ['No provenance entries were supplied.'],
    });
  },
});

export const EvidenceIndependenceMechanism = createMechanism({
  id: 'evidence_independence',
  name: 'EvidenceIndependenceMechanism',
  reads: ['evidenceDependencyAudits'],
  writes: ['warnings', 'profileContributions'],
  propose(snapshot) {
    const duplicateCount = snapshot.evidenceDependencyAudits.filter((audit) => audit.duplicatedBy.length > 0).length;
    return toMechanismProposal({
      mechanismId: 'evidence_independence',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [],
      warnings: duplicateCount > 0 ? ['Repeated reporting does not create independent confirmation.'] : [],
    });
  },
});

export const ContradictionMechanism = createMechanism({
  id: 'contradiction',
  name: 'ContradictionMechanism',
  reads: ['candidateRecords', 'evidence', 'coverageMetrics'],
  writes: ['contradictions'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'contradiction',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [],
      generatedHypotheses: [],
      contradictions: buildContradictions(snapshot),
      informationGaps: [],
      warnings: [],
    });
  },
});

export const AssumptionDependencyMechanism = createMechanism({
  id: 'assumption_dependency',
  name: 'AssumptionDependencyMechanism',
  reads: ['unknowns', 'candidateRecords'],
  writes: ['informationGaps', 'warnings'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'assumption_dependency',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: snapshot.normalizedUnknowns.map((unknown) => ({
        id: `G_${unknown.id}`,
        title: unknown.title,
        generatedBy: 'twin_b',
        reason: unknown.whyItMatters,
        blockedConclusions: unknown.blocksConclusions,
        actionToResolve: unknown.actionToResolve,
        expectedInformationGain: unknown.expectedInformationGain === 'very_high' ? 0.9 : unknown.expectedInformationGain === 'high' ? 0.75 : unknown.expectedInformationGain === 'moderate' ? 0.55 : 0.35,
        evidenceIds: unknown.evidenceIds,
        noveltyStatus: 'derived',
      })),
      warnings: snapshot.normalizedUnknowns.some((unknown) => unknown.currentStatus !== 'resolved') ? ['Several key conclusions are gated by unresolved unknowns.'] : [],
    });
  },
});

export const ResidualCandidateSetMechanism = createMechanism({
  id: 'residual_candidate_set',
  name: 'ResidualCandidateSetMechanism',
  reads: ['candidateRecords', 'coverageMetrics', 'recordSearchCoverage', 'unknowns'],
  writes: ['actionContributions', 'informationGaps'],
  propose(snapshot) {
    const residual = buildResidualAssessment(snapshot);
    return toMechanismProposal({
      mechanismId: 'residual_candidate_set',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [
        {
          actionId: 'A_RECORDS_SEARCH',
          contribution: residual.residualWeight * 0.18,
          evidenceIds: ['E_CASE_FACTS'],
          prerequisites: ['Repository review'],
          availabilityDependencies: ['search coverage'],
          explanation: 'Residual weight should feed search rather than be treated as a probability.',
        },
      ],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: snapshot.normalizedCandidateRecords.length === 0 ? [{
        id: 'G_RESIDUAL_SET',
        title: 'Residual candidate set coverage',
        generatedBy: 'twin_b',
        reason: 'The model should know why the residual set remains large.',
        blockedConclusions: ['Residual shrinkage', 'Candidate-set completeness'],
        actionToResolve: 'Add candidate records or expand search coverage.',
        expectedInformationGain: residual.residualWeight,
        evidenceIds: ['E_CASE_FACTS'],
        noveltyStatus: 'derived',
      }] : [],
      warnings: [],
    });
  },
});

export const NovelLeadMechanism = createMechanism({
  id: 'novel_lead',
  name: 'NovelLeadMechanism',
  reads: ['evidence', 'candidateRecords', 'searchProfiles'],
  writes: ['generatedHypotheses'],
  propose(snapshot) {
    const hypotheses = buildNovelHypotheses(snapshot, 'hrm');
    return toMechanismProposal({
      mechanismId: 'novel_lead',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [],
      generatedHypotheses: hypotheses,
      contradictions: [],
      informationGaps: [],
      warnings: [],
    });
  },
});

export const HumanReviewGateMechanism = createMechanism({
  id: 'human_review_gate',
  name: 'HumanReviewGateMechanism',
  reads: ['caseRecord', 'evidenceDependencyAudits', 'candidateRecords'],
  writes: ['warnings', 'actionContributions'],
  propose(snapshot) {
    return toMechanismProposal({
      mechanismId: 'human_review_gate',
      profileContributions: [],
      candidateContributions: [],
      actionContributions: [
        {
          actionId: 'A_HUMAN_REVIEW',
          contribution: 0.16,
          evidenceIds: ['E_CASE_FACTS'],
          prerequisites: ['Analyst review'],
          availabilityDependencies: ['case review'],
          explanation: 'A human review gate remains necessary because the case is unresolved and evidence may be incomplete.',
        },
      ],
      generatedHypotheses: [],
      contradictions: [],
      informationGaps: [],
      warnings: ['Human review is still required before any identity claim can be entertained.'],
    });
  },
});

const baselineMechanisms: IdentityMechanism[] = [
  AnthropologicalCompatibilityMechanism,
  DeathWindowCompatibilityMechanism,
  GeographicScopeMechanism,
  RecordCoverageMechanism,
  CandidateCompletenessMechanism,
  DuplicateRecordMechanism,
  AliasRecordMechanism,
  ClothingContextMechanism,
  ForensicAvailabilityMechanism,
  DNAInformationGainMechanism,
  DentalInformationGainMechanism,
  FingerprintInformationGainMechanism,
  IsotopeInformationGainMechanism,
  HistoricalRecordsMechanism,
  PublicOutreachMechanism,
  EvidenceReliabilityMechanism,
  EvidenceIndependenceMechanism,
  ContradictionMechanism,
  AssumptionDependencyMechanism,
  ResidualCandidateSetMechanism,
  NovelLeadMechanism,
  HumanReviewGateMechanism,
];

function aggregateMechanismProposals(snapshot: IdentityAnalysisState, context: IdentityMechanismContext) {
  const proposals = baselineMechanisms.map((mechanism) => mechanism.propose(snapshot, context));

  const profileMap = new Map<string, { rank: number; evidenceIds: string[]; contradictingEvidenceIds: string[]; unknownEvidenceIds: string[]; reason: string; testableNextStep: string; status: IdentityProfileAssessment['status']; noveltyStatus: IdentityProfileAssessment['noveltyStatus']; title: string; category: string }>();
  const candidateMap = new Map<string, { score: number; evidenceIds: string[]; contradictingEvidenceIds: string[]; unknownEvidenceIds: string[]; whyRelevant: string; whyWeak: string; missingFields: string[]; decisiveTest: string; whatWouldExclude: string; whatWouldStrengthen: string; outsideSetEffect: string; label: string }>();
  const actionMap = new Map<string, { score: number; evidenceIds: string[]; prerequisites: string[]; availabilityDependencies: string[]; rationale: string; title: string; category: IdentityActionPriority['category']; expectedInformationGain: number; candidateDiscrimination: number; resourceCost: number; legalFeasibility: number; technicalFeasibility: number; noveltyValue: number; status: IdentityActionPriority['status'] }>();
  const hypotheses: AnalyticalHypothesis[] = [];
  const contradictions: ContradictionFinding[] = [];
  const gaps: IdentityRecordSearchStrategy[] | Array<{ id: string }> = [];
  const warnings: string[] = [];

  for (const proposal of proposals) {
    for (const contribution of proposal.profileContributions) {
      const current = profileMap.get(contribution.profileId) ?? {
        rank: 0,
        evidenceIds: [],
        contradictingEvidenceIds: [],
        unknownEvidenceIds: [],
        reason: '',
        testableNextStep: '',
        status: 'weak' as const,
        noveltyStatus: 'derived' as const,
        title: contribution.profileId,
        category: 'derived',
      };
      current.rank += contribution.contribution;
      current.evidenceIds = uniqueSorted([...current.evidenceIds, ...contribution.evidenceIds]);
      current.contradictingEvidenceIds = uniqueSorted([...current.contradictingEvidenceIds, ...contribution.contradictingEvidenceIds]);
      current.unknownEvidenceIds = uniqueSorted([...current.unknownEvidenceIds, ...contribution.unknownEvidenceIds]);
      current.reason = current.reason || contribution.explanation;
      current.testableNextStep = current.testableNextStep || contribution.assumptions[0] || 'Review the profile against the entered case state.';
      current.status = current.rank > 0.32 ? 'supported' : 'weak';
      profileMap.set(contribution.profileId, current);
    }

    for (const contribution of proposal.candidateContributions) {
      const current = candidateMap.get(contribution.candidateId) ?? {
        score: 0,
        evidenceIds: [],
        contradictingEvidenceIds: [],
        unknownEvidenceIds: [],
        whyRelevant: '',
        whyWeak: '',
        missingFields: [],
        decisiveTest: '',
        whatWouldExclude: '',
        whatWouldStrengthen: '',
        outsideSetEffect: '',
        label: contribution.candidateId,
      };
      current.score += contribution.contribution;
      current.evidenceIds = uniqueSorted([...current.evidenceIds, ...contribution.evidenceIds]);
      current.contradictingEvidenceIds = uniqueSorted([...current.contradictingEvidenceIds, ...contribution.contradictingEvidenceIds]);
      current.unknownEvidenceIds = uniqueSorted([...current.unknownEvidenceIds, ...contribution.unknownEvidenceIds]);
      current.decisiveTest = current.decisiveTest || contribution.decisiveTests[0] || 'Compare the record against available evidence.';
      current.whyRelevant = current.whyRelevant || contribution.explanation;
      current.whyWeak = current.whyWeak || 'Candidate strength remains limited until more fields are known.';
      current.whatWouldExclude = current.whatWouldExclude || 'A decisive mismatch would exclude the candidate.';
      current.whatWouldStrengthen = current.whatWouldStrengthen || 'A matching record or compliant forensic result would strengthen the candidate.';
      current.outsideSetEffect = current.outsideSetEffect || 'Additional candidates can shrink the residual outside-set weight.';
      candidateMap.set(contribution.candidateId, current);
    }

    for (const contribution of proposal.actionContributions) {
      const current = actionMap.get(contribution.actionId) ?? {
        score: 0,
        evidenceIds: [],
        prerequisites: [],
        availabilityDependencies: [],
        rationale: '',
        title: contribution.actionId,
        category: 'other' as const,
        expectedInformationGain: 0,
        candidateDiscrimination: 0,
        resourceCost: 0.5,
        legalFeasibility: 0.5,
        technicalFeasibility: 0.5,
        noveltyValue: 0.5,
        status: 'unknown' as const,
      };
      current.score += contribution.contribution;
      current.evidenceIds = uniqueSorted([...current.evidenceIds, ...contribution.evidenceIds]);
      current.prerequisites = uniqueSorted([...current.prerequisites, ...contribution.prerequisites]);
      current.availabilityDependencies = uniqueSorted([...current.availabilityDependencies, ...contribution.availabilityDependencies]);
      current.rationale = current.rationale || contribution.explanation;
      actionMap.set(contribution.actionId, current);
    }

    hypotheses.push(...proposal.generatedHypotheses);
    contradictions.push(...proposal.contradictions);
    warnings.push(...proposal.warnings);
  }

  const profiles = [...profileMap.entries()].map(([profileId, value]) => ({
    profileId,
    title: value.title,
    category: value.category,
    rank: round(clamp(value.rank)),
    evidenceIds: value.evidenceIds,
    contradictingEvidenceIds: value.contradictingEvidenceIds,
    unknownEvidenceIds: value.unknownEvidenceIds,
    reason: value.reason,
    testableNextStep: value.testableNextStep,
    noveltyStatus: value.noveltyStatus,
    status: value.status,
  })).sort((left, right) => right.rank - left.rank);

  const candidates = [...candidateMap.entries()].map(([candidateId, value], index) => ({
    candidateId,
    label: value.label,
    comparisonPriority: round(clamp(value.score)),
    whyRelevant: value.whyRelevant,
    whyWeak: value.whyWeak,
    missingFields: value.missingFields,
    decisiveTest: value.decisiveTest,
    whatWouldExclude: value.whatWouldExclude,
    whatWouldStrengthen: value.whatWouldStrengthen,
    outsideSetEffect: value.outsideSetEffect,
    supportingEvidenceIds: value.evidenceIds,
    contradictingEvidenceIds: value.contradictingEvidenceIds,
    unknownEvidenceIds: value.unknownEvidenceIds,
    rank: index + 1,
  })).sort((left, right) => right.comparisonPriority - left.comparisonPriority);

  const actions = [...actionMap.entries()].map(([actionId, value]) => ({
    actionId,
    title: value.title,
    category: value.category,
    priority: round(clamp(value.score)),
    rationale: value.rationale,
    evidenceIds: value.evidenceIds,
    prerequisites: value.prerequisites,
    availabilityDependencies: value.availabilityDependencies,
    expectedInformationGain: round(value.expectedInformationGain || clamp(value.score)),
    candidateDiscrimination: round(value.candidateDiscrimination || clamp(value.score * 0.8)),
    resourceCost: round(value.resourceCost),
    legalFeasibility: round(value.legalFeasibility),
    technicalFeasibility: round(value.technicalFeasibility),
    noveltyValue: round(value.noveltyValue),
    status: value.status,
  })).sort((left, right) => right.priority - left.priority);

  return { proposals, profiles, candidates, actions, hypotheses, contradictions, warnings, gaps };
}

function buildTunableResult(
  state: IdentityAnalysisState,
  context: IdentityMechanismContext,
  tone: 'baseline' | 'hrm',
  buildResult: (payload: {
    caseUnderstanding: IdentityCaseUnderstanding;
    identityProfiles: IdentityProfileAssessment[];
    candidateAssessments: IdentityCandidateAssessment[];
    residualCandidateSetAssessment: ReturnType<typeof buildResidualAssessment>;
    newAnalyticalFindings: AnalyticalHypothesis[];
    recordSearchStrategies: IdentityRecordSearchStrategy[];
    forensicActionPriorities: IdentityActionPriority[];
    publicOutreachPriorities: IdentityPublicOutreachPriority[];
    boundedReconstructionQuestions: IdentityBoundedReconstructionQuestion[];
    contradictions: ContradictionFinding[];
    informationGaps: Array<{ id: string }> | IdentityRecordSearchStrategy[];
    recommendedNextAction: IdentityRecommendedAction;
    limitations: string[];
    humanReviewRequired: true;
    semanticProposalBundle?: SemanticProposalBundle;
  }) => IdentityTwinResult,
  semanticProposalBundle?: SemanticProposalBundle,
): IdentityTwinResult {
  const caseUnderstanding = buildCaseUnderstanding(state, tone);
  const profiles = buildProfiles(state, tone);
  const candidates = buildCandidateAssessments(state, tone);
  const residualCandidateSetAssessment: ReturnType<typeof buildResidualAssessment> = buildResidualAssessment(state);
  const recordSearchStrategies = buildSearchStrategies(state, tone);
  const forensicActionPriorities = buildForensicActions(state, tone);
  const publicOutreachPriorities = buildOutreachPriorities(state, tone);
  const boundedReconstructionQuestions = buildBoundedQuestions(state);
  const contradictions = buildContradictions(state);
  const newAnalyticalFindings = buildNovelHypotheses(state, tone).filter((finding) => finding.tests.length > 0 && finding.supportingEvidenceIds.length > 0);
  const informationGaps = state.normalizedUnknowns.map((unknown) => ({
    id: `G_${unknown.id}`,
    title: unknown.title,
    generatedBy: tone === 'baseline' ? 'twin_a' : 'twin_b',
    reason: unknown.whyItMatters,
    blockedConclusions: unknown.blocksConclusions,
    actionToResolve: unknown.actionToResolve,
    expectedInformationGain: unknown.expectedInformationGain === 'very_high' ? 0.9 : unknown.expectedInformationGain === 'high' ? 0.75 : unknown.expectedInformationGain === 'moderate' ? 0.55 : 0.35,
    evidenceIds: unknown.evidenceIds,
    noveltyStatus: 'derived' as const,
  }));
  const recommendedNextAction = buildRecommendedAction(state, forensicActionPriorities, newAnalyticalFindings);
  const limitations = uniqueSorted([
    tone === 'baseline'
      ? 'Twin A uses the supplied case state only; live Gemini output is used only when available and valid.'
      : 'Twin B uses mechanism proposals and arbitration over an immutable snapshot.',
    ...state.evidenceDependencyAudits.some((audit) => audit.duplicatedBy.length > 0) ? ['Repeated reporting may overstate independent confirmation unless deduplicated.'] : [],
    ...state.normalizedUnknowns.some((unknown) => unknown.currentStatus !== 'resolved') ? ['Key conclusions remain gated by unresolved unknowns.'] : [],
    ...newAnalyticalFindings.length === 0 ? ['No genuinely new case-specific lead was produced from the current public evidence.'] : [],
  ]);

  return buildResult({
    caseUnderstanding,
    identityProfiles: profiles,
    candidateAssessments: candidates,
    residualCandidateSetAssessment,
    newAnalyticalFindings,
    recordSearchStrategies,
    forensicActionPriorities,
    publicOutreachPriorities,
    boundedReconstructionQuestions,
    contradictions,
    informationGaps,
    recommendedNextAction,
    limitations,
    humanReviewRequired: true,
    semanticProposalBundle: semanticProposalBundle ?? (state.normalizedUnknowns.length > 0 ? buildDeterministicSemanticProposalBundle(state) : undefined),
  });
}

function finalizeResult(
  state: IdentityAnalysisState,
  runId: string,
  startedAt: string,
  engine: 'twin_a_direct' | 'twin_b_hrm',
  mode: 'live' | 'fixture',
  tokenUsage: number,
  payload: Omit<IdentityTwinResult, 'runMetadata' | 'analysisSnapshot'>,
): IdentityTwinResult {
  const completedAt = new Date().toISOString();
  const result: IdentityTwinResult = {
    ...payload,
    analysisSnapshot: buildAnalysisSnapshot(state, runId, startedAt),
    runMetadata: {
      runId,
      caseStateHash: state.caseStateHash,
      engine,
      mode,
      startedAt,
      completedAt,
      latencyMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
      tokenUsage,
      syntheticLabel: mode === 'fixture' ? 'Synthetic fixture output' : undefined,
    },
    humanReviewRequired: true,
  };
  return twinResultSchema.parse(result) as IdentityTwinResult;
}

async function runBaselineLive(state: IdentityAnalysisState, runId: string, startedAt: string): Promise<IdentityTwinResult> {
  const model = process.env.GEMINI_MODEL_BASELINE || 'gemini-2.5-flash';
  const prompt = [
    baselineIdentityPrompt,
    '',
    'Case state:',
    JSON.stringify({
      caseId: state.caseRecord.id,
      title: state.caseRecord.title,
      jurisdiction: state.caseRecord.jurisdiction,
      discovery: state.caseRecord.discovery,
      biologicalProfile: state.caseRecord.biologicalProfile,
      deathContext: state.caseRecord.deathContext,
      clothingItems: state.caseRecord.clothingItems,
      evidence: state.normalizedEvidence,
      candidateRecords: state.normalizedCandidateRecords,
      searchProfiles: state.normalizedSearchProfiles,
      actions: state.normalizedActions,
      recordsActions: state.normalizedRecordsActions,
      outreachActions: state.normalizedOutreachActions,
      reconstructionQuestions: state.normalizedReconstructionQuestions,
      unknowns: state.normalizedUnknowns,
      resolvedUnknowns: state.normalizedUnknowns.filter((unknown) => unknown.currentStatus === 'resolved'),
      unresolvedUnknowns: state.normalizedUnknowns.filter((unknown) => unknown.currentStatus !== 'resolved'),
      priorActions: state.humanReviewDecisions,
      completedSearches: state.recordSearchCoverage,
      knownExclusions: state.normalizedCandidateRecords.filter((candidate) => candidate.disposition.includes('excluded')).map((candidate) => candidate.id),
      forensicTestAvailability: state.normalizedActions.map((action) => ({
        actionId: action.id,
        availability: action.availability,
        category: action.category,
      })),
      provenance: state.normalizedProvenance,
      coverageMetrics: state.coverageMetrics,
      recordSearchCoverage: state.recordSearchCoverage,
      evidenceDependencyAudits: state.evidenceDependencyAudits,
      guardrails: state.caseRecord.guardrails,
      userSettings: state.settings,
      caseStateHash: state.caseStateHash,
    }, null, 2),
  ].join('\n');

  const geminiResult = await generateGeminiJson({
    model,
    systemInstruction: baselineIdentityPrompt,
    prompt,
    schema: baselineTwinPayloadSchema,
    timeoutMs: 45_000,
  });

  const payload = baselineTwinPayloadSchema.parse(geminiResult.payload) as Omit<IdentityTwinResult, 'runMetadata' | 'analysisSnapshot'>;
  return finalizeResult(
    state,
    runId,
    startedAt,
    'twin_a_direct',
    'live',
    geminiResult.tokenUsage,
    {
      ...payload,
      limitations: uniqueSorted([...payload.limitations, 'Live Gemini output was validated against the result schema.']),
    } as Omit<IdentityTwinResult, 'runMetadata' | 'analysisSnapshot'>,
  );
}

function runBaselineFixture(state: IdentityAnalysisState, runId: string, startedAt: string): IdentityTwinResult {
  return buildTunableResult(state, {
    runId,
    mode: 'fixture',
    accessMode: state.accessMode,
    evidenceDependencyAudits: state.evidenceDependencyAudits,
    previousRun: undefined,
  }, 'baseline', (payload) => finalizeResult(state, runId, startedAt, 'twin_a_direct', 'fixture', 0, payload as Omit<IdentityTwinResult, 'runMetadata' | 'analysisSnapshot'>));
}

function runHrmNarrative(state: IdentityAnalysisState, result: IdentityTwinResult): string | undefined {
  if (!hasGeminiConfiguration()) {
    return undefined;
  }
  return `Twin B mechanism summary: ${result.recommendedNextAction.action}.`;
}

function runHrmFixture(state: IdentityAnalysisState, runId: string, startedAt: string): IdentityTwinResult {
  const context: IdentityMechanismContext = {
    runId,
    mode: 'fixture',
    accessMode: state.accessMode,
    previousRun: undefined,
    evidenceDependencyAudits: state.evidenceDependencyAudits,
  };
  const aggregate = aggregateMechanismProposals(state, context);
  const residualCandidateSetAssessment: ReturnType<typeof buildResidualAssessment> = buildResidualAssessment(state);
  const caseUnderstanding = buildCaseUnderstanding(state, 'hrm');
  const candidateAssessments = buildCandidateAssessments(state, 'hrm');
  const recordSearchStrategies = buildSearchStrategies(state, 'hrm');
  const forensicActionPriorities = buildForensicActions(state, 'hrm');
  const publicOutreachPriorities = buildOutreachPriorities(state, 'hrm');
  const boundedReconstructionQuestions = buildBoundedQuestions(state);
  const informationGaps = uniqueSorted([...state.normalizedUnknowns.map((unknown) => unknown.id).map((id) => `G_${id}`)]).map((id) => ({
    id,
    title: id.replace(/^G_/, ''),
    generatedBy: 'twin_b' as const,
    reason: 'Unresolved unknown from the current case state.',
    blockedConclusions: ['Several model outputs remain bounded by this unknown.'],
    actionToResolve: 'Resolve the unknown through a records search or forensic inventory.',
    expectedInformationGain: 0.52,
    evidenceIds: ['E_CASE_FACTS'],
    noveltyStatus: 'derived' as const,
  }));
  const recommendedNextAction = buildRecommendedAction(state, forensicActionPriorities, aggregate.hypotheses);
  const payload = {
    caseUnderstanding,
    identityProfiles: aggregate.profiles,
    candidateAssessments,
    residualCandidateSetAssessment,
    newAnalyticalFindings: aggregate.hypotheses.filter((finding) => finding.tests.length > 0),
    recordSearchStrategies,
    forensicActionPriorities,
    publicOutreachPriorities,
    boundedReconstructionQuestions,
    contradictions: aggregate.contradictions,
    informationGaps,
    recommendedNextAction,
    limitations: uniqueSorted([
      'Twin B is generated from independent mechanism proposals over a fixed snapshot.',
      ...aggregate.warnings,
    ]),
    humanReviewRequired: true as const,
    semanticProposalBundle: buildDeterministicSemanticProposalBundle(state),
  };
  const result = finalizeResult(state, runId, startedAt, 'twin_b_hrm', 'fixture', 0, payload as Omit<IdentityTwinResult, 'runMetadata' | 'analysisSnapshot'>);
  return {
    ...result,
    narrativeExplanation: runHrmNarrative(state, result),
  } as IdentityTwinResult & { narrativeExplanation?: string };
}

async function runHrmLiveNarrative(state: IdentityAnalysisState, result: IdentityTwinResult, startedAt: string): Promise<string | undefined> {
  if (!hasGeminiConfiguration()) {
    return undefined;
  }
  try {
    const model = process.env.GEMINI_MODEL_NARRATIVE || process.env.GEMINI_MODEL_BASELINE || 'gemini-2.5-flash';
    const narrativeSchema = z.object({ summary: z.string().min(1) }).strict();
    const response = await generateGeminiJson({
      model,
      systemInstruction: 'Write a concise narrative explanation for an HRM identity-analysis result. Return JSON with a single field named summary.',
      prompt: JSON.stringify({
        runId: result.runMetadata.runId,
        caseStateHash: result.runMetadata.caseStateHash,
        recommendedNextAction: result.recommendedNextAction,
        contradictions: result.contradictions,
        informationGaps: result.informationGaps,
        limitations: result.limitations,
      }, null, 2),
      schema: narrativeSchema,
      timeoutMs: 20_000,
    });
    return response.payload.summary;
  } catch {
    return undefined;
  }
}

async function runTwinBSemanticProposalPassWithMetrics(state: IdentityAnalysisState, runId: string, startedAt: string) {
  const model = process.env.GEMINI_MODEL_TWIN_B || process.env.GEMINI_MODEL_NARRATIVE || process.env.GEMINI_MODEL_BASELINE || 'gemini-2.5-flash';
  const prompt = JSON.stringify({
    caseId: state.caseRecord.id,
    title: state.caseRecord.title,
    jurisdiction: state.caseRecord.jurisdiction,
    discovery: state.caseRecord.discovery,
    biologicalProfile: state.caseRecord.biologicalProfile,
    deathContext: state.caseRecord.deathContext,
    evidence: state.normalizedEvidence,
    candidateRecords: state.normalizedCandidateRecords,
    searchProfiles: state.normalizedSearchProfiles,
    actions: state.normalizedActions,
    recordsActions: state.normalizedRecordsActions,
    outreachActions: state.normalizedOutreachActions,
    reconstructionQuestions: state.normalizedReconstructionQuestions,
    unknowns: state.normalizedUnknowns,
    provenance: state.normalizedProvenance,
    coverageMetrics: state.coverageMetrics,
    recordSearchCoverage: state.recordSearchCoverage,
    evidenceDependencyAudits: state.evidenceDependencyAudits,
    guardrails: state.caseRecord.guardrails,
    settings: state.settings,
    currentUserMode: state.accessMode,
    currentActionsCompleted: state.humanReviewDecisions,
    knownExclusions: state.normalizedCandidateRecords.filter((candidate) => candidate.disposition.includes('excluded')).map((candidate) => candidate.id),
    forensicTestAvailability: state.normalizedActions.map((action) => ({
      id: action.id,
      availability: action.availability,
      category: action.category,
    })),
    priorActions: state.humanReviewDecisions,
    caseStateHash: state.caseStateHash,
  }, null, 2);

  const response = await generateGeminiJson({
    model,
    systemInstruction: 'You are Twin B. Produce bounded semantic proposals only. Do not commit final scores or conclusions. Return JSON only.',
    prompt,
    schema: semanticProposalBundleSchema,
    timeoutMs: 45_000,
  });

  return {
    bundle: response.payload,
    tokenUsage: response.tokenUsage,
    model,
    startedAt,
    runId,
  };
}

export async function runTwinBSemanticProposalPass(snapshot: IdentityAnalysisState): Promise<SemanticProposalBundle> {
  if (!hasGeminiConfiguration()) {
    return buildDeterministicSemanticProposalBundle(snapshot);
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const response = await runTwinBSemanticProposalPassWithMetrics(snapshot, runId, startedAt);
  return response.bundle as SemanticProposalBundle;
}

function runTwinAFixtureOutcome(state: IdentityAnalysisState, runId: string, startedAt: string): IdentityTwinResult {
  return runBaselineFixture(state, runId, startedAt);
}

async function runTwinALiveOutcome(state: IdentityAnalysisState, runId: string, startedAt: string): Promise<IdentityTwinResult> {
  return runBaselineLive(state, runId, startedAt);
}

export async function runTwinADirectAnalysis(input: TwinEngineInput): Promise<IdentityTwinRunOutcome> {
  const state = normalizeIdentityCase({ caseRecord: input.caseRecord, accessMode: input.accessMode, settings: input.settings });
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const requestedMode: 'live' | 'fixture' = input.settings?.fixtureMode ? 'fixture' : 'live';

  if (requestedMode === 'fixture') {
    return {
      executionStatus: buildExecutionStatus({
        requestedMode,
        actualMode: 'fixture',
        liveAttempted: false,
        liveSucceeded: false,
        fallbackAllowed: true,
        fallbackUsed: false,
        startedAt,
      }),
      bundle: runTwinAFixtureOutcome(state, runId, startedAt),
    };
  }

  if (!hasGeminiConfiguration()) {
    return {
      executionStatus: buildExecutionStatus({
        requestedMode,
        actualMode: 'failed',
        liveAttempted: true,
        liveSucceeded: false,
        fallbackAllowed: false,
        fallbackUsed: false,
        startedAt,
        failureCode: 'gemini_not_configured',
        failureMessage: 'Live analysis could not be completed. No case conclusions were generated.',
      }),
      failureMessage: 'Live analysis could not be completed. No case conclusions were generated.',
    };
  }

  try {
    const bundle = await runTwinALiveOutcome(state, runId, startedAt);
    return {
      executionStatus: buildExecutionStatus({
        requestedMode,
        actualMode: 'live',
        liveAttempted: true,
        liveSucceeded: true,
        fallbackAllowed: false,
        fallbackUsed: false,
        startedAt,
      }),
      bundle,
    };
  } catch (error) {
    return {
      executionStatus: buildExecutionStatus({
        requestedMode,
        actualMode: 'failed',
        liveAttempted: true,
        liveSucceeded: false,
        fallbackAllowed: false,
        fallbackUsed: false,
        startedAt,
        failureCode: error instanceof Error ? error.name : 'live_analysis_failed',
        failureMessage: 'Live analysis could not be completed. No case conclusions were generated.',
      }),
      failureMessage: error instanceof Error ? error.message : 'Live analysis could not be completed. No case conclusions were generated.',
    };
  }
}

async function runHrmLiveAnalysis(state: IdentityAnalysisState, runId: string, startedAt: string): Promise<IdentityTwinResult> {
  const semanticResponse = await runTwinBSemanticProposalPassWithMetrics(state, runId, startedAt);
  const fixtureResult = runHrmFixture(state, runId, startedAt);
  const liveNarrative = await runHrmLiveNarrative(state, fixtureResult, startedAt);
  const result = {
    ...fixtureResult,
    runMetadata: {
      ...fixtureResult.runMetadata,
      mode: 'live',
      tokenUsage: semanticResponse.tokenUsage,
      syntheticLabel: undefined,
    },
    semanticProposalBundle: semanticResponse.bundle,
    narrativeExplanation: liveNarrative ?? fixtureResult.narrativeExplanation,
  };

  return twinResultSchema.parse(result) as IdentityTwinResult;
}

export async function runTwinBAnalysis(input: TwinEngineInput): Promise<IdentityTwinRunOutcome> {
  const state = normalizeIdentityCase({ caseRecord: input.caseRecord, accessMode: input.accessMode, settings: input.settings });
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const requestedMode: 'live' | 'fixture' = input.settings?.fixtureMode ? 'fixture' : 'live';

  if (requestedMode === 'fixture') {
    return {
      executionStatus: buildExecutionStatus({
        requestedMode,
        actualMode: 'fixture',
        liveAttempted: false,
        liveSucceeded: false,
        fallbackAllowed: true,
        fallbackUsed: false,
        startedAt,
      }),
      bundle: runHrmFixture(state, runId, startedAt),
    };
  }

  if (!hasGeminiConfiguration()) {
    return {
      executionStatus: buildExecutionStatus({
        requestedMode,
        actualMode: 'failed',
        liveAttempted: true,
        liveSucceeded: false,
        fallbackAllowed: false,
        fallbackUsed: false,
        startedAt,
        failureCode: 'gemini_not_configured',
        failureMessage: 'Live analysis could not be completed. No case conclusions were generated.',
      }),
      failureMessage: 'Live analysis could not be completed. No case conclusions were generated.',
    };
  }

  try {
    const bundle = await runHrmLiveAnalysis(state, runId, startedAt);
    return {
      executionStatus: buildExecutionStatus({
        requestedMode,
        actualMode: 'live',
        liveAttempted: true,
        liveSucceeded: true,
        fallbackAllowed: false,
        fallbackUsed: false,
        startedAt,
      }),
      bundle,
    };
  } catch (error) {
    return {
      executionStatus: buildExecutionStatus({
        requestedMode,
        actualMode: 'failed',
        liveAttempted: true,
        liveSucceeded: false,
        fallbackAllowed: false,
        fallbackUsed: false,
        startedAt,
        failureCode: error instanceof Error ? error.name : 'live_analysis_failed',
        failureMessage: 'Live analysis could not be completed. No case conclusions were generated.',
      }),
      failureMessage: error instanceof Error ? error.message : 'Live analysis could not be completed. No case conclusions were generated.',
    };
  }
}

export async function runBaselineIdentityTwin(input: TwinEngineInput): Promise<IdentityTwinResult> {
  const outcome = await runTwinADirectAnalysis(input);
  if (!outcome.bundle) {
    throw new Error(outcome.failureMessage ?? 'Live analysis could not be completed. No case conclusions were generated.');
  }
  return outcome.bundle;
}

export async function runHrmIdentityTwin(input: TwinEngineInput): Promise<IdentityTwinResult> {
  const outcome = await runTwinBAnalysis(input);
  if (!outcome.bundle) {
    throw new Error(outcome.failureMessage ?? 'Live analysis could not be completed. No case conclusions were generated.');
  }
  return outcome.bundle;
}

export async function runTwinBundle(input: TwinEngineInput): Promise<IdentityTwinRunBundle> {
  const state = normalizeIdentityCase({ caseRecord: input.caseRecord, accessMode: input.accessMode, settings: input.settings });
  const runId = randomUUID();
  const bundleRunId = randomUUID();
  const baseline = await runBaselineIdentityTwin(input);
  const hrm = await runHrmIdentityTwin(input);
  const comparison = compareTwinResults(baseline, hrm);

  return {
    runId: bundleRunId,
    caseStateHash: state.caseStateHash,
    snapshot: buildAnalysisSnapshot(state, bundleRunId),
    baseline: { ...baseline, comparison },
    hrm: { ...hrm, comparison },
    comparison,
    mode: baseline.runMetadata.mode === 'live' || hrm.runMetadata.mode === 'live' ? 'live' : 'fixture',
  };
}

export function compareTwinResults(twinAResult: IdentityTwinResult, twinBResult: IdentityTwinResult): IdentityTwinComparison {
  const sharedHypotheses = twinAResult.newAnalyticalFindings
    .map((hypothesis) => hypothesis.statement)
    .filter((statement) => twinBResult.newAnalyticalFindings.some((other) => other.statement === statement));
  const uniqueToTwinA = twinAResult.newAnalyticalFindings
    .map((hypothesis) => hypothesis.statement)
    .filter((statement) => !sharedHypotheses.includes(statement));
  const uniqueToTwinB = twinBResult.newAnalyticalFindings
    .map((hypothesis) => hypothesis.statement)
    .filter((statement) => !sharedHypotheses.includes(statement));

  const hypothesisOverlap = clamp(sharedHypotheses.length / Math.max(1, new Set([...twinAResult.newAnalyticalFindings.map((finding) => finding.id), ...twinBResult.newAnalyticalFindings.map((finding) => finding.id)]).size));
  const actionRankCorrelation = clamp(1 - Math.abs(average(twinAResult.forensicActionPriorities.map((action) => action.priority)) - average(twinBResult.forensicActionPriorities.map((action) => action.priority))));
  const profileRankCorrelation = clamp(1 - Math.abs(average(twinAResult.identityProfiles.map((profile) => profile.rank)) - average(twinBResult.identityProfiles.map((profile) => profile.rank))));
  const contradictionOverlap = compareStringLists(twinAResult.contradictions.map((item) => item.id), twinBResult.contradictions.map((item) => item.id));
  const evidenceCoverage = clamp(new Set([...twinAResult.caseUnderstanding.establishedFacts, ...twinBResult.caseUnderstanding.establishedFacts]).size / Math.max(1, twinAResult.caseUnderstanding.establishedFacts.length + twinBResult.caseUnderstanding.establishedFacts.length));
  const unsupportedClaimCount = twinAResult.caseUnderstanding.unsupportedClaimsRejected.length + twinBResult.caseUnderstanding.unsupportedClaimsRejected.length;
  const noveltyOverlap = compareStringLists(twinAResult.newAnalyticalFindings.map((finding) => finding.noveltyStatus), twinBResult.newAnalyticalFindings.map((finding) => finding.noveltyStatus));

  const disagreements = [] as IdentityTwinComparison['disagreements'];
  const topActionA = twinAResult.forensicActionPriorities[0];
  const topActionB = twinBResult.forensicActionPriorities[0];
  if (topActionA?.actionId !== topActionB?.actionId) {
    disagreements.push({
      disputedOutput: 'top_forensic_action',
      twinARationale: topActionA?.rationale ?? 'Twin A had no top action.',
      twinBRationale: topActionB?.rationale ?? 'Twin B had no top action.',
      evidenceUsedByTwinA: topActionA?.evidenceIds ?? [],
      evidenceUsedByTwinB: topActionB?.evidenceIds ?? [],
      assumptions: ['Action ranking depends on current availability and candidate pressure.'],
      missingInformation: ['Action availability status', 'Evidence inventory completeness'],
    });
  }

  return {
    sharedHypotheses,
    uniqueToTwinA,
    uniqueToTwinB,
    hypothesisOverlap,
    actionRankCorrelation,
    profileRankCorrelation,
    contradictionOverlap,
    evidenceCoverage,
    unsupportedClaimCount,
    noveltyOverlap,
    disagreements,
  };
}

export async function runBaselineIdentityTwinWithState(state: IdentityAnalysisState): Promise<IdentityTwinResult> {
  return runBaselineIdentityTwin({ caseRecord: state.caseRecord, accessMode: state.accessMode, settings: state.settings });
}

export async function runHrmIdentityTwinWithState(state: IdentityAnalysisState): Promise<IdentityTwinResult> {
  return runHrmIdentityTwin({ caseRecord: state.caseRecord, accessMode: state.accessMode, settings: state.settings });
}
