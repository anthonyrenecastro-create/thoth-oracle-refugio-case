import type { IdentityCase } from '../data/refugioCase';
import type { AccessMode } from '../types/identityForensics';
import type { IdentityAnalysisSettings, IdentityTwinResult } from '../types/identityAnalysis';
import { runBaselineIdentityTwin, runHrmIdentityTwin, runTwinBundle, compareTwinResults } from '../server/identityTwinEngine';

export type IdentityRunOutput = IdentityTwinResult;

export async function buildIdentityRunOutput(caseRecord: IdentityCase | { identityCase?: IdentityCase }, settings?: { fixtureMode?: boolean }): Promise<IdentityRunOutput> {
  const normalizedCase = 'identityCase' in caseRecord && caseRecord.identityCase ? caseRecord.identityCase : caseRecord as IdentityCase;
  return runBaselineIdentityTwin({
    caseRecord: normalizedCase,
    accessMode: 'public_analysis',
    settings: settings as IdentityAnalysisSettings,
  });
}

export async function buildPublicBrief(caseRecord: IdentityCase | { identityCase?: IdentityCase }, accessMode: string) {
  const normalizedCase = 'identityCase' in caseRecord && caseRecord.identityCase ? caseRecord.identityCase : caseRecord as IdentityCase;
  const access = accessMode === 'authorized_investigator' ? 'authorized_investigator' : 'public_analysis';
  const summary = access === 'authorized_investigator'
    ? `${normalizedCase.title} - authorized case review build.`
    : `${normalizedCase.title} - official public summary.`;

  return {
    caseId: normalizedCase.id,
    title: normalizedCase.title,
    summary,
    facts: [
      normalizedCase.discovery.discoveredOn,
      normalizedCase.discovery.locationDescription,
      normalizedCase.deathContext.approximateDeathInterval,
    ],
    accessMode: access,
  };
}

export {
  runBaselineIdentityTwin,
  runHrmIdentityTwin,
  runTwinBundle,
  compareTwinResults,
};