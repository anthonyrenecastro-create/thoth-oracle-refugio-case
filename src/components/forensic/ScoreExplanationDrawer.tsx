import { useState } from 'react';

interface Props {
  title: string;
  meaning: string;
  isProbability: boolean;
  version: string;
  factors: Array<{
    factor: string;
    contribution: number;
    explanation: string;
  }>;
  provenance: string;
  assumptions: string[];
  sensitivityRange: string;
  increaseText: string;
  decreaseText: string;
}

export function ScoreExplanationDrawer({ title, meaning, isProbability, version, factors, provenance, assumptions, sensitivityRange, increaseText, decreaseText }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
      <button type="button" className="text-sm font-semibold text-cyan-300" onClick={() => setOpen((current) => !current)}>
        {open ? 'Hide' : 'Show'} score explanation
      </button>
      {open ? (
        <div className="mt-2 space-y-2 text-sm text-slate-400">
          <div><span className="font-semibold text-slate-200">Score name:</span> {title}</div>
          <div><span className="font-semibold text-slate-200">Score meaning:</span> {meaning}</div>
          <div><span className="font-semibold text-slate-200">Probability:</span> {isProbability ? 'No' : 'No — this is a comparative analytical score, not a probability.'}</div>
          <div><span className="font-semibold text-slate-200">Calculation version:</span> {version}</div>
          <div><span className="font-semibold text-slate-200">Input factors:</span></div>
          <ul className="list-disc pl-5">
            {factors.map((factor) => (
              <li key={factor.factor}>{factor.factor}: {factor.contribution.toFixed(2)} — {factor.explanation}</li>
            ))}
          </ul>
          <div><span className="font-semibold text-slate-200">Provenance:</span> {provenance}</div>
          <div><span className="font-semibold text-slate-200">Assumptions:</span> {assumptions.join('; ')}</div>
          <div><span className="font-semibold text-slate-200">Sensitivity range:</span> {sensitivityRange}</div>
          <div><span className="font-semibold text-slate-200">What would increase it:</span> {increaseText}</div>
          <div><span className="font-semibold text-slate-200">What would decrease it:</span> {decreaseText}</div>
        </div>
      ) : null}
    </div>
  );
}
