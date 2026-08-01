export type ARCColor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ARCGrid = ARCColor[][];

export interface ARCExample {
  input: ARCGrid;
  output: ARCGrid;
}

export interface ARCPuzzle {
  id: string;
  name: string;
  description: string;
  training: ARCExample[];
  test: Array<{
    input: ARCGrid;
    expectedOutput?: ARCGrid;
  }>;
  source?: 'bundled' | 'uploaded' | 'custom';
}

export interface TransformationHypothesis {
  id: string;
  name: string;
  description: string;
  ruleSteps: string[];
  predictedTrainingOutputs: ARCGrid[];
  predictedTestOutput: ARCGrid;
  trainingExactMatches: number;
  trainingCellAccuracy: number;
  confidence: number;
  complexity: number;
  contradictions: string[];
  evidence: string[];
  parentHypothesisId?: string;
  proposer?: string;
}

export interface SolverMetrics {
  startedAt: number;
  completedAt?: number;
  latencyMs?: number;
  apiCalls: number;
  reasoningRounds: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  hypothesesGenerated: number;
  hypothesesRejected: number;
  revisions: number;
  trainingExactMatch: boolean;
  testExactMatch?: boolean;
  testCellAccuracy?: number;
  validGrid: boolean;
  error?: string;
}

export interface BaselineSolverResponse {
  solverType: 'gemini_baseline';
  puzzleId: string;
  predictedOutput: ARCGrid;
  ruleSummary: string;
  reasoningSteps: string[];
  confidence: number;
  metrics: SolverMetrics;
}

export interface HRMSolverResponse {
  solverType: 'gemini_hrm';
  puzzleId: string;
  predictedOutput: ARCGrid;
  committedHypothesis?: TransformationHypothesis;
  hypothesesLedger: TransformationHypothesis[];
  reasoningRounds: number;
  metrics: SolverMetrics;
}

export interface ARCBenchmarkRecord {
  runId: string;
  timestamp: string;
  puzzleId: string;
  model: string;
  seed: number;
  mode: 'race' | 'sequential';
  executionOrder?: Array<'gemini_baseline' | 'gemini_hrm'>;
  baselineBudgetMode: 'single_pass' | 'equal_call_budget';
  baseline: SolverMetrics;
  hrm: SolverMetrics;
  winner: {
    correctness: string;
    speed: string;
    apiEfficiency: string;
    tokenEfficiency: string;
    overall: string;
  };
}
