import { ReactNode } from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import type { Palette } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Btn({ title, onPress, disabled, variant = 'secondary', c }: {
  title: string; onPress: () => void; disabled?: boolean; variant?: Variant; c: Palette;
}) {
  const filled = variant === 'primary';
  const color = filled ? c.onAccent : variant === 'danger' ? c.danger : c.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          flex: variant === 'ghost' ? undefined : 1, paddingVertical: variant === 'ghost' ? 6 : 12, paddingHorizontal: 10,
          borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: filled ? c.accent : 'transparent',
          borderWidth: variant === 'ghost' || filled ? 0 : 1, borderColor: variant === 'danger' ? c.danger : c.border,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={{ color, fontSize: variant === 'ghost' ? 13 : 15, fontWeight: filled ? '700' : '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Card({ c, children, style }: { c: Palette; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 }, style]}>
      {children}
    </View>
  );
}

export const labelStyle = (c: Palette) =>
  ({ fontSize: 12, color: c.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }) as const;

export function Label({ c, children }: { c: Palette; children: ReactNode }) {
  return <Text style={labelStyle(c)}>{children}</Text>;
}

/** A small stat: label, big value, one line of detail. A muted value reads as "no data". */
export function Tile({ c, label, value, sub }: { c: Palette; label: string; value: string; sub: string }) {
  return (
    <View style={{ width: '48.5%', backgroundColor: c.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border, marginBottom: 10 }}>
      <Label c={c}>{label}</Label>
      <Text style={{ fontSize: 26, fontWeight: '700', color: value === '—' ? c.muted : c.text, marginTop: 4, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

export function TabBar<T extends string>({ c, tabs, active, onChange }: {
  c: Palette; tabs: { key: T; label: string }[]; active: T; onChange: (k: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
      {tabs.map((t) => (
        <Pressable key={t.key} onPress={() => onChange(t.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
          <View style={{ position: 'absolute', top: -1, height: 3, width: 36, borderRadius: 2, backgroundColor: t.key === active ? c.accent : 'transparent' }} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.key === active ? c.accent : c.muted }}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
