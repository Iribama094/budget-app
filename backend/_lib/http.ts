import type { IncomingMessage, ServerResponse } from 'http';

export type ApiRequest = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = ServerResponse<IncomingMessage>;

export type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void;

export function sendJson(res: ApiResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function sendNoContent(res: ApiResponse): void {
  res.statusCode = 204;
  res.end();
}

export function sendError(res: ApiResponse, status: number, code: string, message: string, details?: unknown): void {
  sendJson(res, status, { error: { code, message, details } });
}

export async function readJson<T>(req: IncomingMessage & { body?: unknown }): Promise<T> {
  // Runtimes like vercel dev pre-parse JSON and expose it via a getter.
  // Accessing this getter can throw, so keep it wrapped.
  let maybeBody: unknown;
  try {
    maybeBody = (req as any).body;
  } catch {
    maybeBody = undefined;
  }

  if (maybeBody !== undefined && maybeBody !== null) {
    if (Buffer.isBuffer(maybeBody)) {
      const bodyRaw = maybeBody.toString('utf8').trim();
      if (!bodyRaw) return {} as T;
      try {
        return JSON.parse(bodyRaw) as T;
      } catch {
        return {} as T;
      }
    }

    if (typeof maybeBody === 'string') {
      const bodyRaw = maybeBody.trim();
      if (!bodyRaw) return {} as T;
      try {
        return JSON.parse(bodyRaw) as T;
      } catch {
        return {} as T;
      }
    }

    if (typeof maybeBody === 'object') return maybeBody as T;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export function methodNotAllowed(res: ApiResponse, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '));
  sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed', { allowed });
}
