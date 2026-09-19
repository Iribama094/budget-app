import crypto from 'crypto';
import type { Db } from 'mongodb';
import { collections, type BankLinkDoc } from './collections.js';
import { getAccount, getTransactions, MonoError } from './mono.js';
import { notifyUser } from './notify.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "POS/WEB PURCHASE SHOPRITE LEKKI LAGOS NG" → "Shoprite Lekki Lagos". */
export function merchantFromNarration(narration: string): string {
  const cleaned = narration
    .replace(/\b(POS|WEB|NIP|TRF|TRANSFER|PURCHASE|PAYMENT|FRM|TO|FROM|VIA|REF|NG|NGA|LA|LAGOS NG)\b/gi, ' ')
    .replace(/[\/|*#:_-]+/g, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter((w) => w.length > 1).slice(0, 3);
  if (!words.length) return narration.slice(0, 40) || 'Bank transaction';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Pulls new transactions for a live (Mono) connection into the pending review queue.
 * Re-running is safe: provider ids are unique per user.
 */
export async function syncBankLink(db: Db, link: BankLinkDoc): Promise<{ imported: number }> {
  if (link.provider !== 'mono' || !link.externalAccountId) return { imported: 0 };
  const { bankLinks, bankAccounts, importedTransactions } = collections(db);
  const now = new Date();

  let account;
  try {
    account = await getAccount(link.externalAccountId);
  } catch (err) {
    if (err instanceof MonoError && err.needsReauth && link.status !== 'reauth_required') {
      await bankLinks.updateOne({ _id: link._id }, { $set: { status: 'reauth_required', updatedAt: now } });
      await notifyUser(db, link.userId, {
        kind: 'bank',
        title: `Reconnect ${link.bankName}`,
        body: 'We can no longer read this account. Reconnect it to keep importing transactions.',
        data: { screen: 'BankConnections' }
      });
    }
    throw err;
  }

  let acct = await bankAccounts.findOne({ userId: link.userId, bankLinkId: link._id });
  if (acct) {
    await bankAccounts.updateOne({ _id: acct._id }, { $set: { balance: account.balance, name: account.name, updatedAt: now } });
  } else {
    acct = {
      _id: crypto.randomUUID(),
      userId: link.userId,
      spaceId: link.spaceId ?? 'personal',
      bankLinkId: link._id,
      name: account.name,
      mask: account.accountNumber.slice(-4) || '••••',
      type: account.type,
      currency: account.currency,
      balance: account.balance,
      createdAt: now,
      updatedAt: now
    };
    await bankAccounts.insertOne(acct);
  }

  // Overlap the last sync by 3 days to catch late-posting transactions; first sync looks back 90 days.
  const start = link.lastSyncedAt ? new Date(link.lastSyncedAt.getTime() - 3 * DAY_MS) : new Date(now.getTime() - 90 * DAY_MS);
  const rows = await getTransactions(link.externalAccountId, { start, end: now });

  let imported = 0;
  for (const t of rows) {
    try {
      await importedTransactions.insertOne({
        _id: crypto.randomUUID(),
        userId: link.userId,
        spaceId: link.spaceId ?? 'personal',
        bankAccountId: acct._id,
        bankName: link.bankName,
        bankAccountName: acct.name,
        amount: t.amount,
        currency: account.currency,
        direction: t.direction,
        description: t.narration,
        merchant: merchantFromNarration(t.narration),
        occurredAt: t.date,
        status: 'pending',
        externalId: `mono:${t.id}`,
        reconciledAt: null,
        createdAt: now,
        updatedAt: now
      });
      imported++;
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
  }

  await bankLinks.updateOne({ _id: link._id }, { $set: { lastSyncedAt: now, status: 'active', updatedAt: now } });

  if (imported > 0) {
    await notifyUser(db, link.userId, {
      kind: 'bank',
      title: `${imported} new transaction${imported === 1 ? '' : 's'} from ${link.bankName}`,
      body: 'Review them and add them to your budget in a couple of taps.',
      data: { screen: 'PendingTransactions' }
    });
  }
  return { imported };
}
