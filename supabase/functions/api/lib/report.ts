// Telling somebody when the API breaks.
//
// Until now a 500 went to the function log and stayed there, so a fault was only ever found by a person
// going to look. That also means we could not honestly say we would notice a breach, and the Nigeria Data
// Protection Act gives 72 hours from becoming aware of one. Becoming aware has to be automatic.
//
// Inert until SENTRY_DSN is set, so nothing leaves the project before somebody decides it should.
const DSN = Deno.env.get('SENTRY_DSN') ?? '';
const ENVIRONMENT = Deno.env.get('SENTRY_ENVIRONMENT') ?? 'production';
const RELEASE = Deno.env.get('API_VERSION') ?? 'dev';

/** Parsed once: https://<key>@<host>/<project> becomes the envelope URL and the auth header. */
const target = (() => {
  if (!DSN) return null;
  try {
    const u = new URL(DSN);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      key: u.username
    };
  } catch {
    console.error('[report] SENTRY_DSN is set but is not a valid DSN, so nothing will be reported');
    return null;
  }
})();

export const reportingOn = target !== null;

/** Anything that looks like a secret or a person, removed before the error leaves the building. */
const SECRET = /(password|token|secret|key|authorization|apikey|cookie|bearer)/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_DIGITS = /\b\d{7,}\b/g;

function scrub(text: string): string {
  return text.replace(EMAIL, '[email]').replace(LONG_DIGITS, '[number]');
}

/**
 * Sends one error. Never throws and never waits on the caller's path: a reporting outage must not become an
 * outage. `userId` is sent as an id only, because an id is enough to find the person in our own database and
 * tells a third party nothing by itself.
 */
export function reportError(
  err: unknown,
  context: { route?: string; method?: string; userId?: string | null; extra?: Record<string, unknown> } = {}
): void {
  if (!target) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context.extra ?? {})) {
    extra[k] = SECRET.test(k) ? '[removed]' : typeof v === 'string' ? scrub(v) : v;
  }

  const body = JSON.stringify({
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    logger: 'api',
    environment: ENVIRONMENT,
    release: RELEASE,
    server_name: 'edge-api',
    transaction: context.route ?? null,
    user: context.userId ? { id: context.userId } : undefined,
    tags: { method: context.method ?? '', route: context.route ?? '' },
    extra,
    exception: {
      values: [
        {
          type: error.name,
          value: scrub(error.message).slice(0, 2000),
          stacktrace: error.stack ? { frames: [{ function: scrub(error.stack).slice(0, 4000) }] } : undefined
        }
      ]
    }
  });

  // Fire and forget. A failure to report is logged and nothing more.
  fetch(target.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=budgetfriendly-api/1.0, sentry_key=${target.key}`
    },
    body,
    signal: AbortSignal.timeout(4000)
  }).catch((e) => console.error('[report] could not send', String(e).slice(0, 200)));
}
