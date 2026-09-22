import { sql } from './db.ts';
import { addDaysIso, todayIso } from './dates.ts';
import { currencyFor, formatMoney, notifyUser } from './notify.ts';

/**
 * One message a day to each owner whose team recorded anything yesterday, instead of a ping per entry:
 * "Yesterday: Tunde recorded 14 sales (₦84,000). Ada recorded 3 costs (₦21,500)."
 */
export async function sendTeamDigests(today = todayIso()): Promise<{ owners: number }> {
  const day = addDaysIso(today, -1);
  // The app's day is West Africa Time (UTC+1): yesterday runs from 23:00 UTC the day before.
  const from = new Date(`${day}T00:00:00+01:00`);
  const to = new Date(`${today}T00:00:00+01:00`);
  type Row = { userId: string; createdBy: string; type: string; n: number; total: number; name: string | null };
  const rows: Row[] = await sql<Row[]>`
    select t.user_id, t.created_by, t.type, count(*)::int as n, sum(t.amount) as total, m.name
    from public.transactions t
    left join public.business_members m on m.owner_id = t.user_id and m.member_id = t.created_by
    where t.created_by is not null and t.space_id = 'business' and t.created_at >= ${from} and t.created_at < ${to}
    group by t.user_id, t.created_by, t.type, m.name
    order by t.user_id, m.name
  `;
  const byOwner = new Map<string, Row[]>();
  for (const r of rows) byOwner.set(r.userId, [...(byOwner.get(r.userId) ?? []), r]);

  for (const [owner, list] of byOwner) {
    const currency = await currencyFor(owner);
    const people = new Map<string, string[]>();
    for (const r of list) {
      const who = r.name ?? 'Someone';
      const what = `${r.n} ${r.type === 'income' ? (r.n === 1 ? 'sale' : 'sales') : r.n === 1 ? 'cost' : 'costs'} (${formatMoney(Number(r.total), currency)})`;
      people.set(who, [...(people.get(who) ?? []), what]);
    }
    const body = [...people.entries()].map(([who, parts]) => `${who} recorded ${parts.join(' and ')}.`).join(' ');
    await notifyUser(owner, {
      kind: 'shared',
      title: 'What your team recorded yesterday',
      body,
      spaceId: 'business',
      data: { screen: 'Transactions' },
      dedupeKey: `team-digest:${day}`,
      dedupeTtlSec: 2 * 86400
    }).catch(() => undefined);
  }
  return { owners: byOwner.size };
}
