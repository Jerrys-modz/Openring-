import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Btn, Card, Label } from '../ui/components';
import type { Palette } from '../ui/theme';

export interface LogProps {
  c: Palette;
  lines: string[];
  macOverride: string;
  onMacOverride: (v: string) => void;
  stored: number;
  onShareLog: () => void;
  onShareFrames: () => void;
  onShareCsv: () => void;
  onClear: () => void;
}

export function LogScreen({ c, lines, macOverride, onMacOverride, stored, onShareLog, onShareFrames, onShareCsv, onClear }: LogProps) {
  const s = StyleSheet.create({
    input: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, color: c.text, fontSize: 14 },
    row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    ghostRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    note: { fontSize: 13, color: c.muted, marginBottom: 10 },
    log: { fontFamily: 'Menlo', fontSize: 11, color: c.text, marginTop: 2 },
  });
  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={s.input}
        placeholder="MAC override (optional, 12 hex)"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={macOverride}
        onChangeText={onMacOverride}
      />
      <View style={s.row}>
        <Btn c={c} title="Share log" onPress={onShareLog} />
        <Btn c={c} title={`CSV (${stored})`} onPress={onShareCsv} />
        <Btn c={c} title="Raw frames" onPress={onShareFrames} />
      </View>
      <Text style={s.note}>The shared log leaves out the ring&apos;s MAC and other people&apos;s nearby devices. CSV and raw frames contain your health data.</Text>
      <Card c={c} style={{ flex: 1, marginBottom: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label c={c}>Log</Label>
          <Btn c={c} variant="ghost" title="Clear" onPress={onClear} />
        </View>
        <FlatList data={lines} keyExtractor={(_, i) => String(i)} renderItem={({ item }) => <Text style={s.log}>{item}</Text>} />
      </Card>
    </View>
  );
}
