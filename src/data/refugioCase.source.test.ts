import { describe, expect, it } from 'vitest';
import { REFUGIO_CASE } from './refugioCase';

describe('Refugio case seed', () => {
  it('contains facts and unknowns but no preferred analytical scores', () => {
    expect(REFUGIO_CASE.searchProfiles[0].analyticalWeight).toBeNull();
    expect(REFUGIO_CASE.searchProfiles[0].expectedInformationGain).toBeNull();
    expect(REFUGIO_CASE.searchProfiles[0].internalInformationGainScore).toBeNull();
    expect(REFUGIO_CASE.forensicActions[0].expectedInformationGain).toBeNull();
    expect(REFUGIO_CASE.recordsActions[0].expectedInformationGain).toBeNull();
    expect(REFUGIO_CASE.outreachActions[0].expectedInformationGain).toBeNull();
    expect(REFUGIO_CASE.outsideCurrentCandidateSet.analyticalWeight).toBeNull();
  });

  it('keeps the real case in requires-analysis posture', () => {
    expect(REFUGIO_CASE.guardrails).toContain('A model score is not forensic evidence.');
    expect(REFUGIO_CASE.candidateRecords).toHaveLength(0);
    expect(Object.prototype.hasOwnProperty.call(REFUGIO_CASE, 'priorityScore')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(REFUGIO_CASE, 'preferredAction')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(REFUGIO_CASE, 'expectedWinner')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(REFUGIO_CASE, 'finalRank')).toBe(false);
  });
});
