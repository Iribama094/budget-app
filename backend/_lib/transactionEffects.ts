import type { Db } from 'mongodb';
import type { TransactionDoc } from './collections.js';
import { checkBudgetPace } from './alerts.js';
import { applyAutoSave, type AutoSaveResult } from './autosave.js';

/**
 * Side effects shared by every way a transaction is created (manual, offline sync,
 * recurring, bank import). Failures are logged and never undo the transaction.
 */
export async function afterTransactionCreated(db: Db, tx: TransactionDoc): Promise<{ autoSaved: AutoSaveResult[] }> {
  let autoSaved: AutoSaveResult[] = [];
  try {
    if (tx.type === 'expense' && tx.budgetId) await checkBudgetPace(db, tx.budgetId, tx.budgetCategory);
    if (tx.type === 'income') autoSaved = await applyAutoSave(db, tx.userId, tx.spaceId, tx.amount, tx._id);
  } catch (err) {
    console.error('[transaction effects] failed', err);
  }
  return { autoSaved };
}
