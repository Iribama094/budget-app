import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, Search, X } from '../../icons';

import { useTheme } from '../../contexts/ThemeContext';
import { fonts, type } from '../../theme/typography';

export type SelectValue = string | number | null;
export type SelectOption<T extends SelectValue> = { value: T; label: string; subtitle?: string; icon?: React.ReactNode };

/** A bottom-sheet list to pick one option. Long lists get a search box. */
export function SelectSheet<T extends SelectValue>({
  visible,
  onClose,
  title,
  subtitle,
  options,
  value,
  onSelect
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: Array<SelectOption<T>>;
  value: T | undefined;
  onSelect: (value: T) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const searchable = options.length > 8;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.subtitle ?? ''}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      {/* Searching lifts the list above the keyboard so results stay tappable. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={close}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.h2, { color: theme.colors.text }]}>{title}</Text>
              {subtitle ? <Text style={[type.small, { color: theme.colors.textMuted, marginTop: 2 }]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <X color={theme.colors.textMuted} size={20} />
            </Pressable>
          </View>

          {searchable ? (
            <View style={[styles.search, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
              <Search color={theme.colors.textMuted} size={16} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={theme.colors.textMuted}
                autoCorrect={false}
                style={[styles.searchInput, { color: theme.colors.text }]}
              />
            </View>
          ) : null}

          <FlatList
            data={shown}
            keyExtractor={(o, i) => `${String(o.value)}-${i}`}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    setQuery('');
                    onSelect(item.value);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.option, { backgroundColor: selected ? theme.colors.primarySoft : pressed ? theme.colors.surfaceAlt : 'transparent' }]}
                >
                  {item.icon}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.bodyStrong, { color: selected ? theme.colors.primary : theme.colors.text }]}>
                      {item.label}
                    </Text>
                    {item.subtitle ? (
                      <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted }]}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Check color={theme.colors.primary} size={18} strokeWidth={3} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={[type.small, { color: theme.colors.textMuted, paddingVertical: 16, textAlign: 'center' }]}>No matches</Text>}
          />
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A form field that shows the chosen option and opens a SelectSheet. Use instead of long rows of pills. */
export function SelectField<T extends SelectValue>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose',
  sheetTitle,
  hint,
  disabled,
  style
}: {
  label?: string;
  value: T | undefined;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  sheetTitle?: string;
  hint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {label ? <Text style={[type.smallStrong, { color: theme.colors.text, marginBottom: 8 }]}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? sheetTitle ?? 'Choose'}: ${selected?.label ?? placeholder}`}
        style={({ pressed }) => [styles.field, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
      >
        {selected?.icon}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.body, { color: selected ? theme.colors.text : theme.colors.textMuted, fontFamily: fonts.medium }]}>
            {selected?.label ?? placeholder}
          </Text>
          {selected?.subtitle ? (
            <Text numberOfLines={1} style={[type.caption, { color: theme.colors.textMuted }]}>
              {selected.subtitle}
            </Text>
          ) : null}
        </View>
        <ChevronDown color={theme.colors.textMuted} size={18} />
      </Pressable>
      {hint ? <Text style={[type.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>{hint}</Text> : null}
      <SelectSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label ?? 'Choose'}
        options={options}
        value={value}
        onSelect={(v) => {
          setOpen(false);
          onChange(v);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12, paddingHorizontal: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, minHeight: 42, marginBottom: 8 },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 8, letterSpacing: 0 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 50, paddingVertical: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 }
});
