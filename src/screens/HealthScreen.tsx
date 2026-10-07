import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { HealthAccess } from '../health/healthkit';
import { Btn, Card, Label } from '../ui/components';
import type { Palette } from '../ui/theme';

export interface HealthProps {
  c: Palette;
  access: HealthAccess;
  heartRateOn: boolean;
  stepsOn: boolean;
  onHeartRate: (v: boolean) => void;
  onSteps: (v: boolean) => void;
  onAllow: () => void;
  onWriteNow: () => void;
  busy: boolean;
  written: number;
  pending: number;
  lastWrite: string | null;
  error: string | null;
}

const ACCESS_TEXT: Record<HealthAccess, string> = {
  allowed: 'Allowed',
  denied: 'Not allowed',
  'not-asked': 'Not set up yet',
  unavailable: 'Not available on this device',
};

export function HealthScreen(p: HealthProps) {
  const { c } = p;
  const s = StyleSheet.create({
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8, backgroundColor: p.access === 'allowed' ? c.good : p.access === 'denied' ? c.danger : c.muted },
    status: { fontSize: 17, fontWeight: '600', color: c.text },
    body: { fontSize: 14, color: c.muted, marginTop: 6 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    toggleText: { flex: 1, paddingRight: 12 },
    toggleTitle: { fontSize: 16, color: c.text, fontWeight: '500' },
    toggleSub: { fontSize: 13, color: c.muted, marginTop: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },
    stats: { flexDirection: 'row', gap: 24, marginTop: 8 },
    statValue: { fontSize: 26, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
    statLabel: { fontSize: 12, color: c.muted },
    error: { fontSize: 13, color: c.danger, marginTop: 8 },
    row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        <Card c={c}>
          <Label c={c}>Apple Health</Label>
          <View style={s.statusRow}>
            <View style={s.dot} />
            <Text style={s.status}>{ACCESS_TEXT[p.access]}</Text>
          </View>
          <Text style={s.body}>
            {p.access === 'denied'
              ? 'Turn OpenRing back on in Settings, Health, Data Access & Devices.'
              : 'OpenRing saves your ring data to Apple Health, where apps like SparkyFitness can read it. It never reads your other Health data.'}
          </Text>
        </Card>

        <Card c={c}>
          <Label c={c}>What to save</Label>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text style={s.toggleTitle}>Heart rate</Text>
              <Text style={s.toggleSub}>Every history record, saved after each sync</Text>
            </View>
            <Switch value={p.heartRateOn} onValueChange={p.onHeartRate} trackColor={{ true: c.accent }} />
          </View>
          <View style={s.divider} />
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text style={s.toggleTitle}>Steps (beta)</Text>
              <Text style={s.toggleSub}>Only counts steps while this app is connected, so it can undercount</Text>
            </View>
            <Switch value={p.stepsOn} onValueChange={p.onSteps} trackColor={{ true: c.accent }} />
          </View>
        </Card>

        <Card c={c}>
          <Label c={c}>Heart rate in Health</Label>
          <View style={s.stats}>
            <View>
              <Text style={s.statValue}>{p.written}</Text>
              <Text style={s.statLabel}>saved</Text>
            </View>
            <View>
              <Text style={s.statValue}>{p.pending}</Text>
              <Text style={s.statLabel}>waiting</Text>
            </View>
          </View>
          <Text style={s.body}>{p.lastWrite ?? 'Nothing saved yet'}</Text>
          {p.error ? <Text style={s.error}>{p.error}</Text> : null}
        </Card>
      </ScrollView>

      <View style={s.row}>
        {p.access === 'allowed' ? (
          <Btn c={c} variant="primary" title={p.busy ? 'Saving…' : 'Save to Health now'} onPress={p.onWriteNow} disabled={p.busy || !p.heartRateOn || p.pending === 0} />
        ) : (
          <Btn c={c} variant="primary" title="Allow access to Health" onPress={p.onAllow} disabled={p.busy || p.access === 'unavailable' || p.access === 'denied'} />
        )}
      </View>
    </View>
  );
}
