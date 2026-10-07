import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import { SafeAreaView, Share, StyleSheet, Text, View } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { RingClient } from './src/ble/RingClient';
import { TabName, demoRecords, readDemoTab } from './src/demo';
import { ActivityRecord, Channel, Descriptor, recordUnixSeconds } from './src/protocol';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { LogScreen } from './src/screens/LogScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { appendRecord, loadRecordIndex, readHistoryLines, saveHistoryFrame } from './src/store/historyStore';
import { RecordIndex, recordsToCsv } from './src/store/recordIndex';
import { TabBar } from './src/ui/components';
import { usePalette } from './src/ui/theme';

const DEMO_STATUS: Descriptor = { batteryPercent: 80, mode: 3, charging: false, stepsInBucket: 123, skinTempC1: 29.2, skinTempC2: 30.5, batteryMv: 4147 };
const DEMO_LINES = [
  '6:25:49 AM sleep: 4 records (4 new, 4 with HR) in 1 frames, ended=true, 1 stored',
  '6:25:46 AM -> cc0000',
  '6:25:45 AM history: open channel 0',
  '6:25:29 AM authenticated',
  '6:25:24 AM found RingConn Gen2-XXXX',
  'DEMO MODE: sample values, not from a ring',
];
const TABS: { key: TabName; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'history', label: 'History' },
  { key: 'log', label: 'Log' },
];

export default function App() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const [demoTab] = useState(readDemoTab);
  const demo = demoTab !== null;
  const [tab, setTab] = useState<TabName>(demoTab ?? 'today');
  const [connected, setConnected] = useState(demo);
  const managerRef = useRef<BleManager | null>(null);
  managerRef.current ??= new BleManager();
  const manager = managerRef.current;
  const client = useRef<RingClient | null>(null);
  const stopHr = useRef<(() => void) | null>(null);
  const [lines, setLines] = useState<string[]>(demo ? DEMO_LINES : []);
  const [hr, setHr] = useState<number | null>(demo ? 72 : null);
  const [busy, setBusy] = useState(false);
  const [macOverride, setMacOverride] = useState('');
  const [status, setStatus] = useState<Descriptor | null>(demo ? DEMO_STATUS : null);
  const [lastSync, setLastSync] = useState<string | null>(demo ? '4 new records, 6:25 AM' : null);
  const [index] = useState<RecordIndex>(() => {
    if (demo) {
      const idx = new RecordIndex(); // demo records are never written to disk
      demoRecords().forEach((r) => idx.add(r));
      return idx;
    }
    try {
      return loadRecordIndex();
    } catch {
      return new RecordIndex();
    }
  });
  const [stored, setStored] = useState(() => index.size);
  // `stored` changes whenever the index does, so it keys the sorted copy.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = useMemo(() => index.sorted(), [index, stored]);

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
      let totalFresh = 0;
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
        totalFresh += fresh;
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
      setLastSync(`${totalFresh} new record${totalFresh === 1 ? '' : 's'}, ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
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

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.root}>
        <StatusBar style="auto" />
        <View style={s.header}>
          <Text style={s.title}>OpenRing</Text>
          <View style={s.pill}>
            <View style={[s.dot, { backgroundColor: connected ? '#34C759' : c.muted }]} />
            <Text style={s.pillText}>{demo ? 'Demo' : busy ? 'Working…' : connected ? 'Connected' : 'Not connected'}</Text>
          </View>
        </View>

        <View style={s.body}>
          {tab === 'today' && (
            <TodayScreen
              c={c}
              hr={hr}
              status={status}
              connected={connected}
              busy={busy}
              lastSync={lastSync}
              stored={stored}
              onConnect={connect}
              onSync={syncHistory}
              onDisconnect={disconnect}
            />
          )}
          {tab === 'history' && <HistoryScreen c={c} records={records} />}
          {tab === 'log' && (
            <LogScreen
              c={c}
              lines={lines}
              macOverride={macOverride}
              onMacOverride={setMacOverride}
              stored={stored}
              onShareLog={shareLog}
              onShareFrames={shareData}
              onShareCsv={shareCsv}
              onClear={() => setLines([])}
            />
          )}
        </View>
      </View>
      <TabBar c={c} tabs={TABS} active={tab} onChange={setTab} />
    </SafeAreaView>
  );
}

const makeStyles = (c: ReturnType<typeof usePalette>) =>
  StyleSheet.create({
    // SafeAreaView ignores padding on iOS, so the padding lives on an inner View.
    safe: { flex: 1, backgroundColor: c.bg },
    root: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
    title: { fontSize: 28, fontWeight: '700', color: c.text },
    pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: c.border },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    pillText: { fontSize: 13, color: c.text, fontWeight: '500' },
    body: { flex: 1 },
  });
