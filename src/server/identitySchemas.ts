import { z } from 'zod';

const evidenceIdArray = z.array(z.string().min(1));

export const analyticalHypothesisSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    'identity_profile',
    'record_location',
    'alias_or_duplicate',
    'forensic_action',
    'clothing_context',
    'public_outreach',
    'bounded_reconstruction',
  ]),
  statement: z.string().min(1),
  generatedBy: z.enum(['twin_a', 'twin_b_mechanism']),
  noveltyStatus: z.enum(['seeded', 'directly_stated', 'derived_combination', 'new_testable_hypothesis']),
  supportingEvidenceIds: evidenceIdArray.min(1),
  contradictingEvidenceIds: z.array(z.string().min(1)),
  unknownEvidenceIds: z.array(z.string().min(1)),
  requiredAssumptions: z.array(z.string().min(1)),
  tests: z.array(z.object({
    action: z.string().min(1),
    possiblePositiveInterpretation: z.string().min(1),
    possibleNegativeInterpretation: z.string().min(1),
  })).min(1),
  fragility: z.enum(['low', 'moderate', 'high']),
  status: z.enum(['viable', 'weak', 'unsupported', 'blocked_by_missing_data']),
}).strict();

export const contradictionFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum([
    'date_conflict',
    'age_conflict',
    'height_conflict',
    'location_conflict',
    'alias_conflict',
    'forensic_conflict',
    'coverage_conflict',
    'source_conflict',
  ]),
  explanation: z.string().min(1),
  severity: z.enum(['low', 'moderate', 'high']),
  evidenceIds: evidenceIdArray,
  contradictingEvidenceIds: z.array(z.string().min(1)),
  assumptions: z.array(z.string().min(1)),
}).strict();

export const informationGapSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  generatedBy: z.enum(['twin_a', 'twin_b']),
  reason: z.string().min(1),
  blockedConclusions: z.array(z.string().min(1)),
  actionToResolve: z.string().min(1),
  expectedInformationGain: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().min(1)),
  noveltyStatus: z.enum(['seeded', 'derived', 'newly_identified']),
}).strict();

export const candidateAssessmentSchema = z.object({
  candidateId: z.string().min(1),
  label: z.string().min(1),
  comparisonPriority: z.number().min(0).max(1),
  whyRelevant: z.string().min(1),
  whyWeak: z.string().min(1),
  missingFields: z.array(z.string().min(1)),
  decisiveTest: z.string().min(1),
  whatWouldExclude: z.string().min(1),
  whatWouldStrengthen: z.string().min(1),
  outsideSetEffect: z.string().min(1),
  supportingEvidenceIds: z.array(z.string().min(1)),
  contradictingEvidenceIds: z.array(z.string().min(1)),
  unknownEvidenceIds: z.array(z.string().min(1)),
  rank: z.number().int(),
}).strict();

export const actionPrioritySchema = z.object({
  actionId: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(['forensic', 'records', 'outreach', 'reconstruction', 'review', 'other']),
  priority: z.number().min(0).max(1),
  rationale: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  prerequisites: z.array(z.string().min(1)).min(1),
  availabilityDependencies: z.array(z.string().min(1)),
  expectedInformationGain: z.number().min(0).max(1),
  candidateDiscrimination: z.number().min(0).max(1),
  resourceCost: z.number().min(0).max(1),
  legalFeasibility: z.number().min(0).max(1),
  technicalFeasibility: z.number().min(0).max(1),
  noveltyValue: z.number().min(0).max(1),
  status: z.enum(['recommended', 'authorized', 'in_progress', 'completed', 'unavailable', 'unknown']),
}).strict();

export const profileAssessmentSchema = z.object({
  profileId: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  rank: z.number().min(0),
  evidenceIds: z.array(z.string().min(1)),
  contradictingEvidenceIds: z.array(z.string().min(1)),
  unknownEvidenceIds: z.array(z.string().min(1)),
  reason: z.string().min(1),
  testableNextStep: z.string().min(1),
  noveltyStatus: z.enum(['seeded', 'derived', 'new_testable_hypothesis']),
  status: z.enum(['supported', 'weak', 'blocked', 'redundant']),
}).strict();

export const recordSearchStrategySchema = z.object({
  searchId: z.string().min(1),
  repositoryClass: z.string().min(1),
  status: z.enum(['recommended', 'authorized', 'in_progress', 'completed', 'unavailable', 'unknown']),
  dateRange: z.object({ start: z.string().optional(), end: z.string().optional() }),
  demographicConstraints: z.array(z.string().min(1)),
  aliasStrategy: z.string().min(1),
  heightAgeTolerance: z.string().min(1),
  geographicalRationale: z.string().min(1),
  expectedRecords: z.string().min(1),
  duplicateRisk: z.string().min(1),
  legalOrAccessRequirements: z.array(z.string().min(1)),
  outcomeWouldChangeModel: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
}).strict();

export const outreachPrioritySchema = z.object({
  outreachId: z.string().min(1),
  title: z.string().min(1),
  targetAudience: z.string().min(1),
  messageFocus: z.string().min(1),
  whyItMayHelp: z.string().min(1),
  risks: z.array(z.string().min(1)),
  officialChannelRequired: z.string().min(1),
  measurement: z.string().min(1),
  status: z.enum(['recommended', 'authorized', 'in_progress', 'completed', 'unavailable', 'unknown']),
  evidenceIds: z.array(z.string().min(1)),
  priority: z.number().min(0).max(1),
}).strict();

export const boundedReconstructionQuestionSchema = z.object({
  questionId: z.string().min(1),
  prompt: z.string().min(1),
  identityRelevance: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  unknowns: z.array(z.string().min(1)),
  test: z.string().min(1),
  currentAnswerability: z.enum(['currently_answerable', 'partially_answerable', 'currently_unanswerable']),
  whatWouldWeakenIt: z.string().min(1),
}).strict();

export const recommendedActionSchema = z.object({
  action: z.string().min(1),
  reason: z.string().min(1),
  expectedInformationGain: z.number().min(0).max(1),
  prerequisites: z.array(z.string().min(1)),
  authorizationRequired: z.array(z.string().min(1)),
  limitations: z.array(z.string().min(1)),
  actionId: z.string().optional(),
  evidenceIds: z.array(z.string().min(1)).optional(),
}).strict();

export const caseUnderstandingSchema = z.object({
  establishedFacts: z.array(z.string().min(1)),
  derivedObservations: z.array(z.string().min(1)),
  unsupportedClaimsRejected: z.array(z.string().min(1)),
  sourceWarnings: z.array(z.string().min(1)),
}).strict();

export const residualCandidateSetSchema = z.object({
  preserved: z.literal(true),
  residualWeight: z.number().min(0).max(1),
  uncertainty: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  interpretation: z.literal('comparative_analytical_weight_not_probability'),
  reasons: z.array(z.string().min(1)),
  increasesWhen: z.array(z.string().min(1)),
  decreasesWhen: z.array(z.string().min(1)),
  calculationInputs: z.array(z.object({
    inputId: z.string().min(1),
    label: z.string().min(1),
    value: z.union([z.number(), z.string()]),
    provenance: z.string().min(1),
  })).min(1),
  assumptions: z.array(z.string().min(1)),
  limitations: z.array(z.string().min(1)),
}).strict();

export const twinComparisonSchema = z.object({
  sharedHypotheses: z.array(z.string().min(1)),
  uniqueToTwinA: z.array(z.string().min(1)),
  uniqueToTwinB: z.array(z.string().min(1)),
  hypothesisOverlap: z.number().min(0).max(1),
  actionRankCorrelation: z.number().min(-1).max(1),
  profileRankCorrelation: z.number().min(-1).max(1),
  contradictionOverlap: z.number().min(0).max(1),
  evidenceCoverage: z.number().min(0).max(1),
  unsupportedClaimCount: z.number().int().min(0),
  noveltyOverlap: z.number().min(0).max(1),
  disagreements: z.array(z.object({
    disputedOutput: z.string().min(1),
    twinARationale: z.string().min(1),
    twinBRationale: z.string().min(1),
    evidenceUsedByTwinA: z.array(z.string().min(1)),
    evidenceUsedByTwinB: z.array(z.string().min(1)),
    assumptions: z.array(z.string().min(1)),
    missingInformation: z.array(z.string().min(1)),
  })).default([]),
}).strict();

export const twinResultSchema = z.object({
  runMetadata: z.object({
    runId: z.string().min(1),
    caseStateHash: z.string().min(1),
    engine: z.enum(['twin_a_direct', 'twin_b_hrm']),
    mode: z.enum(['live', 'fixture']),
    startedAt: z.string().min(1),
    completedAt: z.string().min(1),
    latencyMs: z.number().min(0),
    tokenUsage: z.number().min(0),
    syntheticLabel: z.literal('Synthetic fixture output').optional(),
  }).strict(),
  analysisSnapshot: z.object({
    caseId: z.string().min(1),
    runId: z.string().min(1),
    caseStateHash: z.string().min(1),
    createdAt: z.string().min(1),
    evidenceVersion: z.number().int(),
    candidateVersion: z.number().int(),
    unknownRegistryVersion: z.number().int(),
    settingsVersion: z.number().int(),
  }).strict(),
  narrativeExplanation: z.string().optional(),
  caseUnderstanding: caseUnderstandingSchema,
  identityProfiles: z.array(profileAssessmentSchema),
  candidateAssessments: z.array(candidateAssessmentSchema),
  residualCandidateSetAssessment: residualCandidateSetSchema,
  newAnalyticalFindings: z.array(analyticalHypothesisSchema),
  recordSearchStrategies: z.array(recordSearchStrategySchema),
  forensicActionPriorities: z.array(actionPrioritySchema),
  publicOutreachPriorities: z.array(outreachPrioritySchema),
  boundedReconstructionQuestions: z.array(boundedReconstructionQuestionSchema),
  contradictions: z.array(contradictionFindingSchema),
  informationGaps: z.array(informationGapSchema),
  recommendedNextAction: recommendedActionSchema,
  limitations: z.array(z.string().min(1)),
  humanReviewRequired: z.literal(true),
  staleness: z.object({ current: z.boolean(), reason: z.string().min(1) }).optional(),
  comparison: twinComparisonSchema.optional(),
}).strict();

export const baselineTwinPayloadSchema = z.object({
  caseUnderstanding: caseUnderstandingSchema,
  identityProfiles: z.array(profileAssessmentSchema),
  candidateAssessments: z.array(candidateAssessmentSchema),
  residualCandidateSetAssessment: residualCandidateSetSchema,
  newAnalyticalFindings: z.array(analyticalHypothesisSchema),
  recordSearchStrategies: z.array(recordSearchStrategySchema),
  forensicActionPriorities: z.array(actionPrioritySchema),
  publicOutreachPriorities: z.array(outreachPrioritySchema),
  boundedReconstructionQuestions: z.array(boundedReconstructionQuestionSchema),
  contradictions: z.array(contradictionFindingSchema),
  informationGaps: z.array(informationGapSchema),
  recommendedNextAction: recommendedActionSchema,
  limitations: z.array(z.string().min(1)),
  humanReviewRequired: z.literal(true),
}).strict();

export const mechanismProposalSchema = z.object({
  mechanismId: z.string().min(1),
  profileContributions: z.array(z.object({
    profileId: z.string().min(1),
    contribution: z.number(),
    evidenceIds: z.array(z.string().min(1)),
    contradictingEvidenceIds: z.array(z.string().min(1)),
    unknownEvidenceIds: z.array(z.string().min(1)),
    assumptions: z.array(z.string().min(1)),
    explanation: z.string().min(1),
  })).default([]),
  candidateContributions: z.array(z.object({
    candidateId: z.string().min(1),
    contribution: z.number(),
    evidenceIds: z.array(z.string().min(1)),
    contradictingEvidenceIds: z.array(z.string().min(1)),
    unknownEvidenceIds: z.array(z.string().min(1)),
    decisiveTests: z.array(z.string().min(1)),
    explanation: z.string().min(1),
  })).default([]),
  actionContributions: z.array(z.object({
    actionId: z.string().min(1),
    contribution: z.number(),
    evidenceIds: z.array(z.string().min(1)),
    prerequisites: z.array(z.string().min(1)),
    availabilityDependencies: z.array(z.string().min(1)),
    explanation: z.string().min(1),
  })).default([]),
  generatedHypotheses: z.array(analyticalHypothesisSchema).default([]),
  contradictions: z.array(contradictionFindingSchema).default([]),
  informationGaps: z.array(informationGapSchema).default([]),
  warnings: z.array(z.string().min(1)).default([]),
}).strict();

export { z };