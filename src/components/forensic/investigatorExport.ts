import type { IdentityCase } from '../../data/refugioCase';

export interface CoverageSummaryCard {
  label: string;
  value: string;
  detail: string;
}

export interface InvestigatorExportPayload {
  caseId: string;
  title: string;
  coverageSummary: CoverageSummaryCard[];
  criticalUnknowns: Array<{ id: string; title: string; actionToResolve: string }>;
  humanReviewDecisions: Array<{ id: string; decision: string; rationale: string }>;
  recordSearchCoverage: Array<{ scopeName: string; status: string; systemsOrRepositories: string[] }>;
}

export function buildCoverageSummaryCards(caseRecord: IdentityCase): CoverageSummaryCard[] {
  const metrics = caseRecord.coverageMetrics;
  const reviewCount = caseRecord.humanReviewDecisions?.length ?? 0;
  const coverageStatus = metrics?.recordCoverageStatus ?? 'unknown';

  return [
    {
      label: 'Named candidates',
      value: String(metrics?.namedCandidatesEntered ?? 0),
      detail: 'Candidates entered into the active review set.',
    },
    {
      label: 'Record coverage',
      value: coverageStatus.replace(/_/g, ' '),
      detail: 'Current breadth of record and repository coverage.',
    },
    {
      label: 'Review decisions',
      value: String(reviewCount),
      detail: 'Human review decisions captured for the current workflow.',
    },
  ];
}

export function buildInvestigatorExportPayload(caseRecord: IdentityCase): InvestigatorExportPayload {
  return {
    caseId: caseRecord.id,
    title: caseRecord.title,
    coverageSummary: buildCoverageSummaryCards(caseRecord),
    criticalUnknowns: (caseRecord.criticalUnknowns ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      actionToResolve: item.actionToResolve,
    })),
    humanReviewDecisions: (caseRecord.humanReviewDecisions ?? []).map((item) => ({
      id: item.id,
      decision: item.decision,
      rationale: item.rationale,
    })),
    recordSearchCoverage: (caseRecord.recordSearchCoverage ?? []).map((item) => ({
      scopeName: item.scopeName,
      status: item.status,
      systemsOrRepositories: item.systemsOrRepositories,
    })),
  };
}
