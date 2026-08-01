import { describe, expect, it } from 'vitest';
import { REFUGIO_CASE } from '../../data/refugioCase';
import { buildCoverageSummaryCards, buildInvestigatorExportPayload } from './investigatorExport';

describe('investigator export summary helpers', () => {
  it('builds a concise coverage summary from the case seed', () => {
    const cards = buildCoverageSummaryCards(REFUGIO_CASE);

    expect(cards.some((card) => card.label === 'Named candidates')).toBe(true);
    expect(cards.some((card) => card.label === 'Record coverage')).toBe(true);
    expect(cards.some((card) => card.label === 'Review decisions')).toBe(true);
  });

  it('builds a downloadable investigator export payload', () => {
    const payload = buildInvestigatorExportPayload(REFUGIO_CASE);

    expect(payload.caseId).toBe(REFUGIO_CASE.id);
    expect(payload.criticalUnknowns).toHaveLength(1);
    expect(payload.humanReviewDecisions).toHaveLength(1);
    expect(payload.recordSearchCoverage).toHaveLength(1);
  });
});
