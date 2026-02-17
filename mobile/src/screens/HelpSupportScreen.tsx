import React, { useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, HelpCircle, Mail, ChevronDown, ChevronUp } from 'lucide-react-native';

import { Screen, H1, P, Card } from '../components/Common/ui';
import { useTheme } from '../contexts/ThemeContext';

const FAQ_ITEMS = [
  {
    q: 'What is BudgetFriendly?',
    a: 'BudgetFriendly helps you track spending, set budgets, and reach your savings goals with smart insights.'
  },
  {
    q: 'How are my budgets calculated?',
    a: 'Your remaining budget is calculated as your running budget total minus expenses linked to that budget. Income you apply to a budget increases the running total.'
  },
  {
    q: 'Can I connect my bank accounts?',
    a: 'Yes. Go to Profile & Settings → Data Options → Connect Bank Account to link supported banks.'
  },
  {
    q: 'What are Pending Transactions?',
    a: 'When you connect a bank, imported transactions may arrive as “pending” so you can review, categorize, and link them to a budget before they become real transactions.'
  },
  {
    q: 'Why didn\'t my remaining budget change after confirming a pending expense?',
    a: 'Remaining budget only changes when an expense is linked to your current budget. When reviewing a pending expense, pick a budget (and optional mini budget) before confirming.'
  },
  {
    q: 'What\'s the difference between Budget Buckets and Categories?',
    a: 'Categories describe what you spent on (e.g. Food). Budget buckets group categories into higher-level parts of your plan (e.g. Essential vs Savings).'
  },
  {
    q: 'What are Mini Budgets?',
    a: 'Mini budgets help you track focused spending (like “Transport” or “Eating Out”) inside your main budget. You can link expenses to a mini budget for clearer insights.'
  },
  {
    q: 'How does the analytics timeframe work?',
    a: 'Daily shows today, weekly shows the last 7 days, and monthly shows this month (when your current budget spans more than one month). The range is clamped to your current budget period when available.'
  },
  {
    q: 'How does the burn-rate insight work?',
    a: 'We look at how much of your budget you have used so far and how many days have passed, then estimate how many days of budget you have left at your current pace.'
  },
  {
    q: 'Can I disconnect a bank connection?',
    a: 'Yes. Go to Profile & Settings → Data Options → Manage connections, then choose Disconnect on the connection you want to remove.'
  },
  {
    q: 'How do I export my data?',
    a: 'Go to Profile & Settings → Data Options → Export data. You can download your budgeting and transaction data for your records.'
  },
  {
    q: 'I\'m seeing missing or duplicate transactions — what should I do?',
    a: 'Pull down to refresh, then check Pending Transactions for items needing review. If it still looks off, email support with screenshots and the approximate date/time.'
  }
];

export default function HelpSupportScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();

  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  const contactEmail = 'support@budgetfriendly.app';

  const openEmail = () => {
    const subject = encodeURIComponent('BudgetFriendly support request');
    const url = `mailto:${contactEmail}?subject=${subject}`;
    Linking.openURL(url).catch(() => {
      // silently ignore if email client not available
    });
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [{
            width: 44,
            height: 44,
            borderRadius: 18,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.92 : 1
          }]}
        >
          <ArrowLeft color={theme.colors.text} size={20} />
        </Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <H1 style={{ marginBottom: 0 }}>Help & support</H1>
          <P style={{ marginTop: 4 }}>Answers to common questions and ways to reach us.</P>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>FAQs</Text>
          <View style={{ marginTop: 8 }}>
            {FAQ_ITEMS.map((item) => {
              const isOpen = openQuestion === item.q;
              return (
                <View
                  key={item.q}
                  style={{
                    marginBottom: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border
                  }}
                >
                  <Pressable
                    onPress={() => setOpenQuestion(isOpen ? null : item.q)}
                    style={({ pressed }) => [{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 10,
                      opacity: pressed ? 0.8 : 1
                    }]}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: '800', flex: 1, paddingRight: 12 }}>
                      {item.q}
                    </Text>
                    {isOpen ? (
                      <ChevronUp color={theme.colors.textMuted} size={18} />
                    ) : (
                      <ChevronDown color={theme.colors.textMuted} size={18} />
                    )}
                  </Pressable>
                  {isOpen && (
                    <P style={{ marginBottom: 10 }}>{item.a}</P>
                  )}
                </View>
              );
            })}
          </View>
        </Card>
      </View>
          <P style={{ marginTop: 6 }}>If you can’t find what you need in the FAQs, reach out to us.</P>
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Need more help?</Text>
          <P style={{ marginTop: 6 }}>If you cant find what you need in the FAQs, reach out to us.</P>

          <Pressable
            onPress={openEmail}
            style={({ pressed }) => [{
              marginTop: 12,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1
            }]}
          >
            <Text style={{ color: '#fff', fontWeight: '900' }}>Email support</Text>
          </Pressable>

          <P style={{ marginTop: 8 }}>You can also send feedback from inside the app anytime.</P>
        </Card>
      </View>
    </Screen>
  );
}
