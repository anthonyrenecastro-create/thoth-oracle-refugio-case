import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import pino from 'pino';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { REFUGIO_CASE, type IdentityCase } from '../data/refugioCase';
import type { AccessMode } from '../types/identityForensics';
import type { IdentityAnalysisSettings, IdentityTwinResult, IdentityTwinRunBundle, IdentityTwinRunResponse } from '../types/identityAnalysis';
import { runTwinADirectAnalysis, runTwinBAnalysis, runTwinBundle, compareTwinResults } from './identityTwinEngine';

const PORT = 3000;

const logger = pino({
  redact: ['req.headers.authorization', '*.apiKey', '*.token', '*.password', '*.secret'],
});

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const identityPayloadSchema = {
  type: 'object',
  required: ['caseRecord', 'accessMode', 'settings'],
  properties: {
    caseRecord: {
      type: 'object',
      required: ['id', 'title', 'evidence', 'candidateRecords', 'searchProfiles', 'unknowns'],
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        evidence: { type: 'array', maxItems: 1000 },
        candidateRecords: { type: 'array', maxItems: 500 },
        searchProfiles: { type: 'array', maxItems: 200 },
        unknowns: { type: 'array', maxItems: 300 },
      },
      additionalProperties: true,
    },
    accessMode: { type: 'string', enum: ['public_analysis', 'authorized_investigator'] },
    settings: {
      type: 'object',
      required: ['fixtureMode'],
      properties: {
        fixtureMode: { type: 'boolean' },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: false,
} as const;

const validateIdentityPayload = ajv.compile(identityPayloadSchema);

type StoredRun = {
  payload: IdentityTwinResult | IdentityTwinRunBundle | Record<string, unknown>;
  caseId: string;
  caseStateHash: string;
};

const runStore = new Map<string, StoredRun>();
const latestRunByCaseId = new Map<string, { runId: string; caseStateHash: string }>();

const rateState = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 45;

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const current = rateState.get(ip);
  if (!current || current.resetAt < now) {
    rateState.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  if (current.count >= RATE_MAX) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' });
  }
  current.count += 1;
  return next();
}

function normalizeSettings(settings?: { fixtureMode?: boolean } | null): IdentityAnalysisSettings {
  return {
    fixtureMode: settings?.fixtureMode ?? true,
  };
}

function isTwinResult(payload: StoredRun['payload']): payload is IdentityTwinResult {
  return Boolean((payload as IdentityTwinResult).runMetadata?.runId && (payload as IdentityTwinResult).analysisSnapshot);
}

function buildFailureResponse(errorMessage: string, executionStatus: IdentityTwinRunResponse['executionStatus']): IdentityTwinRunResponse {
  return {
    executionStatus,
    failureMessage: errorMessage,
  };
}

function markStaleness(payload: StoredRun['payload'], caseId: string, caseStateHash: string) {
  const latest = latestRunByCaseId.get(caseId);
  const current = latest?.caseStateHash === caseStateHash;

  if (isTwinResult(payload)) {
    return {
      ...payload,
      staleness: {
        current,
        reason: current ? 'Case evidence is current.' : 'Case evidence changed - rerun required.',
      },
    };
  }

  if (payload && typeof payload === 'object' && 'baseline' in payload && 'hrm' in payload) {
    const bundle = payload as Awaited<ReturnType<typeof runTwinBundle>>;
    return {
      ...bundle,
      baseline: {
        ...bundle.baseline,
        staleness: {
          current,
          reason: current ? 'Case evidence is current.' : 'Case evidence changed - rerun required.',
        },
      },
      hrm: {
        ...bundle.hrm,
        staleness: {
          current,
          reason: current ? 'Case evidence is current.' : 'Case evidence changed - rerun required.',
        },
      },
    };
  }

  return payload;
}

function storeRun(runId: string, caseRecord: IdentityCase, payload: StoredRun['payload']) {
  runStore.set(runId, {
    payload,
    caseId: caseRecord.id,
    caseStateHash: isTwinResult(payload)
      ? payload.analysisSnapshot.caseStateHash
      : (payload as Awaited<ReturnType<typeof runTwinBundle>>).caseStateHash,
  });
  const stored = runStore.get(runId);
  if (stored) {
    latestRunByCaseId.set(caseRecord.id, { runId, caseStateHash: stored.caseStateHash });
  }
}

function briefFromCase(caseRecord: IdentityCase, accessMode: AccessMode) {
  const evidenceCount = caseRecord.evidence.length;
  const candidateCount = caseRecord.candidateRecords.length;
  return {
    caseId: caseRecord.id,
    title: caseRecord.title,
    summary: accessMode === 'authorized_investigator'
      ? `${caseRecord.title} - authorized case review build.`
      : `${caseRecord.title} - official public summary.`,
    facts: [
      caseRecord.discovery.discoveredOn,
      caseRecord.discovery.locationDescription,
      caseRecord.deathContext.approximateDeathInterval,
    ],
    evidenceCount,
    candidateCount,
    accessMode,
  };
}

export function createIdentityServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/identity', rateLimit);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      defaultBaselineModel: process.env.GEMINI_MODEL_BASELINE || 'gemini-2.5-flash',
      defaultNarrativeModel: process.env.GEMINI_MODEL_NARRATIVE || 'gemini-2.5-flash',
      fixtureModeAvailable: true,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/identity/cases/default', (_req, res) => {
    res.json({ caseRecord: REFUGIO_CASE });
  });

  app.post('/api/identity/cases/validate', (req, res) => {
    const payload = req.body as { caseRecord?: unknown; accessMode?: AccessMode; settings?: { fixtureMode?: boolean } };
    if (!payload.caseRecord) {
      return res.status(400).json({ valid: false, errors: ['Missing caseRecord'] });
    }

    if (!validateIdentityPayload({ caseRecord: payload.caseRecord, accessMode: payload.accessMode ?? 'public_analysis', settings: payload.settings ?? { fixtureMode: true } })) {
      return res.status(400).json({ valid: false, errors: validateIdentityPayload.errors });
    }

    return res.json({ valid: true, warnings: [] });
  });

  app.post('/api/identity/run-baseline', async (req, res) => {
    const payload = req.body as { caseRecord?: unknown; accessMode?: AccessMode; settings?: { fixtureMode?: boolean } };
    if (!validateIdentityPayload({ caseRecord: payload.caseRecord, accessMode: payload.accessMode ?? 'public_analysis', settings: payload.settings ?? { fixtureMode: true } })) {
      return res.status(400).json({ error: 'Invalid request', details: validateIdentityPayload.errors });
    }

    const caseRecord = payload.caseRecord as IdentityCase;
    const settings = normalizeSettings(payload.settings);

    try {
      const outcome = await runTwinADirectAnalysis({ caseRecord, accessMode: payload.accessMode ?? 'public_analysis', settings });
      if (!outcome.bundle) {
        return res.status(200).json(buildFailureResponse(
          outcome.failureMessage ?? 'Live analysis could not be completed. No case conclusions were generated.',
          outcome.executionStatus,
        ));
      }

      storeRun(outcome.bundle.runMetadata.runId, caseRecord, outcome.bundle);
      return res.json({
        executionStatus: outcome.executionStatus,
        bundle: markStaleness(outcome.bundle, caseRecord.id, outcome.bundle.runMetadata.caseStateHash),
      });
    } catch (error) {
      logger.error({ error }, 'identity run-baseline failed');
      return res.status(500).json(buildFailureResponse('Live analysis could not be completed. No case conclusions were generated.', {
        requestedMode: settings.fixtureMode ? 'fixture' : 'live',
        actualMode: 'failed',
        liveAttempted: !settings.fixtureMode,
        liveSucceeded: false,
        fallbackAllowed: settings.fixtureMode,
        fallbackUsed: false,
        failureCode: error instanceof Error ? error.name : 'baseline_failed',
        failureMessage: error instanceof Error ? error.message : 'Live analysis could not be completed. No case conclusions were generated.',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }));
    }
  });

  app.post('/api/identity/run-hrm', async (req, res) => {
    const payload = req.body as { caseRecord?: unknown; accessMode?: AccessMode; settings?: { fixtureMode?: boolean } };
    if (!validateIdentityPayload({ caseRecord: payload.caseRecord, accessMode: payload.accessMode ?? 'public_analysis', settings: payload.settings ?? { fixtureMode: true } })) {
      return res.status(400).json({ error: 'Invalid request', details: validateIdentityPayload.errors });
    }

    const caseRecord = payload.caseRecord as IdentityCase;
    const settings = normalizeSettings(payload.settings);

    try {
      const outcome = await runTwinBAnalysis({ caseRecord, accessMode: payload.accessMode ?? 'public_analysis', settings });
      if (!outcome.bundle) {
        return res.status(200).json(buildFailureResponse(
          outcome.failureMessage ?? 'Live analysis could not be completed. No case conclusions were generated.',
          outcome.executionStatus,
        ));
      }

      storeRun(outcome.bundle.runMetadata.runId, caseRecord, outcome.bundle);
      return res.json({
        executionStatus: outcome.executionStatus,
        bundle: markStaleness(outcome.bundle, caseRecord.id, outcome.bundle.runMetadata.caseStateHash),
      });
    } catch (error) {
      logger.error({ error }, 'identity run-hrm failed');
      return res.status(500).json(buildFailureResponse('Live analysis could not be completed. No case conclusions were generated.', {
        requestedMode: settings.fixtureMode ? 'fixture' : 'live',
        actualMode: 'failed',
        liveAttempted: !settings.fixtureMode,
        liveSucceeded: false,
        fallbackAllowed: settings.fixtureMode,
        fallbackUsed: false,
        failureCode: error instanceof Error ? error.name : 'hrm_failed',
        failureMessage: error instanceof Error ? error.message : 'Live analysis could not be completed. No case conclusions were generated.',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }));
    }
  });

  app.post('/api/identity/run-twins', async (req, res) => {
    const payload = req.body as { caseRecord?: unknown; accessMode?: AccessMode; settings?: { fixtureMode?: boolean } };
    if (!validateIdentityPayload({ caseRecord: payload.caseRecord, accessMode: payload.accessMode ?? 'public_analysis', settings: payload.settings ?? { fixtureMode: true } })) {
      return res.status(400).json({ error: 'Invalid request', details: validateIdentityPayload.errors });
    }

    const caseRecord = payload.caseRecord as IdentityCase;
    const settings = normalizeSettings(payload.settings);

    try {
      const [baselineOutcome, hrmOutcome] = await Promise.all([
        runTwinADirectAnalysis({ caseRecord, accessMode: payload.accessMode ?? 'public_analysis', settings }),
        runTwinBAnalysis({ caseRecord, accessMode: payload.accessMode ?? 'public_analysis', settings }),
      ]);

      if (!baselineOutcome.bundle || !hrmOutcome.bundle) {
        const failureOutcome = baselineOutcome.bundle ? hrmOutcome : baselineOutcome;
        return res.status(200).json(buildFailureResponse(
          failureOutcome.failureMessage ?? 'Live analysis could not be completed. No case conclusions were generated.',
          failureOutcome.executionStatus,
        ));
      }

      const bundle = {
        runId: `${baselineOutcome.bundle.runMetadata.runId}:${hrmOutcome.bundle.runMetadata.runId}`,
        caseStateHash: baselineOutcome.bundle.runMetadata.caseStateHash,
        snapshot: baselineOutcome.bundle.analysisSnapshot,
        baseline: baselineOutcome.bundle,
        hrm: hrmOutcome.bundle,
        comparison: compareTwinResults(baselineOutcome.bundle, hrmOutcome.bundle),
        mode: baselineOutcome.executionStatus.actualMode === 'live' && hrmOutcome.executionStatus.actualMode === 'live' ? 'live' : 'fixture',
      } as IdentityTwinRunBundle;

      storeRun(bundle.runId, caseRecord, bundle);
      storeRun(bundle.baseline.runMetadata.runId, caseRecord, bundle.baseline);
      storeRun(bundle.hrm.runMetadata.runId, caseRecord, bundle.hrm);

      const actualMode = baselineOutcome.executionStatus.actualMode === 'live' && hrmOutcome.executionStatus.actualMode === 'live'
        ? 'live'
        : 'fixture';

      return res.json({
        executionStatus: {
          requestedMode: settings.fixtureMode ? 'fixture' : 'live',
          actualMode,
          liveAttempted: !settings.fixtureMode,
          liveSucceeded: actualMode === 'live',
          fallbackAllowed: settings.fixtureMode,
          fallbackUsed: false,
          startedAt: baselineOutcome.executionStatus.startedAt,
          completedAt: new Date().toISOString(),
        },
        bundle: markStaleness(bundle, caseRecord.id, bundle.caseStateHash),
      });
    } catch (error) {
      logger.error({ error }, 'identity run-twins failed');
      return res.status(500).json(buildFailureResponse('Live analysis could not be completed. No case conclusions were generated.', {
        requestedMode: settings.fixtureMode ? 'fixture' : 'live',
        actualMode: 'failed',
        liveAttempted: !settings.fixtureMode,
        liveSucceeded: false,
        fallbackAllowed: settings.fixtureMode,
        fallbackUsed: false,
        failureCode: error instanceof Error ? error.name : 'twins_failed',
        failureMessage: error instanceof Error ? error.message : 'Live analysis could not be completed. No case conclusions were generated.',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }));
    }
  });

  app.get('/api/identity/runs/:runId', (req, res) => {
    const { runId } = req.params;
    const run = runStore.get(runId);
    if (!run) {
      return res.status(404).json({ error: 'Run ID not found.' });
    }
    return res.json(markStaleness(run.payload, run.caseId, run.caseStateHash));
  });

  app.post('/api/identity/candidates/compare', (req, res) => {
    const payload = req.body as { twinAResult?: IdentityTwinResult; twinBResult?: IdentityTwinResult };
    if (!payload.twinAResult || !payload.twinBResult) {
      return res.status(400).json({ error: 'Missing twin results to compare.' });
    }
    return res.json(compareTwinResults(payload.twinAResult, payload.twinBResult));
  });

  app.post('/api/identity/actions/rank', (req, res) => {
    const payload = req.body as { caseRecord?: IdentityCase; accessMode?: AccessMode; settings?: { fixtureMode?: boolean } };
    const caseRecord = payload.caseRecord ?? REFUGIO_CASE;
    return res.json({ brief: briefFromCase(caseRecord, payload.accessMode ?? 'public_analysis') });
  });

  app.post('/api/identity/public-brief', (req, res) => {
    const payload = req.body as { caseRecord?: IdentityCase; accessMode?: AccessMode };
    const caseRecord = payload.caseRecord ?? REFUGIO_CASE;
    return res.json(briefFromCase(caseRecord, payload.accessMode ?? 'public_analysis'));
  });

  return app;
}

export async function startIdentityServer() {
  const app = createIdentityServer();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'THOTH Forensic Twin Arena server listening');
  });
}