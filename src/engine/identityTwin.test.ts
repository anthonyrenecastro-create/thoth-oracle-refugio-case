import { describe, expect, it } from 'vitest';
import { REFUGIO_SYNTHETIC_FIXTURE } from '../data/fixtures/refugioSyntheticFixture';
import { REFUGIO_CASE } from '../data/refugioCase';
import { buildResidualCandidateSetAssessment } from './identityScoring';
import { compareTwinResults, runBaselineIdentityTwin, runHrmIdentityTwin, runTwinADirectAnalysis, runTwinBAnalysis, runTwinBundle } from '../server/identityTwinEngine';

describe('identity twin engine', () => {
  it('uses the synthetic fixture only when demonstration mode is explicitly requested', async () => {
    const baseline = await runTwinADirectAnalysis({ caseRecord: REFUGIO_SYNTHETIC_FIXTURE, accessMode: 'public_analysis', settings: { fixtureMode: true } });
    const hrm = await runTwinBAnalysis({ caseRecord: REFUGIO_SYNTHETIC_FIXTURE, accessMode: 'public_analysis', settings: { fixtureMode: true } });

    expect(baseline.executionStatus.actualMode).toBe('fixture');
    expect(baseline.executionStatus.fallbackUsed).toBe(false);
    expect(baseline.bundle?.runMetadata.syntheticLabel).toBe('Synthetic fixture output');
    expect(hrm.executionStatus.actualMode).toBe('fixture');
    expect(hrm.bundle?.runMetadata.syntheticLabel).toBe('Synthetic fixture output');
    expect(baseline.bundle?.identityProfiles.map((profile) => profile.profileId)).not.toEqual(hrm.bundle?.identityProfiles.map((profile) => profile.profileId));
    expect(baseline.bundle?.forensicActionPriorities[0]?.actionId).not.toEqual(hrm.bundle?.forensicActionPriorities[0]?.actionId);
  });

  it('falls back to fixture output when live analysis is requested without a live Gemini run', async () => {
    const baseline = await runTwinADirectAnalysis({ caseRecord: REFUGIO_SYNTHETIC_FIXTURE, accessMode: 'public_analysis', settings: { fixtureMode: false } });

    expect(baseline.executionStatus.requestedMode).toBe('live');
    expect(baseline.executionStatus.actualMode).toBe('fixture');
    expect(baseline.executionStatus.liveAttempted).toBe(true);
    expect(baseline.executionStatus.liveSucceeded).toBe(false);
    expect(baseline.executionStatus.fallbackAllowed).toBe(true);
    expect(baseline.executionStatus.fallbackUsed).toBe(true);
    expect(baseline.failureMessage).toContain('demonstration-mode conclusions were generated instead');
    expect(baseline.bundle?.runMetadata.mode).toBe('fixture');
  });

  it('uses the submitted case state and changes when evidence changes', async () => {
    const firstRun = await runTwinADirectAnalysis({ caseRecord: REFUGIO_SYNTHETIC_FIXTURE, accessMode: 'public_analysis', settings: { fixtureMode: true } });
    const tweakedCase = {
      ...REFUGIO_SYNTHETIC_FIXTURE,
      evidence: [...REFUGIO_SYNTHETIC_FIXTURE.evidence, {
        id: 'E_SYNTH_EXTRA',
        title: 'Extra synthetic evidence',
        description: 'A controlled evidence addition for sensitivity testing.',
        category: 'records' as const,
        provenance: REFUGIO_SYNTHETIC_FIXTURE.provenance,
        accessLevel: 'public' as const,
        independenceGroup: 'fixture_extra',
      }],
    };
    const secondRun = await runTwinADirectAnalysis({ caseRecord: tweakedCase, accessMode: 'public_analysis', settings: { fixtureMode: true } });

    expect(firstRun.bundle?.analysisSnapshot.caseStateHash).not.toEqual(secondRun.bundle?.analysisSnapshot.caseStateHash);
    expect(firstRun.bundle?.residualCandidateSetAssessment.residualWeight).not.toEqual(secondRun.bundle?.residualCandidateSetAssessment.residualWeight);
  });

  it('produces a comparison bundle with disagreements', async () => {
    const bundle = await runTwinBundle({ caseRecord: REFUGIO_SYNTHETIC_FIXTURE, accessMode: 'public_analysis', settings: { fixtureMode: true } });
    const comparison = compareTwinResults(bundle.baseline, bundle.hrm);

    expect(bundle.caseStateHash).toBe(bundle.baseline.analysisSnapshot.caseStateHash);
    expect(bundle.caseStateHash).toBe(bundle.hrm.analysisSnapshot.caseStateHash);
    expect(comparison.hypothesisOverlap).toBeGreaterThanOrEqual(0);
    expect(comparison.disagreements.length).toBeGreaterThan(0);
  });

  it('keeps residual weight dynamic for the real case seed', () => {
    const sparseResidual = buildResidualCandidateSetAssessment(REFUGIO_CASE, { namedCandidatesEntered: 0, verifiedExclusions: 0, recordCoverageStatus: 'partial' });
    const denserResidual = buildResidualCandidateSetAssessment(REFUGIO_CASE, { namedCandidatesEntered: 3, verifiedExclusions: 2, recordCoverageStatus: 'substantial' });

    expect(sparseResidual.residualWeight).not.toEqual(denserResidual.residualWeight);
    expect(sparseResidual.interpretation).toContain('not_probability');
  });

  it('continues to support the legacy baseline and hrm wrappers for fixture analysis', async () => {
    const baseline = await runBaselineIdentityTwin({ caseRecord: REFUGIO_SYNTHETIC_FIXTURE, accessMode: 'public_analysis', settings: { fixtureMode: true } });
    const hrm = await runHrmIdentityTwin({ caseRecord: REFUGIO_SYNTHETIC_FIXTURE, accessMode: 'public_analysis', settings: { fixtureMode: true } });

    expect(baseline.runMetadata.mode).toBe('fixture');
    expect(hrm.runMetadata.mode).toBe('fixture');
  });
});
