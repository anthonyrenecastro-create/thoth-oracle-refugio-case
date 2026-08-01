import { describe, expect, it } from 'vitest';
import { IDENTITY_FIXTURE_CASE } from '../data/identityFixtureCase';
import { REFUGIO_CASE } from '../data/refugioCase';
import { buildResidualCandidateSetAssessment } from './identityScoring';
import { compareTwinResults, runBaselineIdentityTwin, runHrmIdentityTwin, runTwinBundle } from '../server/identityTwinEngine';

describe('identity twin engine', () => {
  it('labels fixture output and keeps the twins independent', async () => {
    const baseline = await runBaselineIdentityTwin({ caseRecord: IDENTITY_FIXTURE_CASE, accessMode: 'public_analysis', settings: { fixtureMode: true } });
    const hrm = await runHrmIdentityTwin({ caseRecord: IDENTITY_FIXTURE_CASE, accessMode: 'public_analysis', settings: { fixtureMode: true } });

    expect(baseline.runMetadata.mode).toBe('fixture');
    expect(baseline.runMetadata.syntheticLabel).toBe('Synthetic fixture output');
    expect(hrm.runMetadata.mode).toBe('fixture');
    expect(hrm.runMetadata.syntheticLabel).toBe('Synthetic fixture output');
    expect(baseline.identityProfiles.map((profile) => profile.profileId)).not.toEqual(hrm.identityProfiles.map((profile) => profile.profileId));
    expect(baseline.forensicActionPriorities[0]?.actionId).not.toEqual(hrm.forensicActionPriorities[0]?.actionId);
  });

  it('uses the submitted case state and changes when evidence changes', async () => {
    const firstRun = await runBaselineIdentityTwin({ caseRecord: IDENTITY_FIXTURE_CASE, accessMode: 'public_analysis', settings: { fixtureMode: true } });
    const tweakedCase = {
      ...IDENTITY_FIXTURE_CASE,
      evidence: [...IDENTITY_FIXTURE_CASE.evidence, {
        id: 'E_SYNTH_EXTRA',
        title: 'Extra synthetic evidence',
        description: 'A controlled evidence addition for sensitivity testing.',
        category: 'records' as const,
        provenance: IDENTITY_FIXTURE_CASE.provenance,
        accessLevel: 'public' as const,
        independenceGroup: 'fixture_extra',
      }],
    };
    const secondRun = await runBaselineIdentityTwin({ caseRecord: tweakedCase, accessMode: 'public_analysis', settings: { fixtureMode: true } });

    expect(firstRun.analysisSnapshot.caseStateHash).not.toEqual(secondRun.analysisSnapshot.caseStateHash);
    expect(firstRun.residualCandidateSetAssessment.residualWeight).not.toEqual(secondRun.residualCandidateSetAssessment.residualWeight);
  });

  it('produces a comparison bundle with disagreements', async () => {
    const bundle = await runTwinBundle({ caseRecord: IDENTITY_FIXTURE_CASE, accessMode: 'public_analysis', settings: { fixtureMode: true } });
    const comparison = compareTwinResults(bundle.baseline, bundle.hrm);

    expect(bundle.caseStateHash).toBe(bundle.baseline.analysisSnapshot.caseStateHash);
    expect(bundle.caseStateHash).toBe(bundle.hrm.analysisSnapshot.caseStateHash);
    expect(comparison.hypothesisOverlap).toBeGreaterThanOrEqual(0);
    expect(comparison.disagreements.length).toBeGreaterThan(0);
  });

  it('keeps residual weight dynamic for the submitted case', () => {
    const sparseResidual = buildResidualCandidateSetAssessment(REFUGIO_CASE, { namedCandidatesEntered: 0, verifiedExclusions: 0, recordCoverageStatus: 'partial' });
    const denserResidual = buildResidualCandidateSetAssessment(REFUGIO_CASE, { namedCandidatesEntered: 3, verifiedExclusions: 2, recordCoverageStatus: 'substantial' });

    expect(sparseResidual.residualWeight).not.toEqual(denserResidual.residualWeight);
    expect(sparseResidual.interpretation).toContain('not_probability');
  });
});