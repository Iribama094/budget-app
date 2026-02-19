import type { ApiRequest, ApiResponse, Handler } from '../backend/_lib/http.js';
import { sendError } from '../backend/_lib/http.js';

import registerMod from '../backend/v1/auth/register.js';
import loginMod from '../backend/v1/auth/login.js';
import logoutMod from '../backend/v1/auth/logout.js';
import refreshMod from '../backend/v1/auth/refresh.js';
import authMeMod from '../backend/v1/auth/me.js';

import usersMeMod from '../backend/v1/users/me.js';

import taxCalcMod from '../backend/v1/tax/calc.js';
import taxRulesMod from '../backend/v1/tax/rules.js';

import budgetsIndexMod from '../backend/v1/budgets/index.js';
import budgetsIdMod from '../backend/v1/budgets/[id].js';
import budgetsMiniBudgetsMod from '../backend/v1/budgets/[id]/mini-budgets.js';

import transactionsIndexMod from '../backend/v1/transactions/index.js';
import transactionsIdMod from '../backend/v1/transactions/[id].js';

import goalsIndexMod from '../backend/v1/goals/index.js';
import goalsIdMod from '../backend/v1/goals/[id].js';

import analyticsSummaryMod from '../backend/v1/analytics/summary.js';

import bankLinksIndexMod from '../backend/v1/bank-links/index.js';
import bankLinksIdMod from '../backend/v1/bank-links/[id].js';

import importedTransactionsIndexMod from '../backend/v1/imported-transactions/index.js';
import importedTransactionsIdMod from '../backend/v1/imported-transactions/[id].js';

function unwrap(mod: any): Handler {
  const handler = mod && (mod.default || mod);
  if (!handler) throw new Error('Invalid handler module');
  return handler as Handler;
}

function wrapReq(req: ApiRequest, extraQuery: Record<string, any> = {}): ApiRequest {
  const baseQuery = req?.query && typeof req.query === 'object' ? req.query : {};
  const adaptedReq = Object.create(req);
  Object.defineProperty(adaptedReq, 'query', {
    value: { ...baseQuery, ...extraQuery },
    enumerable: true,
    configurable: true,
    writable: true
  });
  return adaptedReq as ApiRequest;
}

function getPathParts(req: ApiRequest): string[] {
  const raw = (req.query as any)?.path;
  if (Array.isArray(raw)) return raw.flatMap((p) => String(p).split('/')).map((p) => p.trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.length) {
    return raw
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [];
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const parts = getPathParts(req);
    const a = parts[0];
    const b = parts[1];
    const c = parts[2];

    // Auth
    if (a === 'auth' && b === 'register') return unwrap(registerMod)(req, res);
    if (a === 'auth' && b === 'login') return unwrap(loginMod)(req, res);
    if (a === 'auth' && b === 'logout') return unwrap(logoutMod)(req, res);
    if (a === 'auth' && b === 'refresh') return unwrap(refreshMod)(req, res);
    if (a === 'auth' && b === 'me') return unwrap(authMeMod)(req, res);

    // Users
    if (a === 'users' && b === 'me') return unwrap(usersMeMod)(req, res);

    // Tax
    if (a === 'tax' && b === 'calc') return unwrap(taxCalcMod)(req, res);
    if (a === 'tax' && b === 'rules') return unwrap(taxRulesMod)(req, res);

    // Analytics
    if (a === 'analytics' && b === 'summary') return unwrap(analyticsSummaryMod)(req, res);

    // Budgets
    if (a === 'budgets' && parts.length === 1) return unwrap(budgetsIndexMod)(req, res);
    if (a === 'budgets' && parts.length === 2) return unwrap(budgetsIdMod)(wrapReq(req, { id: b }), res);
    if (a === 'budgets' && parts.length === 3 && c === 'mini-budgets') {
      return unwrap(budgetsMiniBudgetsMod)(wrapReq(req, { id: b }), res);
    }

    // Transactions
    if (a === 'transactions' && parts.length === 1) return unwrap(transactionsIndexMod)(req, res);
    if (a === 'transactions' && parts.length === 2) return unwrap(transactionsIdMod)(wrapReq(req, { id: b }), res);

    // Goals
    if (a === 'goals' && parts.length === 1) return unwrap(goalsIndexMod)(req, res);
    if (a === 'goals' && parts.length === 2) return unwrap(goalsIdMod)(wrapReq(req, { id: b }), res);

    // Bank links
    if (a === 'bank-links' && parts.length === 1) return unwrap(bankLinksIndexMod)(req, res);
    if (a === 'bank-links' && parts.length === 2) return unwrap(bankLinksIdMod)(wrapReq(req, { id: b }), res);

    // Imported transactions
    if (a === 'imported-transactions' && parts.length === 1) return unwrap(importedTransactionsIndexMod)(req, res);
    if (a === 'imported-transactions' && parts.length === 2) {
      return unwrap(importedTransactionsIdMod)(wrapReq(req, { id: b }), res);
    }
    if (a === 'imported-transactions' && parts.length === 3) {
      return unwrap(importedTransactionsIdMod)(wrapReq(req, { id: b, action: c }), res);
    }

    return sendError(res, 404, 'NOT_FOUND', 'Route not found');
  } catch (err: any) {
    return sendError(res, 500, 'SERVER_ERROR', 'Unexpected error', { message: String(err?.message ?? err) });
  }
}
