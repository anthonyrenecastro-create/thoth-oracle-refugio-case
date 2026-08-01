import type {
  AccessMode,
  IdentityCandidate,
  IdentityEvidenceItem,
  IdentitySearchProfile,
  IdentificationAction,
  BoundedReconstructionQuestion,
  RecordSearchCoverage,
  SourceProvenance,
  CriticalUnknown,
  CandidateCoverageMetrics,
  HumanReviewDecision,
  ResidualCandidateSetAssessment,
} from './identityForensics';
import type { IdentityCase } from '../data/refugioCase';

export interface AnalysisInputSnapshot {
  caseId: string;
  runId: string;
  caseStateHash: string;
  createdAt: string;
  evidenceVersion: number;
  candidateVersion: number;
  unknownRegistryVersion: number;
  settingsVersion: number;
}

export interface IdentityAnalysisSettings {
  fixtureMode?: boolean;
  runLabel?: string;
}

export interface EvidenceDependencyAudit {
  evidenceId: string;
  independenceGroup: string;
  duplicatedBy: string[];
  effectiveWeightAdjustment: number;
  explanation: string;
}

export interface AnalyticalHypothesis {
  id: string;
  category:
    | 'identity_profile'
    | 'record_location'
    | 'alias_or_duplicate'
    | 'forensic_action'
    | 'clothing_context'
    | 'public_outreach'
    | 'bounded_reconstruction';
  statement: string;
  generatedBy: 'twin_a' | 'twin_b_mechanism';
  noveltyStatus: 'seeded' | 'directly_stated' | 'derived_combination' | 'new_testable_hypothesis';
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  unknownEvidenceIds: string[];
  requiredAssumptions: string[];
  tests: Array<{
    action: string;
    possiblePositiveInterpretation: string;
    possibleNegativeInterpretation: string;
  }>;
  fragility: 'low' | 'moderate' | 'high';
  status: 'viable' | 'weak' | 'unsupported' | 'blocked_by_missing_data';
}

export interface ContradictionFinding {
  id: string;
  title: string;
  category:
    | 'date_conflict'
    | 'age_conflict'
    | 'height_conflict'
    | 'location_conflict'
    | 'alias_conflict'
    | 'forensic_conflict'
    | 'coverage_conflict'
    | 'source_conflict';
  explanation: string;
  severity: 'low' | 'moderate' | 'high';
  evidenceIds: string[];
  contradictingEvidenceIds: string[];
  assumptions: string[];
}

export interface InformationGapFinding {
  id: string;
  title: string;
  generatedBy: 'twin_a' | 'twin_b';
  reason: string;
  blockedConclusions: string[];
  actionToResolve: string;
  expectedInformationGain: number;
  evidenceIds: string[];
  noveltyStatus: 'seeded' | 'derived' | 'newly_identified';
}

export interface IdentityMechanismProposal {
  mechanismId: string;
  profileContributions: Array<{
    profileId: string;
    contribution: number;
    evidenceIds: string[];
    contradictingEvidenceIds: string[];
    unknownEvidenceIds: string[];
    assumptions: string[];
    explanation: string;
  }>;
  candidateContributions: Array<{
    candidateId: string;
    contribution: number;
    evidenceIds: string[];
    contradictingEvidenceIds: string[];
    unknownEvidenceIds: string[];
    decisiveTests: string[];
    explanation: string;
  }>;
  actionContributions: Array<{
    actionId: string;
    contribution: number;
    evidenceIds: string[];
    prerequisites: string[];
    availabilityDependencies: string[];
    explanation: string;
  }>;
  generatedHypotheses: AnalyticalHypothesis[];
  contradictions: ContradictionFinding[];
  informationGaps: InformationGapFinding[];
  warnings: string[];
}

export interface IdentityMechanismContext {
  runId: string;
  mode: 'live' | 'fixture';
  accessMode: AccessMode;
  previousRun?: IdentityTwinResult;
  evidenceDependencyAudits: EvidenceDependencyAudit[];
}

export interface IdentityMechanism {
  id: string;
  name: string;
  reads: readonly string[];
  writes: readonly string[];
  propose(
    snapshot: Readonly<IdentityAnalysisState>,
    context: IdentityMechanismContext,
  ): IdentityMechanismProposal;
}

export interface IdentityProfileAssessment {
  profileId: string;
  title: string;
  category: string;
  rank: number;
  evidenceIds: string[];
  contradictingEvidenceIds: string[];
  unknownEvidenceIds: string[];
  reason: string;
  testableNextStep: string;
  noveltyStatus: 'seeded' | 'derived' | 'new_testable_hypothesis';
  status: 'supported' | 'weak' | 'blocked' | 'redundant';
}

export interface IdentityCandidateAssessment {
  candidateId: string;
  label: string;
  comparisonPriority: number;
  whyRelevant: string;
  whyWeak: string;
  missingFields: string[];
  decisiveTest: string;
  whatWouldExclude: string;
  whatWouldStrengthen: string;
  outsideSetEffect: string;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  unknownEvidenceIds: string[];
  rank: number;
}

export interface IdentityActionPriority {
  actionId: string;
  title: string;
  category: 'forensic' | 'records' | 'outreach' | 'reconstruction' | 'review' | 'other';
  priority: number;
  rationale: string;
  evidenceIds: string[];
  prerequisites: string[];
  availabilityDependencies: string[];
  expectedInformationGain: number;
  candidateDiscrimination: number;
  resourceCost: number;
  legalFeasibility: number;
  technicalFeasibility: number;
  noveltyValue: number;
  status: 'recommended' | 'authorized' | 'in_progress' | 'completed' | 'unavailable' | 'unknown';
}

export interface IdentityRecordSearchStrategy {
  searchId: string;
  repositoryClass: string;
  status: 'recommended' | 'authorized' | 'in_progress' | 'completed' | 'unavailable' | 'unknown';
  dateRange: { start?: string; end?: string };
  demographicConstraints: string[];
  aliasStrategy: string;
  heightAgeTolerance: string;
  geographicalRationale: string;
  expectedRecords: string;
  duplicateRisk: string;
  legalOrAccessRequirements: string[];
  outcomeWouldChangeModel: string;
  evidenceIds: string[];
}

export interface IdentityPublicOutreachPriority {
  outreachId: string;
  title: string;
  targetAudience: string;
  messageFocus: string;
  whyItMayHelp: string;
  risks: string[];
  officialChannelRequired: string;
  measurement: string;
  status: 'recommended' | 'authorized' | 'in_progress' | 'completed' | 'unavailable' | 'unknown';
  evidenceIds: string[];
  priority: number;
}

export interface IdentityBoundedReconstructionQuestion {
  questionId: string;
  prompt: string;
  identityRelevance: string;
  evidenceIds: string[];
  unknowns: string[];
  test: string;
  currentAnswerability: 'currently_answerable' | 'partially_answerable' | 'currently_unanswerable';
  whatWouldWeakenIt: string;
}

export interface IdentityRecommendedAction {
  action: string;
  reason: string;
  expectedInformationGain: number;
  prerequisites: string[];
  authorizationRequired: string[];
  limitations: string[];
  actionId?: string;
  evidenceIds?: string[];
}

export interface IdentityCaseUnderstanding {
  establishedFacts: string[];
  derivedObservations: string[];
  unsupportedClaimsRejected: string[];
  sourceWarnings: string[];
}

export interface IdentityTwinRunMetadata {
  runId: string;
  caseStateHash: string;
  engine: 'twin_a_direct' | 'twin_b_hrm';
  mode: 'live' | 'fixture';
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  tokenUsage: number;
  syntheticLabel?: 'Synthetic fixture output';
}

export interface IdentityTwinResult {
  runMetadata: IdentityTwinRunMetadata;
  analysisSnapshot: AnalysisInputSnapshot;
  narrativeExplanation?: string;
  caseUnderstanding: IdentityCaseUnderstanding;
  identityProfiles: IdentityProfileAssessment[];
  candidateAssessments: IdentityCandidateAssessment[];
  residualCandidateSetAssessment: ResidualCandidateSetAssessment;
  newAnalyticalFindings: AnalyticalHypothesis[];
  recordSearchStrategies: IdentityRecordSearchStrategy[];
  forensicActionPriorities: IdentityActionPriority[];
  publicOutreachPriorities: IdentityPublicOutreachPriority[];
  boundedReconstructionQuestions: IdentityBoundedReconstructionQuestion[];
  contradictions: ContradictionFinding[];
  informationGaps: InformationGapFinding[];
  recommendedNextAction: IdentityRecommendedAction;
  limitations: string[];
  humanReviewRequired: true;
  staleness?: {
    current: boolean;
    reason: string;
  };
  comparison?: IdentityTwinComparison;
}

export interface IdentityTwinComparison {
  sharedHypotheses: string[];
  uniqueToTwinA: string[];
  uniqueToTwinB: string[];
  hypothesisOverlap: number;
  actionRankCorrelation: number;
  profileRankCorrelation: number;
  contradictionOverlap: number;
  evidenceCoverage: number;
  unsupportedClaimCount: number;
  noveltyOverlap: number;
  disagreements: Array<{
    disputedOutput: string;
    twinARationale: string;
    twinBRationale: string;
    evidenceUsedByTwinA: string[];
    evidenceUsedByTwinB: string[];
    assumptions: string[];
    missingInformation: string[];
  }>;
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

export interface IdentityAnalysisState {
  caseRecord: IdentityCase;
  accessMode: AccessMode;
  settings: IdentityAnalysisSettings;
  normalizedEvidence: IdentityEvidenceItem[];
  normalizedCandidateRecords: IdentityCandidate[];
  normalizedSearchProfiles: IdentitySearchProfile[];
  normalizedActions: IdentificationAction[];
  normalizedRecordsActions: IdentificationAction[];
  normalizedOutreachActions: IdentificationAction[];
  normalizedReconstructionQuestions: BoundedReconstructionQuestion[];
  normalizedUnknowns: CriticalUnknown[];
  normalizedProvenance: SourceProvenance[];
  coverageMetrics?: CandidateCoverageMetrics;
  recordSearchCoverage?: RecordSearchCoverage[];
  humanReviewDecisions?: HumanReviewDecision[];
  evidenceDependencyAudits: EvidenceDependencyAudit[];
  caseStateHash: string;
  evidenceVersion: number;
  candidateVersion: number;
  unknownRegistryVersion: number;
  settingsVersion: number;
}

export interface InvestigatorFindingFeedback {
  findingId: string;
  reviewerRole: string;
  alreadyKnown: boolean;
  factualAccuracy: 'accurate' | 'partially_accurate' | 'inaccurate' | 'unknown';
  changedPriority: boolean;
  operationalValue: 'none' | 'low' | 'moderate' | 'high';
  outcome:
    | 'no_action'
    | 'records_requested'
    | 'candidate_compared'
    | 'candidate_excluded'
    | 'new_candidate_found'
    | 'forensic_test_requested'
    | 'other';
  notes: string;
}

export interface SyntheticFixtureAnswer {
  hiddenCandidateId: string;
  hiddenCandidateName: string;
}