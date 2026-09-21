import { sql } from './db.ts';
import { addDaysIso, todayIso } from './dates.ts';
import { currencyFor, formatMoney, notifyUser } from './notify.ts';
import { sendPayoutReminders } from './recurring.ts';

/**
 * The daily nudges for money owed and rent: one each, on the day that matters, never repeated. Debts you owe
 * get a day's warning; money owed to you and rent due get a nudge on the day.
 */
export async function sendMoneyReminders(today = todayIso()): Promise<{ debts: number; rent: number; payouts: number }> {
  const tomorrow = addDaysIso(today, 1);
  const debts = await sql`
    update public.debts set reminded_for = due_date
    where closed_at is null and due_date is not null
      and ((direction = 'owe' and due_date = ${tomorrow}::date) or (direction = 'owed' and due_date = ${today}::date))
      and (reminded_for is null or reminded_for <> due_date)
    returning user_id, space_id, direction, person, balance
  `;
  for (const d of debts) {
    const money = formatMoney(Number(d.balance), await currencyFor(d.userId));
    await notifyUser(d.userId, {
      kind: 'bill',
      title: d.direction === 'owe' ? `${d.person} is due tomorrow` : `${d.person} was to pay you back today`,
      body: d.direction === 'owe' ? `${money} left to pay. Paying on time keeps it from costing more.` : `${money} is still owed to you. A friendly reminder usually does it.`,
      spaceId: d.spaceId === 'business' ? 'business' : 'personal',
      data: { screen: 'Money' }
    });
  }

  const rent = await sql`
    update public.properties set reminded_for = next_due
    where next_due is not null and next_due <= ${addDaysIso(today, 7)}::date and next_due >= ${addDaysIso(today, -1)}::date
      and (reminded_for is null or reminded_for <> next_due)
    returning user_id, name, tenant_name, rent_amount, next_due
  `;
  for (const p of rent) {
    const money = formatMoney(Number(p.rentAmount), await currencyFor(p.userId));
    const who = p.tenantName ? `${p.tenantName}'s rent` : `Rent for ${p.name}`;
    await notifyUser(p.userId, {
      kind: 'bill',
      title: String(p.nextDue) <= today ? `${who} is due today` : `${who} is due soon`,
      body: `${money}. Record it in Properties when it comes in.`,
      spaceId: 'business',
      data: { screen: 'Properties' }
    });
  }

  return { debts: debts.length, rent: rent.length, payouts: await sendPayoutReminders(today) };
}
