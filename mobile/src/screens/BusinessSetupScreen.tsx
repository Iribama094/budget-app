import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';

import { getBusinessSettings, updateBusinessSettings } from '../api/business';
import { createHolding } from '../api/money';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Common/Toast';
import { InfoTip, InlineError, ListRow, PrimaryButton, Screen, TextButton, TextField } from '../components/Common/ui';
import { PlainList } from '../components/Common/PlainList';
import { ChoiceChip } from '../components/Plan/ChoiceChip';
import { MoneyField, parseMoney } from '../components/Business/parts';
import { currencySymbol } from '../utils/format';
import { type } from '../theme/typography';
import { goBackOrHome } from '../navigation/goBack';

type Kind = 'goods' | 'services' | 'property' | 'mix';
const KINDS: Array<{ key: Kind; label: string }> = [
  { key: 'goods', label: 'I sell things' },
  { key: 'services', label: 'I offer a service' },
  { key: 'property', label: 'I rent out property' },
  { key: 'mix', label: 'A bit of everything' }
];

const skippedKey = (userId: string) => `bf_business_setup_later_v1:${userId}`;

/** Whether this person chose "Later" on the setup prompt, so Home doesn't ask again. Settings still offers it. */
export async function businessSetupPostponed(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(skippedKey(userId)).catch(() => null)) === '1';
}

/**
 * Setting up the business, the business space's version of the personal plan. Four short steps, each saved as
 * it goes, then a short list of first things to do that fits the kind of business. Opened once on first visit
 * (with "Later"), and any time from Settings.
 */
export default function BusinessSetupScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const glyph = currencySymbol(user?.currency);

  const [step, setStep] = useState<'intro' | 'name' | 'cash' | 'tax' | 'done'>(route.params?.intro ? 'intro' : 'name');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('goods');
  const [cash, setCash] = useState('');
  const [vat, setVat] = useState<'yes' | 'no' | 'unsure'>('unsure');
  const [staff, setStaff] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBusinessSettings()
      .then((s) => {
        if (s.businessName) setName(s.businessName);
        if (s.vatRegistered) setVat('yes');
      })
      .catch(() => undefined);
  }, []);

  const later = async () => {
    if (user) await AsyncStorage.setItem(skippedKey(user.id), '1').catch(() => undefined);
    toast.show('No problem. It’s in Settings whenever you’re ready.', 'info');
    goBackOrHome(nav);
  };

  const save = async (next: typeof step, work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setStep(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const firstSteps = [
    kind !== 'property' ? { key: 'sale', title: 'Record your first sale', go: () => nav.replace('AddTransaction', { prefill: { type: 'income', category: 'Sales' } }) } : null,
    kind === 'services' || kind === 'mix' ? { key: 'invoice', title: 'Send your first invoice', go: () => nav.replace('InvoiceEdit') } : null,
    kind === 'property' || kind === 'mix' ? { key: 'property', title: 'Add your first property', go: () => nav.replace('Properties') } : null,
    staff ? { key: 'staff', title: 'Add your staff', go: () => nav.replace('Payroll') } : null,
    { key: 'cost', title: 'Add a running cost, like shop rent', go: () => nav.replace('Recurring') }
  ].filter(Boolean) as Array<{ key: string; title: string; go: () => void }>;

  const heading = (eyebrow: string, title: string) => (
    <>
      <Text style={[type.eyebrow, { color: theme.colors.primary }]}>{eyebrow}</Text>
      <Text style={[type.h2, { color: theme.colors.text, marginTop: 6, marginBottom: 16 }]}>{title}</Text>
    </>
  );

  return (
    <Screen bottomInset={48}>
      <View style={{ minHeight: 44, justifyContent: 'center' }}>
        {step !== 'intro' && step !== 'done' ? <TextButton title="Later" onPress={() => void later()} style={{ alignItems: 'flex-end' }} /> : null}
      </View>
      {error ? <InlineError message={error} /> : null}

      {step === 'intro' ? (
        <View style={{ marginTop: 24 }}>
          {heading('Business space', 'Set up your business first')}
          <Text style={[type.body, { color: theme.colors.textMuted }]}>
            Two minutes, four questions. It gets your invoices, tax and business numbers right from day one, and keeps business money apart from your own.
          </Text>
          <PrimaryButton title="Set it up now" onPress={() => setStep('name')} style={{ marginTop: 24 }} />
          <TextButton title="Later. It’s in Settings." onPress={() => void later()} style={{ marginTop: 12 }} />
        </View>
      ) : null}

      {step === 'name' ? (
        <View>
          {heading('1 of 3', 'What’s your business called?')}
          <TextField label="Business name" value={name} onChangeText={setName} placeholder="e.g. Ada’s Store" maxLength={80} autoFocus />
          <Text style={[type.smallStrong, { color: theme.colors.text, marginBottom: 8 }]}>What do you mainly do?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {KINDS.map((k) => (
              <ChoiceChip key={k.key} label={k.label} active={kind === k.key} onPress={() => setKind(k.key)} />
            ))}
          </View>
          <InfoTip text="The name goes on your invoices and payslips, and it's what your team sees. What you do only decides which first steps we suggest; every tool stays available." style={{ marginTop: 12 }}>
            Why we ask
          </InfoTip>
          <PrimaryButton
            title="Next"
            onPress={() => save('cash', () => updateBusinessSettings({ businessName: name.trim() }))}
            loading={busy}
            disabled={!name.trim()}
            style={{ marginTop: 24 }}
          />
        </View>
      ) : null}

      {step === 'cash' ? (
        <View>
          {heading('2 of 3', 'How much does the business have today?')}
          <MoneyField label="In the business account or till" value={cash} onChange={setCash} glyph={glyph} hint="A rough number is fine. You can skip this." autoFocus />
          <InfoTip text="It's the starting point for how long your business cash lasts, and for what's safe to pay yourself. It's saved in Your money, where you can change it any time. It doesn't count as a sale.">
            Why we ask
          </InfoTip>
          <PrimaryButton
            title={parseMoney(cash) > 0 ? 'Next' : 'Skip'}
            onPress={() =>
              save('tax', async () => {
                const amount = parseMoney(cash);
                if (amount > 0) await createHolding({ name: 'Business account', kind: 'bank', balance: amount, spaceId: 'business' });
              })
            }
            loading={busy}
            style={{ marginTop: 24 }}
          />
        </View>
      ) : null}

      {step === 'tax' ? (
        <View>
          {heading('3 of 3', 'Tax and people')}
          <Text style={[type.smallStrong, { color: theme.colors.text, marginBottom: 8 }]}>Is the business registered for VAT?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ChoiceChip label="Yes" active={vat === 'yes'} onPress={() => setVat('yes')} />
            <ChoiceChip label="No" active={vat === 'no'} onPress={() => setVat('no')} />
            <ChoiceChip label="Not sure" active={vat === 'unsure'} onPress={() => setVat('unsure')} />
          </View>
          <InfoTip text="If you're registered, we add VAT to your invoices and count the VAT on what you buy, so you know what to pay the tax office. Not sure? Leave it off. Many small businesses aren't registered. You can switch it on in Tax & VAT later." style={{ marginTop: 10 }}>
            What this changes
          </InfoTip>

          <Text style={[type.smallStrong, { color: theme.colors.text, marginTop: 20, marginBottom: 8 }]}>Do you pay staff?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ChoiceChip label="Yes" active={staff === true} onPress={() => setStaff(true)} />
            <ChoiceChip label="Not yet" active={staff === false} onPress={() => setStaff(false)} />
          </View>

          <PrimaryButton
            title="Finish"
            onPress={() =>
              save('done', async () => {
                await updateBusinessSettings({ vatRegistered: vat === 'yes' });
                if (user) await AsyncStorage.removeItem(skippedKey(user.id)).catch(() => undefined);
              })
            }
            loading={busy}
            style={{ marginTop: 24 }}
          />
        </View>
      ) : null}

      {step === 'done' ? (
        <View style={{ marginTop: 12 }}>
          {heading('All set', `${name.trim() || 'Your business'} is ready`)}
          <Text style={[type.body, { color: theme.colors.textMuted, marginBottom: 12 }]}>Start with one of these. Everything else waits until you need it.</Text>
          <PlainList>
            {firstSteps.map((s) => (
              <ListRow key={s.key} title={s.title} onPress={s.go} chevron />
            ))}
          </PlainList>
          <TextButton title="Go to my business" onPress={() => goBackOrHome(nav)} style={{ marginTop: 20 }} />
        </View>
      ) : null}
    </Screen>
  );
}
