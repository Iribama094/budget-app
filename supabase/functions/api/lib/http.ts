import { z } from 'npm:zod@3.25.76';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public headers?: Record<string, string>
  ) {
    super(message);
  }
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-name, x-device-platform, x-act-as',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
};

export function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...(headers ?? {}) }
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function errorResponse(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>): Response {
  return json(status, { error: { code, message, details } }, headers);
}

export function methodNotAllowed(allowed: string[]): never {
  throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', { allowed }, { Allow: allowed.join(', ') });
}

export function notFound(message: string): never {
  throw new HttpError(404, 'NOT_FOUND', message);
}

export function badRequest(message: string, code = 'VALIDATION_ERROR', details?: unknown): never {
  throw new HttpError(400, code, message, details);
}

export async function readJson(req: Request): Promise<unknown> {
  const raw = (await req.text().catch(() => '')).trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Parses a body with zod; failures become a 400 with the given message. */
export async function body<T extends z.ZodTypeAny>(req: Request, schema: T, message = 'Invalid request body'): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', message, parsed.error.issues);
  return parsed.data;
}

export type Space = 'personal' | 'business';

export function spaceParam(v: string | null | undefined): Space | undefined {
  return v === 'personal' || v === 'business' ? v : undefined;
}

export { z };
