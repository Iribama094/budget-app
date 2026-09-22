import { Alert } from 'react-native';
import { listBudgets, patchMe, type ApiBudget } from '../api/endpoints';

const labelOf = (name: string) => name.replace(/^My Budget \((.*)\)$/, '$1');

/**
 * What has to happen after somebody joins a shared budget, wherever they joined from. Somebody with no budget
 * of their own should see the shared one on Home straight away. Somebody who already has one is asked, because
 * guessing wrong means they open the app to the wrong numbers.
 *
 * `go` is left to the caller: the Share budget screen replaces itself, a sheet navigates after it has closed.
 */
export async function settleJoinedBudget(
  joined: ApiBudget,
  opts: { refreshUser: () => Promise<unknown>; go: (budgetId: string) => void; announce?: (label: string) => void }
) {
  const { refreshUser, go, announce } = opts;
  const own = await listBudgets({ spaceId: 'personal' })
    .then((r) => (r.items ?? []).some((b) => b.role !== 'member' && (b.purpose ?? 'personal') === 'personal'))
    .catch(() => false);
  const label = labelOf(joined.name);

  if (!own) {
    await patchMe({ homeBudget: 'shared', budgetMode: 'shared' }).catch(() => undefined);
    await refreshUser().catch(() => undefined);
    // Nothing is asked on this path, so say what happened. The other path says it in the question itself.
    announce?.(label);
    go(joined.id);
    return;
  }

  await patchMe({ budgetMode: 'both' }).catch(() => undefined);
  const pick = async (homeBudget: 'own' | 'shared') => {
    await patchMe({ homeBudget }).catch(() => undefined);
    await refreshUser().catch(() => undefined);
    go(joined.id);
  };
  Alert.alert(`You joined ${label} 🎉`, 'You now have your own budget and a shared one. Which should Home show? Both are always in Budgets.', [
    { text: 'Keep mine', onPress: () => void pick('own') },
    { text: 'Show shared', onPress: () => void pick('shared') }
  ]);
}
