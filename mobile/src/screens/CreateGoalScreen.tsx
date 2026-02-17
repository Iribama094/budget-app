import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';

import { createGoal } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useSpace } from '../contexts/SpaceContext';
import { useTheme } from '../contexts/ThemeContext';
import { InlineError, P, PrimaryButton, Screen, TextField, H1 } from '../components/Common/ui';
import { formatNumberInput, toIsoDate } from '../utils/format';
import { tokens } from '../theme/tokens';

export default function CreateGoalScreen() {
  const nav = useNavigation();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { spacesEnabled, activeSpaceId } = useSpace();

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return toIsoDate(d);
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const d = new Date(`${targetDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const selectedDate = useMemo(() => {
    const d = new Date(`${targetDate}T12:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [targetDate]);

  const monthLabel = useMemo(() => {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${MONTHS[calendarCursor.getMonth()]} ${calendarCursor.getFullYear()}`;
  }, [calendarCursor]);

  const calendarGrid = useMemo(() => {
    const y = calendarCursor.getFullYear();
    const m = calendarCursor.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startWeekday = first.getDay(); // 0=Sun

    const cells: Array<number | null> = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

    const rows: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [calendarCursor]);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedTarget = useMemo(() => {
    const n = Number(targetAmount.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }, [targetAmount]);

  const parsedCurrent = useMemo(() => {
    if (!currentAmount.trim()) return 0;
    const n = Number(currentAmount.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }, [currentAmount]);

  const canSave =
    name.trim().length > 0 &&
    Number.isFinite(parsedTarget) &&
    parsedTarget > 0 &&
    Number.isFinite(parsedCurrent) &&
    !isSaving;

  const submit = async () => {
    if (!canSave) return;
    setError(null);
    setIsSaving(true);
    try {
      await createGoal({
        name: name.trim(),
        targetAmount: parsedTarget,
        currentAmount: parsedCurrent,
        targetDate,
        ...(spacesEnabled ? { spaceId: activeSpaceId } : {})
      });

      (nav as any).goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create goal');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen>
      <Pressable
        onPress={() => (nav as any).goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
      >
        <ChevronLeft color={theme.colors.text} size={20} />
        <Text style={{ color: theme.colors.text, fontWeight: '900', marginLeft: 6 }}>Back</Text>
      </Pressable>

      <H1 style={{ marginTop: 10, marginBottom: 0 }}>Create Goal</H1>
      <P style={{ marginTop: 8 }}>Set a target and track progress over time.</P>

      <View style={{ marginTop: 14 }}>
        {error ? <InlineError message={error} /> : null}
        {isSaving ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      <View style={{ marginTop: 12 }}>
        <TextField label="Goal name" value={name} onChangeText={setName} placeholder="e.g. Emergency fund" />
        <TextField
          label="Target amount"
          value={targetAmount}
          onChangeText={(v) => setTargetAmount(formatNumberInput(v))}
          placeholder={`0 (${user?.currency ?? '₦'})`}
          keyboardType="number-pad"
        />
        <TextField
          label="Current amount"
          value={currentAmount}
          onChangeText={(v) => setCurrentAmount(formatNumberInput(v))}
          placeholder={`0 (${user?.currency ?? '₦'})`}
          keyboardType="number-pad"
        />

        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Target date</Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={({ pressed }) => [
              {
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                borderRadius: tokens.radius['2xl'],
                paddingHorizontal: 14,
                paddingVertical: 12,
                opacity: pressed ? 0.92 : 1
              }
            ]}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>{targetDate}</Text>
            <Text style={{ color: theme.colors.textMuted, marginTop: 4, fontSize: 12, fontWeight: '700' }}>Tap to pick a date</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 10 }}>
          <PrimaryButton title={isSaving ? 'Creating…' : 'Create goal'} onPress={submit} disabled={!canSave} />
          <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 8 }}>
            Tip: Use numbers only for amounts (no decimals).
          </Text>
        </View>

        <Pressable
          onPress={() => (nav as any).goBack()}
          style={({ pressed }) => ({
            marginTop: 10,
            paddingVertical: 12,
            alignItems: 'center',
            borderRadius: tokens.radius['2xl'],
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            opacity: pressed ? 0.92 : 1
          })}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Cancel</Text>
        </Pressable>
      </View>

      {showDatePicker ? (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center' }}>
            <View style={{ margin: 20, backgroundColor: theme.colors.background, borderRadius: 16, overflow: 'hidden' }}>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Select target date</Text>
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Close</Text>
                </Pressable>
              </View>

              <View style={{ padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Pressable
                    onPress={() => {
                      const d = new Date(calendarCursor);
                      d.setMonth(d.getMonth() - 1);
                      setCalendarCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                    }}
                    style={({ pressed }) => [{ paddingVertical: 8, paddingHorizontal: 10, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>‹</Text>
                  </Pressable>

                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{monthLabel}</Text>

                  <Pressable
                    onPress={() => {
                      const d = new Date(calendarCursor);
                      d.setMonth(d.getMonth() + 1);
                      setCalendarCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                    }}
                    style={({ pressed }) => [{ paddingVertical: 8, paddingHorizontal: 10, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>›</Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                    <Text key={d} style={{ width: 36, textAlign: 'center', color: theme.colors.textMuted, fontWeight: '800' }}>
                      {d}
                    </Text>
                  ))}
                </View>

                {calendarGrid.map((row, rowIdx) => (
                  <View key={rowIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    {row.map((day, colIdx) => {
                      if (!day) {
                        return <View key={colIdx} style={{ width: 36, height: 36 }} />;
                      }

                      const y = calendarCursor.getFullYear();
                      const m = calendarCursor.getMonth();
                      const dateObj = new Date(y, m, day);
                      const iso = toIsoDate(dateObj);
                      const isSelected = iso === targetDate;

                      return (
                        <Pressable
                          key={colIdx}
                          onPress={() => {
                            setTargetDate(iso);
                            setShowDatePicker(false);
                          }}
                          style={({ pressed }) => [
                            {
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                              opacity: pressed ? 0.85 : 1
                            }
                          ]}
                        >
                          <Text style={{ color: isSelected ? tokens.colors.white : theme.colors.text, fontWeight: '800' }}>{day}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}

                <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 8 }}>
                  Selected: {toIsoDate(selectedDate)}
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
}
