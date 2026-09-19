import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Calculator, ChevronDown, ChevronUp, Mail, Search, Sparkles, Users } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { Card, IconTile, ListCard, ListRow, PrimaryButton, Screen, ScreenHeader, SectionHeader, TextField } from '../components/Common/ui';
import { type } from '../theme/typography';

type Faq = { q: string; a: string };
type Topic = { title: string; items: Faq[] };

const TOPICS: Topic[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'What is BudgetFriendly?',
        a: 'A budgeting app that records the money you earn and spend and turns it into clear insight: what’s safe to spend, where money goes, and how to hit your goals. It is not a bank. It never holds, moves or debits your money.'
      },
      {
        q: 'How is my plan made?',
        a: 'From your income, payday and bills. We split what’s left into Needs, Wants and Savings for each budget period (payday to payday or calendar month). Change any of it in Profile › Income & bills.'
      },
      {
        q: 'Can BudgetFriendly take money from my account?',
        a: 'No. Linked banks are read-only, pasted bank alerts and uploaded statements only create records, and nothing in the app can send or debit money.'
      }
    ]
  },
  {
    title: 'Budgets and spending',
    items: [
      {
        q: 'How is my remaining budget worked out?',
        a: 'Your budget total, plus any income you apply to it, minus expenses linked to it. On a shared budget, everyone’s linked spending counts.'
      },
      {
        q: 'What’s the difference between Needs/Wants/Savings and categories?',
        a: 'Categories describe what you spent on, like Food or Transport. Needs, Wants and Savings are the three parts of your plan that categories roll up into.'
      },
      {
        q: 'Can I add my own categories, like tithe or generator fuel?',
        a: 'Yes. Go to Settings (gear on Home) › Categories. The app also learns: once you pick a category for a payee, it suggests it next time.'
      },
      {
        q: 'What are mini budgets?',
        a: 'Smaller limits inside a budget, like “Eating out”, so you can watch one kind of spending closely. Open a budget and tap a part of your plan to add one.'
      },
      {
        q: 'How do transactions get in without typing everything?',
        a: 'Paste a bank alert SMS (Settings › Paste a bank alert), link a bank (Settings › Linked banks), set up recurring bills and salary (Settings › Recurring & bills), or upload a statement CSV in Business. Imported items wait in Pending transactions for you to confirm.'
      },
      {
        q: 'Does it work offline?',
        a: 'Yes. Transactions you add offline are saved on your phone and sync when you’re back online.'
      }
    ]
  },
  {
    title: 'Goals and savings',
    items: [
      {
        q: 'How do goals work with my budget?',
        a: 'Goals track money you set aside yourself. When you add money to a goal, we also record it as Savings in your budget so both stay accurate. You can switch that off if you already logged it as a transaction.'
      },
      {
        q: 'What does auto-save do?',
        a: 'It’s a reminder, not a transfer. When you record income, we suggest moving a share to your goal. Move it in your bank app, then tap “I moved it” on Home or Goals. It only counts once you confirm.'
      }
    ]
  },
  {
    title: 'Budgeting together',
    items: [
      {
        q: 'How do I budget with a partner, family or housemates?',
        a: 'Choose “Together” during setup, or go to Settings › Start a shared budget. Then open the budget › Share › Create invite code and send it by WhatsApp or SMS. It works once and lasts 7 days. They tap the link, or enter the code in Budgets › Join a shared budget.'
      },
      {
        q: 'Can I keep my own budget as well?',
        a: 'Yes. Your own plan and a shared budget run side by side, and both are always in Budgets. Home shows your own plan; switch it in Settings › Home shows, or tap “Show on Home” on the shared budget.'
      },
      {
        q: 'What can the other person see and do?',
        a: 'They see that one budget and can add income and spending to it. Everyone’s spending counts toward it. Your other budgets, goals and transactions stay private. Only the owner can edit the budget or invite people.'
      },
      {
        q: 'Does it carry into next month?',
        a: 'Yes. The day before it ends, the owner gets a nudge. “Start next month” copies the plan and keeps everyone in it.'
      },
      {
        q: 'Can we see who spent what?',
        a: 'Open the shared budget to see how much each person spent, and who should send whom how much if you split it equally.'
      },
      {
        q: 'What notifications do we get?',
        a: 'Everyone gets pace and over-budget alerts. Each morning you get one summary of what the others spent the day before (turn it off in Notifications › Shared budget activity). Everyone is told when someone joins or leaves.'
      },
      {
        q: 'Can I plan a wedding, trip or event?',
        a: 'Yes. In Budgets › New, choose “Event or trip”, name it and set the dates. It can run alongside your monthly plan, and you can share it with family who are chipping in.'
      },
      {
        q: 'How do I leave or remove someone?',
        a: 'Open the budget › Shared. The owner can remove members, and members can leave. Transactions already added stay in each person’s own history.'
      }
    ]
  },
  {
    title: 'Business',
    items: [
      {
        q: 'How do I use BudgetFriendly for my business?',
        a: 'Turn on Spaces in Settings, then switch to Business on Home. Business money stays separate from personal, with its own profit, costs, cash runway and tax set-aside.'
      },
      {
        q: 'How do invoices and bills work?',
        a: 'Create an invoice, share it as a PDF or on WhatsApp, and record payments when customers pay. They count as sales. Add supplier bills with due dates and record payments as costs. We remind you before things are due or overdue.'
      },
      {
        q: 'Can I bring in Paystack or Moniepoint sales?',
        a: 'Yes. Export your transactions as CSV from Paystack, Moniepoint or your bank, then Business › Upload. Rows go to Pending transactions for review, and uploading the same file twice won’t double anything. Live Paystack sync is coming.'
      },
      {
        q: 'How does “Pay yourself” work?',
        a: 'We suggest a safe amount: the smaller of this month’s profit after tax, or the cash left after keeping your safety buffer and paying open bills, minus what you’ve already paid yourself. Pay yourself from your business account, then record it. It shows as Owner’s pay in Business and income in Personal.'
      },
      {
        q: 'What about staff and payroll?',
        a: 'Add staff with their monthly gross pay. Running payroll records net pay as a cost and creates a PAYE bill due by the 10th. We don’t pay anyone; you pay them, we record it.'
      }
    ]
  },
  {
    title: 'Tax',
    items: [
      {
        q: 'How are tax estimates worked out?',
        a: 'For Nigeria we use the Nigeria Tax Act 2025, in force from 1 January 2026. The first ₦800,000 a year is tax-free, then rates rise from 15% to 25% above ₦50 million. The old Consolidated Relief Allowance is gone. Rent relief is 20% of annual rent, up to ₦500,000.'
      },
      {
        q: 'How do I lower my estimate with rent and other reliefs?',
        a: 'Settings › Tax › Reliefs that lower your tax. Add your yearly rent, plus pension, NHF and health insurance taken from your pay, and any life insurance or mortgage interest. They come off your income before tax rates apply.'
      },
      {
        q: 'Can I rely on these figures for filing?',
        a: 'Use them to plan, not to file. Your situation, exemptions and state practice can change the final amount, so confirm with an accountant or the tax office. VAT and PAYE dates shown are the usual deadlines.'
      }
    ]
  },
  {
    title: 'Insights, Flux and Wrapped',
    items: [
      {
        q: 'How does the app learn from my spending?',
        a: 'It compares your pace with your plan, spots unusual days, repeat payees and categories that keep growing, then suggests small changes. Dismiss an insight and we won’t repeat it.'
      },
      {
        q: 'What is Flux?',
        a: 'Your AI money coach. Ask it things like “Can I afford a new phone this month?” and it answers using your budget and spending.'
      },
      {
        q: 'What is Money Wrapped?',
        a: 'A fun recap of your money: your first half of the year in July, and your full year in December. Open it any time from Profile › Money Wrapped and share your favourite slide.'
      },
      {
        q: 'Can I control notifications?',
        a: 'Yes. Settings › Notifications for alerts, bill reminders and insights, and Settings › Daily reminder for the nudge to log spending.'
      }
    ]
  },
  {
    title: 'Account and data',
    items: [
      {
        q: 'How do I export my data?',
        a: 'Settings › Export data downloads your transactions for your records or your accountant.'
      },
      {
        q: 'How do I keep my account secure?',
        a: 'Turn on Face ID or fingerprint sign-in in Settings, and check Profile › Your devices to sign out any phone you don’t recognise.'
      },
      {
        q: 'I’m seeing missing or duplicate transactions',
        a: 'Pull down to refresh, then check Pending transactions for items waiting for review. If it still looks off, email us with screenshots and the rough date and time.'
      }
    ]
  }
];

const CONTACT_EMAIL = 'support@budgetfriendly.app';

export default function HelpSupportScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const topics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOPICS;
    return TOPICS.map((t) => ({ ...t, items: t.items.filter((i) => `${i.q} ${i.a}`.toLowerCase().includes(q)) })).filter((t) => t.items.length);
  }, [query]);

  const email = () => {
    const subject = encodeURIComponent('BudgetFriendly support request');
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}`).catch(() => undefined);
  };

  const tile = (Icon: typeof Mail) => (
    <IconTile bg={theme.colors.primarySoft} size={36}>
      <Icon color={theme.colors.primary} size={18} />
    </IconTile>
  );

  return (
    <Screen bottomInset={48}>
      <ScreenHeader title="Help & support" subtitle="Quick answers, or talk to us" onBack={() => nav.goBack()} />

      <TextField
        label="Search help"
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. shared budget, invoice, tax"
        autoCorrect={false}
        right={<Search color={theme.colors.textMuted} size={18} />}
      />

      <SectionHeader title="Shortcuts" />
      <ListCard>
        <ListRow icon={tile(Sparkles)} title="Ask Flux" subtitle="Get an answer about your own money" onPress={() => nav.navigate('AssistantModal')} chevron />
        <ListRow icon={tile(Users)} title="Join a shared budget" subtitle="Use a code from a partner or housemate" onPress={() => nav.navigate('ShareBudget')} chevron />
        <ListRow icon={tile(Calculator)} title="Tax settings" subtitle="Estimates under the 2026 tax law" onPress={() => nav.navigate('TaxSettings')} chevron />
      </ListCard>

      {topics.length ? (
        topics.map((t) => (
          <View key={t.title}>
            <SectionHeader title={t.title} />
            <Card style={{ paddingVertical: 4 }}>
              {t.items.map((item, i) => {
                const isOpen = open === item.q || !!query.trim();
                return (
                  <View key={item.q} style={i < t.items.length - 1 ? [styles.divider, { borderBottomColor: theme.colors.border }] : undefined}>
                    <Pressable
                      onPress={() => setOpen(open === item.q ? null : item.q)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                      style={({ pressed }) => [styles.question, { opacity: pressed ? 0.75 : 1 }]}
                    >
                      <Text style={[type.bodyStrong, { color: theme.colors.text, flex: 1 }]}>{item.q}</Text>
                      {isOpen ? <ChevronUp color={theme.colors.textMuted} size={18} /> : <ChevronDown color={theme.colors.textMuted} size={18} />}
                    </Pressable>
                    {isOpen ? <Text style={[type.small, { color: theme.colors.textMuted, paddingBottom: 12 }]}>{item.a}</Text> : null}
                  </View>
                );
              })}
            </Card>
          </View>
        ))
      ) : (
        <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 16 }]}>No answers match “{query.trim()}”. Try another word, or email us below.</Text>
      )}

      <SectionHeader title="Still stuck?" />
      <Card>
        <Text style={[type.small, { color: theme.colors.textMuted }]}>
          Email us and we’ll get back to you. Add screenshots and what you were trying to do, it helps us fix it faster.
        </Text>
        <PrimaryButton title="Email support" iconLeft={<Mail color={theme.colors.onPrimary} size={18} />} onPress={email} style={{ marginTop: 12 }} />
        <Text selectable style={[type.caption, { color: theme.colors.textMuted, marginTop: 8, textAlign: 'center' }]}>
          {CONTACT_EMAIL}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth }
});
