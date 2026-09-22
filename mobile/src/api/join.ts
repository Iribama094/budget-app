import { apiFetch } from './client';
import type { ApiBudget } from './endpoints';

/** One box for any code: a shared budget, help with someone's money, or a business you work in. */
export type CodeKind = 'business' | 'helper' | 'budget';

export type CodeLook = { found: false; hint?: string } | { found: true; kind: CodeKind; name: string; detail: string };

export type CodeUsed = { kind: CodeKind; name: string; ownerId?: string; role?: string; roleLabel?: string; budgetId?: string; budget?: ApiBudget };

/** What a code is for, without using it up. */
export const lookUpCode = (code: string): Promise<CodeLook> => apiFetch(`/v1/join?code=${encodeURIComponent(code)}`, { method: 'GET' });

export const useCode = (code: string): Promise<CodeUsed> => apiFetch('/v1/join', { method: 'POST', body: JSON.stringify({ code }) });
