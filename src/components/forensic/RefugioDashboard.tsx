import { useMemo, useState } from 'react';
import type { IdentityCase } from '../../data/refugioCase';
import type { AccessMode } from '../../types/identityForensics';
import { buildCoverageSummaryCards, buildInvestigatorExportPayload } from './investigatorExport';
import { ScoreExplanationDrawer } from './ScoreExplanationDrawer';

interface Props {
  caseRecord: IdentityCase;
  onCaseRecordChange: (next: IdentityCase) => void;
  accessMode: AccessMode;
  onAccessModeChange: (next: AccessMode) => void;
}

const tabs = ['overview', 'profiles', 'actions', 'provenance'] as const;
type TabKey = (typeof tabs)[number];

export function RefugioDashboard({ caseRecord, accessMode, onAccessModeChange }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [focus, setFocus] = useState<'dna' | 'records' | 'outreach' | 'reconstruction'>('dna');
  const publicMode = accessMode === 'public_analysis';

  const focusHints = useMemo(() => ({
    dna: {
      title: 'DNA and biological confirmation',
      description: 'The highest-value action remains confirming whether a usable DNA profile exists and whether the relevant biological materials can be reviewed.',
      signal: 'Highest priority',
    },
    records: {
      title: 'Candidate record reconciliation',
      description: 'Cross-reference NamUs, agency repositories, and adjacent county records while preserving a non-speculative narrative.',
      signal: 'Operationally useful',
    },
    outreach: {
      title: 'Public lead brief',
      description: 'When public release is appropriate, release a guarded summary that avoids naming or implying identity.',
      signal: 'Communication ready',
    },
    reconstruction: {
      title: 'Bounded reconstruction',
      description: 'Keep reconstruction questions narrow and evidence-based so the case does not drift into unsupported speculation.',
      signal: 'Guarded analysis',
    },
  }), []);

  const nextAction = (caseRecord.forensicActions ?? [])[0]?.title ?? 'Review the case records and preserve the outside-candidate-set posture';
  const profiles = caseRecord.searchProfiles ?? [];
  const actions = caseRecord.forensicActions ?? [];
  const provenanceSources = caseRecord.provenance ?? [];
  const guardrails = caseRecord.guardrails ?? [];
  const coverageCards = useMemo(() => buildCoverageSummaryCards(caseRecord), [caseRecord]);
  const exportPayload = useMemo(() => buildInvestigatorExportPayload(caseRecord), [caseRecord]);

  const downloadExport = () => {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${caseRecord.id}-investigator-export.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">THOTH Identity & Homicide Reconstruction Oracle</h1>
            <p className="text-sm text-slate-400">Twin-model decision support for unidentified-remains cold cases</p>
            <p className="mt-2 text-sm text-slate-300">“Given the currently available evidence and candidate records, what authorized action would most reduce uncertainty about the woman’s identity?”</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
            <div className="font-semibold">Access mode</div>
            <select
              className="mt-1 rounded border border-slate-600 bg-slate-900 px-2 py-1"
              value={accessMode}
              onChange={(event) => onAccessModeChange(event.target.value as AccessMode)}
            >
              <option value="public_analysis">Public Analysis Mode</option>
              <option value="authorized_investigator">Authorized Investigator Mode</option>
            </select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        {publicMode ? (
          <section className="rounded-xl border border-amber-700/40 bg-amber-950/60 p-4 text-sm text-amber-200">
            Public-data evaluation build. Do not upload confidential, protected, genetic, medical, or law-enforcement-sensitive information.
          </section>
        ) : null}

        <section className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Identity status</div>
            <div className="mt-1 text-lg font-semibold">Unidentified</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Discovery date</div>
            <div className="mt-1 text-lg font-semibold">March 2, 1992</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Estimated death interval</div>
            <div className="mt-1 text-lg font-semibold">approximately 1989–1991</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Focus signal</div>
            <div className="mt-1 text-sm font-semibold">{focusHints[focus].signal}</div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${activeTab === tab ? 'border-cyan-500 bg-cyan-500/15 text-cyan-300' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
              >
                {tab === 'overview' ? 'Overview' : tab === 'profiles' ? 'Profiles' : tab === 'actions' ? 'Actions' : 'Provenance'}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              {activeTab === 'overview' ? (
                <>
                  <h2 className="text-lg font-semibold">Current decision posture</h2>
                  <p className="mt-2 text-sm text-slate-400">{caseRecord.title} remains unresolved, but the strongest next move is to {nextAction.toLowerCase()}.</p>
                  <div className="mt-4 space-y-2">
                    {(['dna', 'records', 'outreach', 'reconstruction'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setFocus(option)}
                        className={`w-full rounded-lg border p-3 text-left text-sm transition ${focus === option ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-800 bg-slate-900 text-slate-300'}`}
                      >
                        <div className="font-semibold capitalize">{option.replace(/([A-Z])/g, ' $1')}</div>
                        <div className="mt-1 text-slate-400">{focusHints[option].description}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {activeTab === 'profiles' ? (
                <>
                  <h2 className="text-lg font-semibold">Identity profiles</h2>
                  <div className="mt-3 space-y-2">
                    {profiles.map((profile) => (
                      <div key={profile.profileId} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
                        <div className="font-semibold">{profile.title}</div>
                        <div className="mt-1 text-slate-400">Profile class: {profile.profileClass ?? 'unspecified'}</div>
                        <div className="mt-1 text-slate-400">{profile.description}</div>
                        <div className="mt-1 text-slate-400">Jurisdictions: {profile.jurisdictionsToSearch?.join(', ') ?? 'not specified'}</div>
                        <div className="mt-1 text-slate-400">Records needed: {profile.recordsNeeded?.join(', ') ?? 'not specified'}</div>
                        <div className="mt-1 text-slate-400">Blockers: {profile.evidenceThatWouldWeakenProfile?.join(', ') ?? 'not specified'}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {activeTab === 'actions' ? (
                <>
                  <h2 className="text-lg font-semibold">Priority actions</h2>
                  <div className="mt-3 space-y-2">
                    {actions.map((action) => (
                      <div key={action.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
                        <div className="font-semibold">{action.title}</div>
                        <div className="mt-1 text-slate-400">Category: {action.category ?? 'unspecified'}</div>
                        <div className="mt-1 text-slate-400">Expected information gain: {(action.expectedInformationGain ?? 0).toFixed(2)}</div>
                        <div className="text-slate-400">Availability: {action.availability}</div>
                        <ScoreExplanationDrawer
                          title={action.title}
                          meaning={action.purpose ?? 'See action rationale below.'}
                          isProbability={false}
                          version={action.informationGain?.scoringVersion ?? 'identity-v1'}
                          factors={action.informationGain?.basis ?? []}
                          provenance={action.supportingEvidenceIds?.join(', ') || 'case facts'}
                          assumptions={action.assumptions ?? []}
                          sensitivityRange={action.informationGain?.scoreInterval ? `${action.informationGain.scoreInterval[0]}–${action.informationGain.scoreInterval[1]}` : 'not specified'}
                          increaseText={action.positiveResultNextSteps?.join('; ') || 'No positive next steps listed.'}
                          decreaseText={action.negativeResultNextSteps?.join('; ') || 'No negative next steps listed.'}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {activeTab === 'provenance' ? (
                <>
                  <h2 className="text-lg font-semibold">Source provenance</h2>
                  <div className="mt-3 space-y-2">
                    {provenanceSources.map((source, index) => (
                      <div key={`${source.citationOrRecordId}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
                        <div className="font-semibold">{source.sourceLabel}</div>
                        <div className="mt-1 text-slate-400">Type: {source.type}</div>
                        <div className="text-slate-400">Access: {source.accessLevel}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div className="space-y-4">
              <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Active focus</div>
                <h3 className="mt-1 text-lg font-semibold">{focusHints[focus].title}</h3>
                <p className="mt-2 text-sm text-slate-400">{focusHints[focus].description}</p>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="text-lg font-semibold">Case facts at a glance</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-300">
                  <div><span className="text-slate-500">Jurisdiction:</span> {caseRecord.jurisdiction}</div>
                  <div><span className="text-slate-500">Discovery date:</span> {caseRecord.discovery.discoveredOn}</div>
                  <div><span className="text-slate-500">Estimated age:</span> {caseRecord.biologicalProfile.estimatedAge}</div>
                  <div><span className="text-slate-500">Broad ancestry estimate:</span> {caseRecord.biologicalProfile.ancestryEstimate}</div>
                  <div><span className="text-slate-500">Current named candidates:</span> {caseRecord.candidateRecords.length > 0 ? caseRecord.candidateRecords.length : 'user-defined'}</div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">Investigator export</h3>
                  <button
                    type="button"
                    onClick={downloadExport}
                    className="rounded border border-cyan-700 bg-cyan-900/40 px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200"
                  >
                    Download JSON
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {coverageCards.map((card) => (
                    <div key={card.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{card.label}</div>
                      <div className="mt-1 text-lg font-semibold text-slate-100">{card.value}</div>
                      <div className="mt-1 text-xs text-slate-400">{card.detail}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="text-lg font-semibold">Critical unknowns</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">
                  {(caseRecord.criticalUnknowns ?? []).map((unknown) => (
                    <li key={unknown.id}>{unknown.title}: {unknown.whyItMatters}</li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="text-lg font-semibold">Guardrails</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">
                  {guardrails.map((guardrail) => (
                    <li key={guardrail}>{guardrail}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
