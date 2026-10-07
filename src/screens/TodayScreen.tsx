import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Descriptor } from '../protocol';
import { Btn, Card, Label, Tile } from '../ui/components';
import type { Palette } from '../ui/theme';

export interface TodayProps {
  c: Palette;
  hr: number | null;
  status: Descriptor | null;
  connected: boolean;
  busy: boolean;
  lastSync: string | null;
  stored: number;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}

export function TodayScreen({ c, hr, status, connected, busy, lastSync, stored, onConnect, onSync, onDisconnect }: TodayProps) {
  const s = StyleSheet.create({
    hrRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
    heart: { fontSize: 28, marginRight: 8, color: c.heart },
    hr: { fontSize: 64, fontWeight: '700', color: hr === null ? c.muted : c.text, fontVariant: ['tabular-nums'] },
    unit: { fontSize: 18, color: c.muted, marginLeft: 8 },
    hint: { fontSize: 13, color: c.muted, marginTop: 2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    syncText: { fontSize: 15, color: c.text, marginTop: 4 },
  });

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
      <Card c={c}>
        <Label c={c}>Heart rate</Label>
        <View style={s.hrRow}>
          <Text style={s.heart}>♥</Text>
          <Text style={s.hr}>{hr ?? '—'}</Text>
          <Text style={s.unit}>bpm</Text>
        </View>
        <Text style={s.hint}>{connected ? 'Live from the ring, about every 2 seconds' : 'Connect to see your live heart rate'}</Text>
      </Card>

      <View style={s.grid}>
        <Tile
          c={c}
          label="Battery"
          value={status ? `${status.batteryPercent}%` : '—'}
          sub={status ? `${(status.batteryMv / 1000).toFixed(2)} V` : 'connect to read'}
        />
        <Tile
          c={c}
          label="Skin temp"
          value={status?.skinTempC1 != null ? `${status.skinTempC1.toFixed(1)}°` : '—'}
          sub={status?.skinTempC2 != null ? `${status.skinTempC2.toFixed(1)}° second sensor` : 'celsius'}
        />
        <Tile c={c} label="Steps" value={status ? String(status.stepsInBucket) : '—'} sub="this quarter-hour" />
        <Tile
          c={c}
          label="Mode"
          value={status ? String(status.mode) : '—'}
          sub={status?.charging ? 'charging' : 'raw ring mode'}
        />
      </View>

      <Card c={c}>
        <Label c={c}>History sync</Label>
        <Text style={s.syncText}>{lastSync ?? 'Not synced yet'}</Text>
        <Text style={s.hint}>
          {stored} record{stored === 1 ? '' : 's'} saved on this phone. Syncing takes the ring&apos;s new data, so keep the RingConn app closed.
        </Text>
      </Card>

      <View style={s.row}>
        <Btn c={c} variant="primary" title={busy ? 'Working…' : 'Connect'} onPress={onConnect} disabled={busy || connected} />
        <Btn c={c} title="Sync history" onPress={onSync} disabled={busy || !connected} />
        <Btn c={c} variant="danger" title="Disconnect" onPress={onDisconnect} disabled={!connected && !busy} />
      </View>
    </ScrollView>
  );
}
