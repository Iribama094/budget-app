import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { envNumber, requireEnv } from './env.js';

export type AccessTokenPayload = {
  sub: string;
  typ: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  sid: string;
  typ: 'refresh';
};

export function signAccessToken(userId: string): string {
  const secret = requireEnv('JWT_ACCESS_SECRET');
  const ttlMin = envNumber('JWT_ACCESS_TTL_MIN', 15);
  const payload: AccessTokenPayload = { sub: userId, typ: 'access' };
  return jwt.sign(payload, secret, { expiresIn: `${ttlMin}m` });
}

export function signRefreshToken(userId: string, sessionId: string): string {
  const secret = requireEnv('JWT_REFRESH_SECRET');
  const ttlDays = envNumber('JWT_REFRESH_TTL_DAYS', 30);
  const payload: RefreshTokenPayload = { sub: userId, sid: sessionId, typ: 'refresh' };
  return jwt.sign(payload, secret, { expiresIn: `${ttlDays}d` });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = requireEnv('JWT_ACCESS_SECRET');
  const decoded = jwt.verify(token, secret) as AccessTokenPayload;
  if (decoded.typ !== 'access') throw new Error('Invalid token type');
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const secret = requireEnv('JWT_REFRESH_SECRET');
  const decoded = jwt.verify(token, secret) as RefreshTokenPayload;
  if (decoded.typ !== 'refresh') throw new Error('Invalid token type');
  return decoded;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getBearerToken(req: { headers?: Record<string, unknown> }): string | null {
  const header = req.headers?.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Bearer' || !value) return null;
  return value;
}
