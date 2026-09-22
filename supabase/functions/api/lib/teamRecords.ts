import { sql } from './db.ts';

/**
 * What the owner calls each team member ("Tunde"), for "recorded by" on transactions, invoices and bills.
 * Falls back to the member's own profile name, for anyone who has since left the team.
 */
export async function recorderNames(ownerId: string, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const rows = await sql<{ id: string; name: string | null }[]>`
    select p.id, coalesce(m.name, p.name, split_part(p.email, '@', 1)) as name
    from public.profiles p
    left join public.business_members m on m.owner_id = ${ownerId} and m.member_id = p.id
    where p.id in ${sql(wanted)}
  `;
  return new Map(rows.map((r) => [r.id, r.name ?? 'Someone']));
}
