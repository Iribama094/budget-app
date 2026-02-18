import express from 'express';
import cors from 'cors';

import registerMod from '../backend/v1/auth/register';
import loginMod from '../backend/v1/auth/login';
import logoutMod from '../backend/v1/auth/logout';
import refreshMod from '../backend/v1/auth/refresh';
import authMeMod from '../backend/v1/auth/me';
import usersMeMod from '../backend/v1/users/me';

import taxCalcMod from '../backend/v1/tax/calc';
import taxRulesMod from '../backend/v1/tax/rules';

import budgetsIndexMod from '../backend/v1/budgets/index';
import budgetsIdMod from '../backend/v1/budgets/[id]';
import budgetsMiniBudgetsMod from '../backend/v1/budgets/[id]/mini-budgets';

import transactionsIndexMod from '../backend/v1/transactions/index';
import transactionsIdMod from '../backend/v1/transactions/[id]';

import goalsIndexMod from '../backend/v1/goals/index';
import goalsIdMod from '../backend/v1/goals/[id]';

import analyticsSummaryMod from '../backend/v1/analytics/summary';

import bankLinksIndexMod from '../backend/v1/bank-links/index';

import importedTransactionsIndexMod from '../backend/v1/imported-transactions/index';
import importedTransactionsIdMod from '../backend/v1/imported-transactions/[id]';

const app = express();
app.use(cors());
app.use(express.json());

function wrap(mod: any) {
  const handler = mod && (mod.default || mod);
  if (!handler) throw new Error('Invalid handler module');
  return (req: any, res: any) => {
    // The handlers under `api/` were originally written for Vercel functions,
    // where dynamic route params are exposed via `req.query`.
    // Under Express they live on `req.params`, and `req.query` may be read-only.
    // Create a lightweight shim request that merges params into query.
    const baseQuery = req?.query && typeof req.query === 'object' ? req.query : {};
    const baseParams = req?.params && typeof req.params === 'object' ? req.params : {};
    const adaptedReq = Object.create(req);
    Object.defineProperty(adaptedReq, 'query', {
      value: { ...baseQuery, ...baseParams },
      enumerable: true,
      configurable: true,
      writable: true
    });

    return Promise.resolve(handler(adaptedReq, res)).catch((err) => {
    console.error('Handler error', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'SERVER_ERROR', details: String(err?.message ?? err) }));
    });
  };
}

// Auth
app.all('/v1/auth/register', wrap(registerMod));
app.all('/v1/auth/login', wrap(loginMod));
app.all('/v1/auth/logout', wrap(logoutMod));
app.all('/v1/auth/refresh', wrap(refreshMod));
app.all('/v1/auth/me', wrap(authMeMod));

// Users
app.all('/v1/users/me', wrap(usersMeMod));

// Tax
app.all('/v1/tax/calc', wrap(taxCalcMod));
app.all('/v1/tax/rules', wrap(taxRulesMod));

// Budgets
app.all('/v1/budgets', wrap(budgetsIndexMod));
app.all('/v1/budgets/:id', wrap(budgetsIdMod));
app.all('/v1/budgets/:id/mini-budgets', wrap(budgetsMiniBudgetsMod));

// Transactions
app.all('/v1/transactions', wrap(transactionsIndexMod));
app.all('/v1/transactions/:id', wrap(transactionsIdMod));

// Goals
app.all('/v1/goals', wrap(goalsIndexMod));
app.all('/v1/goals/:id', wrap(goalsIdMod));

// Analytics
app.all('/v1/analytics/summary', wrap(analyticsSummaryMod));

// Bank links
app.all('/v1/bank-links', wrap(bankLinksIndexMod));

// Imported transactions
app.all('/v1/imported-transactions', wrap(importedTransactionsIndexMod));
app.all('/v1/imported-transactions/:id', wrap(importedTransactionsIdMod));
app.all('/v1/imported-transactions/:id/:action', wrap(importedTransactionsIdMod));

// Fallback for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

const PORT = Number(process.env.PORT || process.env.HTTP_PORT || 3002);
app.listen(PORT, () => console.log(`API container listening on port ${PORT}`));

export default app;
