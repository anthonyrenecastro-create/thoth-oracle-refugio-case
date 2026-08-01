import { useEffect, useMemo, useState } from 'react';
import { REFUGIO_CASE, type IdentityCase } from './data/refugioCase';
import type { IdentityTwinRunBundle, IdentityTwinRunResponse, AnalysisExecutionStatus } from './types/identityAnalysis';
import type { AccessMode } from './types/identityForensics';
import { RefugioDashboard } from './components/forensic/RefugioDashboard';

const emptyStatus: AnalysisExecutionStatus = {
  requestedMode: 'live',
  actualMode: 'live',
  liveAttempted: false,
  liveSucceeded: false,
  fallbackAllowed: false,
  fallbackUsed: false,
  startedAt: new Date().toISOString(),
};

function formatStatusLabel(status: AnalysisExecutionStatus | null) {
  if (!status) return 'READY';
  if (status.actualMode === 'failed') return 'FAILED';
  if (status.actualMode === 'fixture') return 'COMPLETE';
  return 'COMPLETE';
}

function buildSummaryText(bundle: IdentityTwinRunBundle) {
  const agreements = bundle.comparison.sharedHypotheses.length > 0
    ? bundle.comparison.sharedHypotheses.join('; ')
    : 'The twins did not surface a shared testable hypothesis.';
  const disagreements = bundle.comparison.disagreements.length > 0
    ? bundle.comparison.disagreements.map((item) => item.disputedOutput).join('; ')
    : 'The twins did not surface a major disagreement.';
  const topAction = bundle.baseline.recommendedNextAction.action || bundle.hrm.recommendedNextAction.action;
  const limitations = [...new Set([...bundle.baseline.limitations, ...bundle.hrm.limitations])];

  return [
    `Investigator Summary for ${bundle.baseline.analysisSnapshot.caseId}`,
    '',
    'Verified facts:',
    ...bundle.baseline.caseUnderstanding.establishedFacts.map((fact) => `- ${fact}`),
    '',
    'Current unknowns:',
    ...bundle.baseline.informationGaps.slice(0, 5).map((gap) => `- ${gap.title}: ${gap.reason}`),
    '',
    'Candidates entered:',
    ...bundle.baseline.candidateAssessments.map((candidate) => `- ${candidate.label}`),
    '',
    'Where the twins agree:',
    `- ${agreements}`,
    '',
    'Where the twins disagree:',
    `- ${disagreements}`,
    '',
    'New testable findings:',
    ...bundle.baseline.newAnalyticalFindings.concat(bundle.hrm.newAnalyticalFindings).slice(0, 5).map((finding) => `- ${finding.statement}`),
    '',
    'Highest-value next action:',
    `- ${topAction}`,
    '',
    'Limitations:',
    ...limitations.map((item) => `- ${item}`),
  ].join('\n');
}

export default function App() {
  const [caseRecord, setCaseRecord] = useState<IdentityCase>(REFUGIO_CASE);
  const [accessMode, setAccessMode] = useState<AccessMode>('public_analysis');
  const [analysisResponse, setAnalysisResponse] = useState<IdentityTwinRunResponse | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisExecutionStatus | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false);
  const [summaryPreview, setSummaryPreview] = useState('');

  useEffect(() => {
    fetch('/api/identity/cases/default')
      .then((response) => response.json())
      .then((payload) => {
        if (payload.caseRecord) {
          setCaseRecord(payload.caseRecord as IdentityCase);
        }
      })
      .catch(() => setCaseRecord(REFUGIO_CASE));
  }, []);

  const bundle = analysisResponse?.bundle ?? null;
  const currentStatusLabel = analysisLoading ? 'ANALYZING' : formatStatusLabel(analysisStatus);
  const namedCandidatesEntered = bundle?.baseline.analysisSnapshot ? caseRecord.candidateRecords.length : caseRecord.candidateRecords.length;
  const topAction = bundle ? bundle.hrm.recommendedNextAction.action : caseRecord.forensicActions[0]?.title ?? 'Review the case facts before analysis';
  const criticalGaps = useMemo(() => {
    if (!bundle) {
      return caseRecord.criticalUnknowns?.slice(0, 3).map((unknown) => `${unknown.title}: ${unknown.whyItMatters}`) ?? [];
    }
    return bundle.hrm.informationGaps.slice(0, 3).map((gap) => `${gap.title}: ${gap.reason}`);
  }, [bundle, caseRecord.criticalUnknowns]);

  const runAnalysis = async (mode: 'live' | 'fixture') => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisStatus({
      ...emptyStatus,
      requestedMode: mode,
      actualMode: mode,
      liveAttempted: mode === 'live',
      liveSucceeded: false,
      fallbackAllowed: mode === 'fixture',
      fallbackUsed: false,
      startedAt: new Date().toISOString(),
    });
    setAnalysisResponse(null);

    try {
      const response = await fetch('/api/identity/run-twins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseRecord,
          accessMode,
          settings: { fixtureMode: mode === 'fixture' },
        }),
      });

      const payload = await response.json() as IdentityTwinRunResponse;
      setAnalysisStatus(payload.executionStatus);

      if (payload.bundle) {
        setAnalysisResponse(payload);
        setSummaryPreview(buildSummaryText(payload.bundle));
        return;
      }

      setAnalysisError(payload.failureMessage ?? 'Analysis was not completed. No new conclusions were produced.');
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Live analysis could not be completed. No new conclusions were generated.');
      setAnalysisStatus({
        ...emptyStatus,
        requestedMode: mode,
        actualMode: 'failed',
        liveAttempted: mode === 'live',
        liveSucceeded: false,
        fallbackAllowed: false,
        fallbackUsed: false,
        failureCode: 'request_failed',
        failureMessage: 'Live analysis could not be completed. No case conclusions were generated.',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    } finally {
      setAnalysisLoading(false);
      setTechnicalDetailsOpen(false);
    }
  };

  const findings = bundle
    ? [...bundle.baseline.newAnalyticalFindings, ...bundle.hrm.newAnalyticalFindings].filter((finding) => finding.noveltyStatus !== 'seeded')
    : [];

  const summaryDownload = () => {
    if (!bundle) return;
    const blob = new Blob([summaryPreview || buildSummaryText(bundle)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${caseRecord.id}-investigator-summary.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {analysisStatus?.actualMode === 'fixture' ? (
        <div className="border-b border-amber-700/40 bg-amber-950/80 px-4 py-2 text-sm font-semibold tracking-wide text-amber-200">
          TRAINING DEMONSTRATION - SYNTHETIC OUTPUT
        </div>
      ) : null}
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
        <section className="rounded-2xl border border-cyan-500/20 bg-slate-900/80 p-4 shadow-2xl shadow-cyan-950/10 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">Case Status</div>
              <h1 className="mt-1 text-2xl font-semibold">THOTH Identity & Homicide Reconstruction Oracle</h1>
              <p className="mt-1 text-sm text-slate-400">Guided case review for police investigators</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Current analysis status</div>
              <div className="mt-1 text-lg font-semibold">{currentStatusLabel}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Unidentified</div>
              <div className="mt-1 text-sm font-semibold">Refugio County Unidentified Woman</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Discovery date</div>
              <div className="mt-1 text-sm font-semibold">March 2, 1992</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Estimated death period</div>
              <div className="mt-1 text-sm font-semibold">Approximately 1989-1991</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Named candidates entered</div>
              <div className="mt-1 text-sm font-semibold">{namedCandidatesEntered}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Highest-value next action</div>
              <div className="mt-1 text-sm font-semibold">{topAction}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 lg:col-span-2">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Critical information gaps</div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {criticalGaps.length > 0 ? criticalGaps.map((gap) => (
                  <div key={gap} className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-sm text-slate-300">
                    {gap}
                  </div>
                )) : (
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-sm text-slate-300 md:col-span-3">No critical gaps listed.</div>
                )}
              </div>
            </div>
          </div>

          {analysisStatus?.actualMode === 'failed' ? (
            <div className="mt-4 rounded-xl border border-rose-700/40 bg-rose-950/50 p-3 text-sm text-rose-100">
              Live analysis could not be completed. No new conclusions were generated.
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em]" onClick={() => runAnalysis('live')}>
                  Retry live analysis
                </button>
                <button type="button" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em]" onClick={() => setTechnicalDetailsOpen(true)}>
                  Review connection/settings
                </button>
                <button type="button" className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em]" onClick={() => runAnalysis('fixture')}>
                  Run demonstration mode
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runAnalysis('live')}
              disabled={analysisLoading}
              className="rounded-xl border border-cyan-500/50 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-60"
            >
              Analyze Current Case
            </button>
            <button
              type="button"
              onClick={() => runAnalysis('fixture')}
              disabled={analysisLoading}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-60"
            >
              Run Demonstration Mode
            </button>
            <button
              type="button"
              onClick={() => setTechnicalDetailsOpen((current) => !current)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-300"
            >
              {technicalDetailsOpen ? 'Hide technical details' : 'Show technical details'}
            </button>
            {bundle && analysisStatus?.actualMode !== 'fixture' ? (
              <button
                type="button"
                onClick={summaryDownload}
                className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100"
              >
                Create Investigator Summary
              </button>
            ) : null}
          </div>

          <div className="mt-3 text-sm text-slate-400">
            {analysisLoading ? 'Reviewing evidence • Checking contradictions • Comparing identity pathways • Prioritizing next actions • Preparing investigator summary' : ''}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold">Step 1 - Review case facts</h2>
            <p className="mt-2 text-sm text-slate-400">Confirm the public case information. Correct any error before analysis.</p>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div>Discovery: {caseRecord.discovery.discoveredOn}</div>
              <div>Location: {caseRecord.discovery.locationDescription}</div>
              <div>Recovery context: {caseRecord.discovery.recoveryContext}</div>
              <div>Guardrails: {caseRecord.guardrails[0]}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold">Step 2 - Add what is known</h2>
            <p className="mt-2 text-sm text-slate-400">Enter candidate records, forensic results, records searched, or known exclusions before running analysis.</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-300">
              <div>Candidate records already entered: {caseRecord.candidateRecords.length}</div>
              <div>Forensic actions already listed: {caseRecord.forensicActions.length}</div>
              <div>Record searches already listed: {(caseRecord.recordSearchCoverage ?? []).length}</div>
              <div>Known exclusions already listed: {(caseRecord.candidateRecords ?? []).filter((candidate) => candidate.disposition.includes('excluded')).length}</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="text-lg font-semibold">Step 4 - Review results</h2>
          {!bundle ? (
            <p className="mt-2 text-sm text-slate-400">Run both analytical twins to review agreements, disagreements, and suggested next actions.</p>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">What both twins agree on</div>
                <div className="mt-2 text-sm text-slate-300">
                  {bundle.comparison.sharedHypotheses.length > 0 ? bundle.comparison.sharedHypotheses[0] : 'The twins did not surface a shared testable hypothesis.'}
                </div>
                <div className="mt-2 text-sm text-slate-500">Why it matters: shared findings help separate durable signals from one-off speculation.</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Where the twins disagree</div>
                <div className="mt-2 text-sm text-slate-300">
                  {bundle.comparison.disagreements[0]?.disputedOutput ?? 'The twins did not surface a major disagreement.'}
                </div>
                <div className="mt-2 text-sm text-slate-500">Review the evidence and assumptions that caused the difference.</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">New testable findings</div>
                <div className="mt-2 text-sm text-slate-300">
                  {findings.length > 0 ? findings[0].statement : 'No new testable analytical finding was produced from the current evidence.'}
                </div>
                <div className="mt-2 text-sm text-slate-500">What this does not mean: no finding is an identity declaration or a suspect accusation.</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Best next authorized action</div>
                <div className="mt-2 text-sm text-slate-300">{bundle.hrm.recommendedNextAction.action}</div>
                <div className="mt-2 text-sm text-slate-500">{bundle.hrm.recommendedNextAction.reason}</div>
              </div>
            </div>
          )}
          {analysisError ? (
            <div className="mt-4 rounded-xl border border-amber-700/40 bg-amber-950/50 p-3 text-sm text-amber-200">{analysisError}</div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="text-lg font-semibold">Step 5 - Record investigator decision</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {['Follow up', 'Request records', 'Request forensic review', 'Needs more information', 'Already known', 'Not useful', 'Reject finding'].map((decision) => (
              <button key={decision} type="button" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-200">
                {decision}
              </button>
            ))}
          </div>
        </section>

        {bundle ? (
          <details open={technicalDetailsOpen} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">Advanced technical details</summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
                <div>Run ID: {bundle.runId}</div>
                <div>Case hash: {bundle.caseStateHash}</div>
                <div>Execution mode: {analysisStatus?.actualMode ?? 'live'}</div>
                <div>Latency: {bundle.baseline.runMetadata.latencyMs} ms</div>
                <div>Token usage: {bundle.baseline.runMetadata.tokenUsage + bundle.hrm.runMetadata.tokenUsage}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
                <div className="font-semibold">Show technical details</div>
                <div className="mt-2 text-slate-400">{summaryPreview || buildSummaryText(bundle)}</div>
              </div>
            </div>
          </details>
        ) : null}

        <details className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Advanced technical details</summary>
          <div className="mt-4 text-sm text-slate-400">
            Gemini, HRM, JSON schemas, and scoring details are kept here for auditability. The main workflow stays plain language.
          </div>
          {analysisStatus?.actualMode === 'fixture' ? (
            <div className="mt-4 rounded-xl border border-amber-700/40 bg-amber-950/40 p-3 text-sm text-amber-200">
              Official investigator export is disabled in demonstration mode.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
              <RefugioDashboard
                caseRecord={caseRecord}
                onCaseRecordChange={setCaseRecord}
                accessMode={accessMode}
                onAccessModeChange={setAccessMode}
              />
            </div>
          )}
        </details>
      </main>
    </div>
  );
}
