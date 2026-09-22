import { apiFetch } from './client';

/** A business owner's team (docs/team-access.md). What each role can do is decided on the server. */
export type TeamRole = 'sales' | 'purchases' | 'hr' | 'manager' | 'accountant';

export const ROLES: Array<{ key: TeamRole; label: string; line: string }> = [
  { key: 'sales', label: 'Sales', line: 'Records sales and invoices, sees customers. Not costs, profit or pay.' },
  { key: 'purchases', label: 'Purchases', line: 'Records costs and supplier bills. Not sales, profit or pay.' },
  { key: 'hr', label: 'HR and payroll', line: 'Staff, pay runs and payslips. Nothing else.' },
  { key: 'manager', label: 'Manager', line: 'Runs the day to day. Not your bank, your own pay, or adding people.' },
  { key: 'accountant', label: 'Accountant', line: 'Sees everything, including reports and tax. Changes nothing.' }
];

/** A first guess at the role from a job title, e.g. "Cashier" is Sales. The owner can change it. */
export function suggestRole(title: string | null | undefined): TeamRole {
  const t = String(title ?? '').toLowerCase();
  if (/account|book|audit|finance/.test(t)) return 'accountant';
  if (/manag|supervis|head|lead/.test(t)) return 'manager';
  if (/hr|human|people|payroll|admin/.test(t)) return 'hr';
  if (/buy|purchas|procure|store|stock|inventory|supply/.test(t)) return 'purchases';
  return 'sales';
}

export type TeamMember = { id: string; name: string; role: TeamRole; roleLabel: string; joined: boolean; code: string | null; expired: boolean; staffId: string | null };
export type Membership = { id: string; ownerId: string; name: string; role: TeamRole; roleLabel: string };
export type ApiTeam = { members: TeamMember[]; businesses: Membership[]; own: { active: boolean; name: string } };

export const getTeam = (): Promise<ApiTeam> => apiFetch('/v1/team', { method: 'GET' });
export const addTeamMember = (input: { name: string; role: TeamRole; staffId?: string | null }): Promise<{ member: TeamMember; code: string; message: string }> =>
  apiFetch('/v1/team', { method: 'POST', body: JSON.stringify(input) });
export const updateTeamMember = (id: string, patch: { role?: TeamRole; name?: string }): Promise<{ member: TeamMember }> =>
  apiFetch(`/v1/team/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const removeTeamMember = (id: string) => apiFetch(`/v1/team/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const joinTeam = (code: string): Promise<{ ownerId: string; businessName: string; role: TeamRole; roleLabel: string }> =>
  apiFetch('/v1/team/join', { method: 'POST', body: JSON.stringify({ code }) });
