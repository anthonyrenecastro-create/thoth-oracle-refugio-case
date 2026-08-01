export type InformationGainQualitative = 'very_high' | 'high' | 'moderate' | 'low';

export interface InformationGainAssessment {
  qualitative: InformationGainQualitative;
  internalScore: number;
  scoreInterval: [number, number];
  scoringVersion: string;
  basis: Array<{
    factor: string;
    contribution: number;
    explanation: string;
    evidenceIds: string[];
    assumptions: string[];
  }>;
  sensitivity: Array<{
    changedInput: string;
    originalValue: string | number;
    alternateValue: string | number;
    resultingScore: number;
  }>;
  limitations: string[];
}

export interface ResidualCandidateSetAssessment {
  preserved: true;
  residualWeight: number;
  uncertainty: [number, number];
  interpretation: 'comparative_analytical_weight_not_probability';
  reasons: string[];
  increasesWhen: string[];
  decreasesWhen: string[];
  calculationInputs: Array<{
    inputId: string;
    label: string;
    value: number | string;
    provenance: string;
  }>;
  assumptions: string[];
  limitations: string[];
}

export function normalizeComparisonPriority(
  compatibility: number,
  completeness: number,
  contradiction: number,
  informationGain: number,
): number {
  const normalized = 0.4 * compatibility + 0.25 * completeness + 0.15 * contradiction + 0.2 * informationGain;
  return Math.max(0, Math.min(1, normalized));
}

export function buildCandidatePriorityScore(candidate: {
  assessment: { compatibilityScore: number; evidenceCompletenessScore: number; contradictionScore: number; informationGainScore: number };
}) {
  return normalizeComparisonPriority(
    candidate.assessment.compatibilityScore,
    candidate.assessment.evidenceCompletenessScore,
    candidate.assessment.contradictionScore,
    candidate.assessment.informationGainScore,
  );
}

export function buildInformationGainAssessment(internalScore: number, qualitative: InformationGainQualitative): InformationGainAssessment {
  const normalizedScore = Math.max(0, Math.min(1, internalScore));
  const spread = qualitative === 'very_high'
    ? 0.09
    : qualitative === 'high'
      ? 0.13
      : qualitative === 'moderate'
        ? 0.18
        : 0.16;
  const scoreInterval: [number, number] = [
    Math.max(0, normalizedScore - spread),
    Math.min(1, normalizedScore + spread),
  ];

  return {
    qualitative,
    internalScore: normalizedScore,
    scoreInterval,
    scoringVersion: 'identity-v1',
    basis: [
      {
        factor: 'evidence availability',
        contribution: 0.35,
        explanation: 'The action depends on whether the necessary evidence is present and accessible.',
        evidenceIds: ['E_CASE_FACTS'],
        assumptions: ['Public facts are incomplete.'],
      },
      {
        factor: 'candidate discrimination potential',
        contribution: 0.4,
        explanation: 'The action can reduce uncertainty if it differentiates among candidate records.',
        evidenceIds: ['E_CASE_FACTS'],
        assumptions: ['Candidate records remain limited.'],
      },
      {
        factor: 'legal and procedural access',
        contribution: 0.25,
        explanation: 'Authorized access and policy determine whether the action can be completed.',
        evidenceIds: ['E_CASE_FACTS'],
        assumptions: ['Authority is available.'],
      },
    ],
    sensitivity: [
      {
        changedInput: 'evidence availability',
        originalValue: 'unknown',
        alternateValue: 'confirmed_available',
        resultingScore: Math.min(1, internalScore + 0.04),
      },
    ],
    limitations: ['This is an analytical estimate, not a probability of identification.'],
  };
}

export function buildResidualCandidateSetAssessment(
  caseRecord: { candidateRecords: unknown[]; outsideCurrentCandidateSet?: { preserved: boolean; analyticalWeight: number; weightInterval: [number, number]; reasons: string[] } },
  metrics: { namedCandidatesEntered: number; verifiedExclusions: number; recordCoverageStatus: 'minimal' | 'partial' | 'substantial' | 'unknown' },
): ResidualCandidateSetAssessment {
  const candidateCountFactor = metrics.namedCandidatesEntered === 0 ? 0.24 : metrics.namedCandidatesEntered === 1 ? 0.18 : 0.1;
  const coverageFactor = metrics.recordCoverageStatus === 'minimal' ? 0.22 : metrics.recordCoverageStatus === 'partial' ? 0.12 : metrics.recordCoverageStatus === 'substantial' ? 0.05 : 0.14;
  const exclusionFactor = metrics.verifiedExclusions > 0 ? Math.min(0.12, metrics.verifiedExclusions * 0.03) : 0;
  const baseWeight = typeof caseRecord.outsideCurrentCandidateSet?.analyticalWeight === 'number'
    ? caseRecord.outsideCurrentCandidateSet.analyticalWeight
    : 0.42;
  const residualWeight = Math.max(0.1, Math.min(0.9, baseWeight + candidateCountFactor + coverageFactor - exclusionFactor));

  return {
    preserved: true,
    residualWeight,
    uncertainty: [0.1, 0.7],
    interpretation: 'comparative_analytical_weight_not_probability',
    reasons: [
      'No named candidates have been entered.',
      'Historical missing-person database coverage may be incomplete.',
      'The woman may never have been formally reported missing.',
      'A record may exist under another name or jurisdiction.',
      'Records from 1989–1991 may be fragmented or unavailable.',
    ],
    increasesWhen: [
      'candidate count is low',
      'record coverage is incomplete',
      'alias risk is high',
      'historical database coverage is poor',
      'no forensic comparisons are available',
    ],
    decreasesWhen: [
      'a broad and deduplicated candidate set is entered',
      'DNA, dental, or fingerprint comparisons are completed',
      'record jurisdictions are comprehensively searched',
      'verified exclusions reduce uncertainty',
    ],
    calculationInputs: [
      { inputId: 'candidate_count', label: 'Named candidates entered', value: metrics.namedCandidatesEntered, provenance: 'case metrics' },
      { inputId: 'coverage_status', label: 'Record coverage status', value: metrics.recordCoverageStatus, provenance: 'case metrics' },
      { inputId: 'verified_exclusions', label: 'Verified exclusions', value: metrics.verifiedExclusions, provenance: 'case metrics' },
    ],
    assumptions: ['The current case record set is incomplete.'],
    limitations: ['Residual weight is comparative and not a probability of identity.'],
  };
}
