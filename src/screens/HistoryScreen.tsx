import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ActivityRecord } from '../protocol';
import { bucketHeartRate, formatRingClock, formatRingDay, summarizeHeartRate } from '../store/stats';
import { Card, Label, Tile } from '../ui/components';
import type { Palette } from '../ui/theme';

const BUCKET_SECONDS = 30 * 60;
const BUCKETS = 48; // 24 hours
const CHART_HEIGHT = 130;

export function HistoryScreen({ c, records }: { c: Palette; records: ActivityRecord[] }) {
  const summary = useMemo(() => summarizeHeartRate(records), [records]);
  const buckets = useMemo(() => bucketHeartRate(records, BUCKET_SECONDS, BUCKETS), [records]);
  const recent = useMemo(() => [...records].reverse().slice(0, 12), [records]);

  const values = buckets.flatMap((b) => (b.avg === null ? [] : [b.avg]));
  const lo = values.length ? Math.floor(Math.min(...values) / 10) * 10 - 10 : 40;
  const hi = values.length ? Math.ceil(Math.max(...values) / 10) * 10 + 10 : 120;

  const s = StyleSheet.create({
    empty: { alignItems: 'center', paddingVertical: 48 },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: c.text, marginBottom: 6 },
    emptyBody: { fontSize: 14, color: c.muted, textAlign: 'center', paddingHorizontal: 24 },
    range: { fontSize: 15, color: c.text, marginTop: 4, marginBottom: 10 },
    chart: { height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    barSlot: { flex: 1, height: CHART_HEIGHT, justifyContent: 'flex-end' },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginRight: 36 },
    axisText: { fontSize: 11, color: c.muted },
    plotRow: { flexDirection: 'row' },
    yGutter: { width: 30, height: CHART_HEIGHT, justifyContent: 'space-between', alignItems: 'flex-end', marginLeft: 6 },
    gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.border },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    rowTime: { fontSize: 14, color: c.text, fontVariant: ['tabular-nums'] },
    rowKind: { fontSize: 12, color: c.muted },
    rowHr: { fontSize: 14, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
  });

  if (!records.length) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>No history yet</Text>
        <Text style={s.emptyBody}>Connect your ring on the Today tab and tap Sync history. Records are saved here and never sent anywhere.</Text>
      </View>
    );
  }

  const end = buckets[buckets.length - 1]!.start + BUCKET_SECONDS;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
      <Card c={c}>
        <Label c={c}>Heart rate, last 24 hours</Label>
        <Text style={s.range}>
          {summary.last !== null ? `Until ${formatRingDay(summary.last)}, ${formatRingClock(summary.last)}` : ''}
        </Text>
        <View style={s.plotRow}>
          <View style={{ flex: 1 }}>
            <View style={[s.gridLine, { top: 0 }]} />
            <View style={[s.gridLine, { top: CHART_HEIGHT / 2 }]} />
            <View style={[s.gridLine, { top: CHART_HEIGHT - 1 }]} />
            <View style={s.chart}>
              {buckets.map((b) => (
                <View key={b.start} style={s.barSlot}>
                  <View
                    style={{
                      height: b.avg === null ? 2 : Math.max(3, ((b.avg - lo) / (hi - lo)) * CHART_HEIGHT),
                      borderRadius: 2,
                      backgroundColor: b.avg === null ? c.border : c.heart,
                    }}
                  />
                </View>
              ))}
            </View>
          </View>
          <View style={s.yGutter}>
            <Text style={s.axisText}>{hi}</Text>
            <Text style={s.axisText}>{Math.round((hi + lo) / 2)}</Text>
            <Text style={s.axisText}>{lo}</Text>
          </View>
        </View>
        <View style={s.axis}>
          <Text style={s.axisText}>{formatRingClock(buckets[0]!.start)}</Text>
          <Text style={s.axisText}>{formatRingClock(buckets[Math.floor(BUCKETS / 2)]!.start)}</Text>
          <Text style={s.axisText}>{formatRingClock(end)}</Text>
        </View>
      </Card>

      <View style={s.grid}>
        <Tile c={c} label="Average" value={summary.avg !== null ? String(summary.avg) : '—'} sub="bpm" />
        <Tile c={c} label="Records" value={String(records.length)} sub={`${summary.count} with heart rate`} />
        <Tile c={c} label="Lowest" value={summary.min !== null ? String(summary.min) : '—'} sub="bpm" />
        <Tile c={c} label="Highest" value={summary.max !== null ? String(summary.max) : '—'} sub="bpm" />
      </View>

      <Card c={c}>
        <Label c={c}>Latest records</Label>
        <View style={{ marginTop: 6 }}>
          {recent.map((r) => (
            <View key={r.timestamp} style={s.row}>
              <View>
                <Text style={s.rowTime}>{formatRingDay(r.ringClockSeconds)}, {formatRingClock(r.ringClockSeconds)}</Text>
                <Text style={s.rowKind}>{r.kind === 'sleep-vitals' ? 'sleep vitals' : 'activity'}</Text>
              </View>
              <Text style={s.rowHr}>{r.heartRate !== null ? `${r.heartRate} bpm` : '—'}</Text>
            </View>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}
