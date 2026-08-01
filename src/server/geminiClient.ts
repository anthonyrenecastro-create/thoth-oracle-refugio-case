import type { ZodType } from 'zod';

export interface GeminiJsonRequest<T> {
  model: string;
  systemInstruction: string;
  prompt: string;
  schema: ZodType<T>;
  timeoutMs?: number;
}

export interface GeminiJsonResponse<T> {
  payload: T;
  rawText: string;
  tokenUsage: number;
  repaired: boolean;
}

function buildEndpoint(model: string): string {
  const encodedModel = encodeURIComponent(model);
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`;
}

async function postGemini(model: string, body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${buildEndpoint(model)}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractText(payload: unknown): string {
  const candidate = payload as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  return candidate.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

function extractTokenUsage(payload: unknown): number {
  const candidate = payload as { usageMetadata?: { totalTokenCount?: number } };
  return candidate.usageMetadata?.totalTokenCount ?? 0;
}

function parseJson<T>(rawText: string, schema: ZodType<T>): T {
  const parsed = JSON.parse(rawText) as unknown;
  return schema.parse(parsed);
}

export async function generateGeminiJson<T>(request: GeminiJsonRequest<T>): Promise<GeminiJsonResponse<T>> {
  const timeoutMs = request.timeoutMs ?? 30_000;
  const baseBody = {
    systemInstruction: {
      parts: [{ text: request.systemInstruction }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: request.prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      responseMimeType: 'application/json',
    },
  };

  const initialResponse = await postGemini(request.model, baseBody, timeoutMs);
  if (!initialResponse.ok) {
    throw new Error(`Gemini request failed with status ${initialResponse.status}.`);
  }

  const initialPayload = await initialResponse.json();
  const initialText = extractText(initialPayload);

  try {
    return {
      payload: parseJson(initialText, request.schema),
      rawText: initialText,
      tokenUsage: extractTokenUsage(initialPayload),
      repaired: false,
    };
  } catch (initialError) {
    const repairPrompt = [
      'Repair the following JSON so it becomes valid JSON that matches the requested schema.',
      'Return JSON only.',
      '',
      initialText,
    ].join('\n');

    const repairResponse = await postGemini(request.model, {
      ...baseBody,
      contents: [{ role: 'user', parts: [{ text: repairPrompt }] }],
    }, timeoutMs);

    if (!repairResponse.ok) {
      throw initialError;
    }

    const repairPayload = await repairResponse.json();
    const repairText = extractText(repairPayload);

    return {
      payload: parseJson(repairText, request.schema),
      rawText: repairText,
      tokenUsage: extractTokenUsage(repairPayload),
      repaired: true,
    };
  }
}

export function hasGeminiConfiguration(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && (process.env.GEMINI_MODEL_BASELINE || process.env.GEMINI_MODEL_NARRATIVE));
}