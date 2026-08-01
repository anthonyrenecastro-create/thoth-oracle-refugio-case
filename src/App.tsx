import { useEffect, useState } from 'react';
import { REFUGIO_CASE } from './data/refugioCase';
import type { IdentityCase } from './data/refugioCase';
import { RefugioDashboard } from './components/forensic/RefugioDashboard';
import type { AccessMode } from './types/identityForensics';
import type { IdentityTwinRunBundle } from './types/identityAnalysis';

export default function App() {
  const [caseRecord, setCaseRecord] = useState<IdentityCase>(REFUGIO_CASE);
  const [accessMode, setAccessMode] = useState<AccessMode>('public_analysis');
  const [analysisBundle, setAnalysisBundle] = useState<IdentityTwinRunBundle | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/identity/cases/default')
      .then((response) => response.json())
      .then((payload) => {
        if (payload.caseRecord) {
          setCaseRecord(payload.caseRecord as IdentityCase);
        }
      })
      .catch(() => {
        setCaseRecord(REFUGIO_CASE);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setAnalysisLoading(true);
    setAnalysisError(null);

    fetch('/api/identity/run-twins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        caseRecord,
        accessMode,
        settings: { fixtureMode: false },
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Twin analysis request failed with status ${response.status}.`);
        }
        return response.json();
      })
      .then((payload) => {
        setAnalysisBundle(payload as IdentityTwinRunBundle);
      })
      .catch((error) => {
        if ((error as { name?: string }).name !== 'AbortError') {
          setAnalysisError(error instanceof Error ? error.message : 'Twin analysis request failed.');
        }
      })
      .finally(() => {
        setAnalysisLoading(false);
      });

    return () => controller.abort();
  }, [caseRecord, accessMode]);

  const findings = analysisBundle ? [...analysisBundle.baseline.newAnalyticalFindings, ...analysisBundle.hrm.newAnalyticalFindings] : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
        <section className="rounded-2xl border border-cyan-500/20 bg-slate-900/80 p-4 shadow-2xl shadow-cyan-950/10 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">New Analytical Findings from This Run</div>
              <h2 className="mt-1 text-xl font-semibold">Independent twin analysis</h2>
            </div>
            <div className="text-sm text-slate-400">
              {analysisLoading ? 'Running current case analysis...' : analysisBundle ? `Run ${analysisBundle.runId}` : 'Waiting for analysis'}
            </div>
          </div>

          {analysisError ? (
            <div className="mt-4 rounded-xl border border-amber-700/40 bg-amber-950/50 p-3 text-sm text-amber-200">
              {analysisError}
            </div>
          ) : null}

          {analysisBundle ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Twin A</div>
                <div className="mt-1 text-sm font-semibold">{analysisBundle.baseline.recommendedNextAction.action}</div>
                <div className="mt-2 text-sm text-slate-400">{analysisBundle.baseline.recommendedNextAction.reason}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Twin B</div>
                <div className="mt-1 text-sm font-semibold">{analysisBundle.hrm.recommendedNextAction.action}</div>
                <div className="mt-2 text-sm text-slate-400">{analysisBundle.hrm.recommendedNextAction.reason}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Disagreement</div>
                <div className="mt-1 text-sm font-semibold">{analysisBundle.comparison.disagreements[0]?.disputedOutput ?? 'No major disagreement surfaced'}</div>
                <div className="mt-2 text-sm text-slate-400">{analysisBundle.baseline.staleness?.current ? 'Current analysis for this case state.' : 'Case evidence changed - rerun required.'}</div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {findings.length > 0 ? findings.slice(0, 4).map((finding) => (
              <div key={finding.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{finding.category}</div>
                    <div className="mt-1 font-semibold text-slate-100">{finding.statement}</div>
                  </div>
                  <div className="rounded-full border border-cyan-700/50 bg-cyan-950/40 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-cyan-200">
                    {finding.noveltyStatus}
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-400">Generated by {finding.generatedBy}</div>
                <div className="mt-2 text-sm text-slate-500">Test: {finding.tests[0]?.action}</div>
              </div>
            )) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-400 lg:col-span-2">
                No new testable analytical finding was produced from the current public-data state.
              </div>
            )}
          </div>
        </section>

        <RefugioDashboard
          caseRecord={caseRecord}
          onCaseRecordChange={setCaseRecord}
          accessMode={accessMode}
          onAccessModeChange={setAccessMode}
        />
      </main>
    </div>
  );
}
