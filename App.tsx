import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Button, FlatList, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { RingClient } from './src/ble/RingClient';

export default function App() {
  const manager = useRef(new BleManager()).current;
  const client = useRef<RingClient | null>(null);
  const stopHr = useRef<(() => void) | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [hr, setHr] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [macOverride, setMacOverride] = useState('');

  const log = (line: string) => setLines((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 200));

  const connect = async () => {
    setBusy(true);
    try {
      const c = new RingClient(manager, log);
      client.current = c;
      await c.waitForPoweredOn();
      const dev = await c.findRing();
      const hex = macOverride.replace(/[^0-9a-fA-F]/g, '');
      const mac = hex.length === 12 ? Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16))) : undefined;
      await c.connectAndAuthenticate(dev, mac);
      stopHr.current = await c.startLiveHr(setHr);
    } catch (e) {
      log(`ERROR ${(e as Error).message}`);
      await client.current?.disconnect();
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    stopHr.current?.();
    await client.current?.disconnect();
    setHr(null);
    log('disconnected');
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="auto" />
      <Text style={s.title}>OpenRing</Text>
      <Text style={s.hr}>{hr ?? '--'} <Text style={s.unit}>bpm</Text></Text>
      <TextInput style={s.input} placeholder="MAC override (optional, 12 hex)" autoCapitalize="none"
        value={macOverride} onChangeText={setMacOverride} />
      <View style={s.row}>
        <Button title={busy ? 'Working…' : 'Connect'} onPress={connect} disabled={busy} />
        <Button title="Disconnect" onPress={disconnect} />
      </View>
      <FlatList data={lines} keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <Text style={s.log}>{item}</Text>} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, paddingTop: 48 },
  title: { fontSize: 24, fontWeight: '600' },
  hr: { fontSize: 56, fontWeight: '700', marginVertical: 8 },
  unit: { fontSize: 18, fontWeight: '400' },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 8, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  log: { fontFamily: 'Menlo', fontSize: 11 },
});
