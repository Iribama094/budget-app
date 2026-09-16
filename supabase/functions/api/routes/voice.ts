import { requireAuth } from '../lib/auth.ts';
import { body, HttpError, json, methodNotAllowed, z } from '../lib/http.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import type { Ctx } from '../index.ts';

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_BYTES = 8 * 1024 * 1024;

const Schema = z.object({
  /** base64 audio, without a data: prefix */
  audio: z.string().min(100).max(12_000_000),
  mimeType: z.string().max(80).optional(),
  language: z.string().max(10).optional()
});

/** Turns a short voice note into text with Groq Whisper. */
async function transcribe(base64: string, mimeType: string, language: string): Promise<string> {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new HttpError(501, 'NOT_CONFIGURED', 'Voice notes aren’t switched on yet. Ask the app owner to add the AI key.');

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    throw new HttpError(400, 'VALIDATION_ERROR', 'That recording could not be read.');
  }
  if (!bytes.length) throw new HttpError(400, 'VALIDATION_ERROR', 'That recording is empty.');
  if (bytes.length > MAX_BYTES) throw new HttpError(413, 'TOO_LARGE', 'That recording is too long. Keep it under a minute.');

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), mimeType.includes('wav') ? 'note.wav' : 'note.m4a');
  form.append('model', Deno.env.get('GROQ_TRANSCRIBE_MODEL') ?? 'whisper-large-v3-turbo');
  form.append('language', language);
  form.append('response_format', 'json');

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(45000)
  });
  if (!res.ok) {
    console.error('[voice] groq error', res.status, (await res.text().catch(() => '')).slice(0, 400));
    throw new HttpError(502, 'PROVIDER_ERROR', 'Could not turn that into text. Try again.');
  }
  const out = await res.json();
  return String(out?.text ?? '').trim();
}

/** POST /v1/voice/transcribe — a short voice note becomes text, for Flux and for logging a transaction by voice. */
export async function voiceTranscribe(ctx: Ctx) {
  if (ctx.method !== 'POST') methodNotAllowed(['POST']);
  const { userId } = await requireAuth(ctx.req);
  const input = await body(ctx.req, Schema, 'Record a short voice note first');
  await enforceRateLimit({ key: `voice:${userId}`, limit: 60, windowSec: 60 * 60 });
  const text = await transcribe(input.audio, input.mimeType ?? 'audio/m4a', input.language ?? 'en');
  return json(200, { text });
}
