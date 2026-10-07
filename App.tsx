import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, Share, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { RingClient } from './src/ble/RingClient';
import { ActivityRecord, Channel, Descriptor, recordUnixSeconds } from './src/protocol';
import { appendRecord, loadRecordIndex, readHistoryLines, saveHistoryFrame } from './src/store/historyStore';
import { RecordIndex, recordsToCsv } from './src/store/recordIndex';

const palettes = {
  light: { bg: '#F2F2F7', card: '#FFFFFF', text: '#111113', muted: '#6B6B72', border: '#D8D8DE', accent: '#0A84FF', onAccent: '#FFFFFF', danger: '#D70015', heart: '#E5384F' },
  dark: { bg: '#000000', card: '#1C1C1E', text: '#F2F2F7', muted: '#98989F', border: '#38383A', accent: '#4DA3FF', onAccent: '#001B33', danger: '#FF6961', heart: '#FF5A6E' },
};
type Palette = typeof palettes.light;

function Btn({ title, onPress, disabled, variant = 'secondary', c }: {
  title: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; c: Palette;
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

export default function App() {
  const c = palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const s = useMemo(() => makeStyles(c), [c]);
  const [connected, setConnected] = useState(false);
  const managerRef = useRef<BleManager | null>(null);
  managerRef.current ??= new BleManager();
  const manager = managerRef.current;
  const client = useRef<RingClient | null>(null);
  const stopHr = useRef<(() => void) | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [hr, setHr] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [macOverride, setMacOverride] = useState('');
  const [status, setStatus] = useState<Descriptor | null>(null);
  const [index] = useState<RecordIndex>(() => {
    try {
      return loadRecordIndex();
    } catch {
      return new RecordIndex();
    }
  });
  const [stored, setStored] = useState(() => index.size);

  const log = (line: string) => setLines((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 5000));

  const connect = async () => {
    setBusy(true);
    log('Connect pressed');
    try {
      const c = new RingClient(manager, log);
      client.current = c;
      c.onStatus = setStatus;
      log(`Bluetooth state: ${await manager.state()}`);
      await c.waitForPoweredOn();
      log('scanning for RingConn…');
      const dev = await c.findRing();
      const hex = macOverride.replace(/[^0-9a-fA-F]/g, '');
      const mac = hex.length === 12 ? Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16))) : undefined;
      await c.connectAndAuthenticate(dev, mac);
      stopHr.current = await c.startLiveHr(setHr);
      setConnected(true);
    } catch (e) {
      log(`ERROR ${(e as Error).message}`);
      setConnected(false);
      await client.current?.disconnect();
    } finally {
      setBusy(false);
    }
  };

  const syncHistory = async () => {
    const c = client.current;
    if (!c || busy) return;
    setBusy(true);
    stopHr.current?.();
    stopHr.current = null;
    setHr(null);
    try {
      // The official app opens at cursor ~ now; the ring drains whatever it has not handed off yet.
      const since = Math.floor(Date.now() / 1000);
      for (const [name, ch] of [['sleep', Channel.Sleep], ['awake', Channel.Awake]] as const) {
        const got: ActivityRecord[] = [];
        let fresh = 0;
        const res = await c.drainHistory(ch, since, (r) => {
          got.push(r);
          if (!index.has(r.timestamp)) {
            appendRecord(r); // throws on failure, so the drain stops before ACKing
            index.add(r);
            fresh++;
          }
        }, saveHistoryFrame);
        setStored(index.size);
        // The ring stores local wall-clock time; assume it is in this phone's zone.
        const offsetMin = -new Date().getTimezoneOffset();
        const times = got.map((r) => recordUnixSeconds(r, offsetMin) * 1000);
        const hrs = got.filter((r) => r.heartRate !== null).length;
        log(`${name}: ${res.records} records (${fresh} new, ${hrs} with HR) in ${res.frames} frames, ended=${res.ended}, ${index.size} stored` +
          (times.length
            ? `, ${new Date(Math.min(...times)).toLocaleString()} to ${new Date(Math.max(...times)).toLocaleString()}`
            : ''));
      }
    } catch (e) {
      log(`ERROR ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  /** Whole log as text, oldest first. Drops other people's nearby devices and the ring's MAC. */
  const shareLog = async () => {
    const text = [...lines]
      .reverse()
      .filter((l) => !/ saw /.test(l) || /RingConn/.test(l))
      .map((l) => l.replace(/(System ID|MAC candidate) [0-9a-fA-F]+/g, '$1 <redacted>'))
      .join('\n');
    await Share.share({ message: text });
  };

  /** Everything the ring has ever sent us (raw frames), for export. */
  const shareData = async () => {
    const data = readHistoryLines();
    log(`exporting ${data.length} saved frames`);
    await Share.share({ message: data.join('\n') || 'no saved history yet' });
  };

  const shareCsv = async () => {
    log(`exporting ${index.size} stored records as CSV`);
    await Share.share({ message: recordsToCsv(index.sorted()) });
  };

  const disconnect = async () => {
    stopHr.current?.();
    await client.current?.disconnect();
    setHr(null);
    setConnected(false);
    log('disconnected');
  };

  const tiles: { label: string; value: string; sub: string }[] = [
    {
      label: 'Battery',
      value: status ? `${status.batteryPercent}%` : '--',
      sub: status ? `${(status.batteryMv / 1000).toFixed(2)} V` : 'connect to read',
    },
    {
      label: 'Skin temp',
      value: status?.skinTempC1 != null ? `${status.skinTempC1.toFixed(1)}°` : '--',
      sub: status?.skinTempC2 != null ? `${status.skinTempC2.toFixed(1)}° second sensor` : 'celsius',
    },
    { label: 'Steps', value: status ? String(status.stepsInBucket) : '--', sub: 'this quarter-hour' },
    {
      label: 'Mode',
      value: status ? String(status.mode) : '--',
      sub: status?.charging ? 'charging' : 'raw ring mode',
    },
  ];

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="auto" />
      <View style={s.header}>
        <Text style={s.title}>OpenRing</Text>
        <View style={s.pill}>
          <View style={[s.dot, { backgroundColor: connected ? '#34C759' : c.muted }]} />
          <Text style={s.pillText}>{busy ? 'Working…' : connected ? 'Connected' : 'Not connected'}</Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardLabel}>Heart rate</Text>
        <View style={s.hrRow}>
          <Text style={[s.heart, { color: c.heart }]}>♥</Text>
          <Text style={s.hr}>{hr ?? '--'}</Text>
          <Text style={s.unit}>bpm</Text>
        </View>
      </View>

      <View style={s.grid}>
        {tiles.map((t) => (
          <View key={t.label} style={s.tile}>
            <Text style={s.cardLabel}>{t.label}</Text>
            <Text style={s.tileValue}>{t.value}</Text>
            <Text style={s.tileSub}>{t.sub}</Text>
          </View>
        ))}
      </View>

      <TextInput
        style={s.input}
        placeholder="MAC override (optional, 12 hex)"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={macOverride}
        onChangeText={setMacOverride}
      />

      <View style={s.row}>
        <Btn c={c} variant="primary" title={busy ? 'Working…' : 'Connect'} onPress={connect} disabled={busy} />
        <Btn c={c} title="Sync history" onPress={syncHistory} disabled={busy || !connected} />
        <Btn c={c} variant="danger" title="Disconnect" onPress={disconnect} disabled={!connected && !busy} />
      </View>
      <View style={[s.row, s.ghostRow]}>
        <Btn c={c} variant="ghost" title="Share log" onPress={shareLog} />
        <Btn c={c} variant="ghost" title="Frames" onPress={shareData} />
        <Btn c={c} variant="ghost" title={`CSV (${stored})`} onPress={shareCsv} />
        <Btn c={c} variant="ghost" title="Clear log" onPress={() => setLines([])} />
      </View>

      <View style={[s.card, s.logCard]}>
        <Text style={s.cardLabel}>Log</Text>
        <FlatList
          data={lines}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <Text style={s.log}>{item}</Text>}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
    title: { fontSize: 28, fontWeight: '700', color: c.text },
    pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: c.border },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    pillText: { fontSize: 13, color: c.text, fontWeight: '500' },
    card: { backgroundColor: c.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
    cardLabel: { fontSize: 12, color: c.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
    hrRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
    heart: { fontSize: 28, marginRight: 8 },
    hr: { fontSize: 64, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
    unit: { fontSize: 18, color: c.muted, marginLeft: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    tile: { width: '48.5%', backgroundColor: c.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
    tileValue: { fontSize: 26, fontWeight: '700', color: c.text, marginTop: 4, fontVariant: ['tabular-nums'] },
    tileSub: { fontSize: 12, color: c.muted, marginTop: 2 },
    input: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, color: c.text, fontSize: 14 },
    row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    ghostRow: { justifyContent: 'space-between', gap: 0 },
    logCard: { flex: 1, marginBottom: 0 },
    log: { fontFamily: 'Menlo', fontSize: 11, color: c.text, marginTop: 2 },
  });
