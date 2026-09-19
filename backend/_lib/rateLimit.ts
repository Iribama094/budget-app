import type { Db } from 'mongodb';
import { collections } from './collections.js';
import { sendError, type ApiResponse } from './http.js';

export type RateRule = { key: string; limit: number; windowSec: number };

/** Best-effort client IP behind Vercel / proxies. */
export function clientIp(req: { headers?: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const fwd = req.headers?.['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? String(fwd[0]) : typeof fwd === 'string' ? fwd : '').split(',')[0].trim();
  const real = typeof req.headers?.['x-real-ip'] === 'string' ? String(req.headers['x-real-ip']) : '';
  return first || real || req.socket?.remoteAddress || 'unknown';
}

/**
 * Fixed-window counter stored in MongoDB so limits hold across serverless instances.
 * Expired windows are removed by a TTL index (see indexes.ts).
 */
export async function hitRateLimit(db: Db, rule: RateRule): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const { rateLimits } = collections(db);
  const now = new Date();

  const current = await rateLimits.findOneAndUpdate({ _id: rule.key, expiresAt: { $gt: now } }, { $inc: { count: 1 } }, { returnDocument: 'after' });
  if (current) {
    return {
      allowed: current.count <= rule.limit,
      retryAfterSec: Math.max(1, Math.ceil((current.expiresAt.getTime() - now.getTime()) / 1000))
    };
  }

  // No live window: start one (also replaces a window the TTL monitor hasn't removed yet).
  await rateLimits.updateOne({ _id: rule.key }, { $set: { count: 1, expiresAt: new Date(now.getTime() + rule.windowSec * 1000) } }, { upsert: true });
  return { allowed: true, retryAfterSec: rule.windowSec };
}

function humanize(sec: number): string {
  if (sec < 90) return `${sec} seconds`;
  const min = Math.ceil(sec / 60);
  return `${min} minute${min === 1 ? '' : 's'}`;
}

/** Applies each rule in order; sends a 429 and returns false on the first one exceeded. */
export async function enforceRateLimits(db: Db, res: ApiResponse, rules: RateRule[]): Promise<boolean> {
  for (const rule of rules) {
    const out = await hitRateLimit(db, rule);
    if (!out.allowed) {
      res.setHeader('Retry-After', String(out.retryAfterSec));
      sendError(res, 429, 'RATE_LIMITED', `Too many attempts. Try again in ${humanize(out.retryAfterSec)}.`);
      return false;
    }
  }
  return true;
}
