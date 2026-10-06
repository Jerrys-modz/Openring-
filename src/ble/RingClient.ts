import { BleError, BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import {
  DEVICE_NAME_PREFIX, DIS_SERVICE_UUID, DIS_SYSTEM_ID_UUID, NOTIFY_CHAR_UUID, Resp,
  SERVICE_UUID, WRITE_CHAR_UUID, buildAuthResponse, buildLiveHrMode, buildLiveHrPoll,
  buildCommand, macCandidatesFromSystemId, parseAuthChallenge, parseLiveHr,
} from '../protocol';
import { base64ToBytes, bytesToBase64, bytesToHex } from '../util/base64';

type Bytes = Uint8Array;
type Log = (line: string) => void;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Connects to a RingConn ring, authenticates, and streams live heart rate. */
export class RingClient {
  private device: Device | null = null;
  private sub: Subscription | null = null;
  private inbox: Bytes[] = [];
  private waiters: Array<{ pred: (b: Bytes) => boolean; resolve: (b: Bytes) => void }> = [];

  constructor(private readonly manager: BleManager, private readonly log: Log) {}

  async waitForPoweredOn(timeoutMs = 10000): Promise<void> {
    if ((await this.manager.state()) === State.PoweredOn) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { s.remove(); reject(new Error('Bluetooth not powered on')); }, timeoutMs);
      const s = this.manager.onStateChange((st) => {
        if (st === State.PoweredOn) { clearTimeout(timer); s.remove(); resolve(); }
      }, true);
    });
  }

  findRing(timeoutMs = 15000): Promise<Device> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.manager.stopDeviceScan();
        reject(new Error('No RingConn found. Take the ring off the charger and close the RingConn app.'));
      }, timeoutMs);
      this.manager.startDeviceScan(null, { allowDuplicates: false }, (err: BleError | null, dev: Device | null) => {
        if (err) { clearTimeout(timer); reject(err); return; }
        const name = dev?.name ?? dev?.localName ?? '';
        if (dev && name.startsWith(DEVICE_NAME_PREFIX)) {
          clearTimeout(timer);
          this.manager.stopDeviceScan();
          this.log(`found ${name} (${dev.id})`);
          resolve(dev);
        }
      });
    });
  }

  /** Connect, read the MAC, subscribe, and complete the SM3 handshake. */
  async connectAndAuthenticate(dev: Device, macOverride?: Bytes): Promise<void> {
    this.device = await dev.connect();
    await this.device.discoverAllServicesAndCharacteristics();
    this.log('connected, services discovered');

    // Subscribe first so the ring's challenge is not missed.
    this.sub = this.device.monitorCharacteristicForService(SERVICE_UUID, NOTIFY_CHAR_UUID, (err, ch) => {
      if (err || !ch?.value) { if (err) this.log(`notify error: ${err.message}`); return; }
      const data = base64ToBytes(ch.value);
      this.log(`<- ${bytesToHex(data)}`);
      this.dispatch(data);
    });

    const candidates = macOverride ? [macOverride] : await this.readMacCandidates();

    let challengeFrame = await this.waitFor((b) => parseAuthChallenge(b) !== null, 1500).catch(() => null);
    if (!challengeFrame) {
      this.log('no spontaneous challenge, sending status read');
      await this.write(buildCommand(0x01, 0x00));
      challengeFrame = await this.waitFor((b) => parseAuthChallenge(b) !== null, 3000);
    }
    const challenge = parseAuthChallenge(challengeFrame) as number;
    this.log(`challenge 0x${challenge.toString(16)}`);

    for (const mac of candidates) {
      this.log(`auth with MAC candidate ${bytesToHex(mac)}`);
      await this.write(buildAuthResponse(mac, challenge));
      const ok = await this.waitFor((b) => b[0] === Resp.Status && b[1] === 0x01, 2500).catch(() => null);
      if (ok) { this.log('authenticated'); return; }
    }
    throw new Error('Authentication failed for every MAC candidate (see log for the System ID)');
  }

  private async readMacCandidates(): Promise<Bytes[]> {
    const ch = await this.device!.readCharacteristicForService(DIS_SERVICE_UUID, DIS_SYSTEM_ID_UUID);
    const id = base64ToBytes(ch.value ?? '');
    this.log(`System ID ${bytesToHex(id)}`);
    const candidates = macCandidatesFromSystemId(id);
    if (candidates.length === 0) throw new Error('Unrecognised System ID format');
    return candidates;
  }

  /** Enter live HR mode and poll about every 2.2 s. Returns a stop function. */
  async startLiveHr(onHr: (bpm: number | null) => void): Promise<() => void> {
    await this.write(buildLiveHrMode());
    let running = true;
    (async () => {
      while (running) {
        try {
          await this.write(buildLiveHrPoll());
          const frame = await this.waitFor((b) => b[0] === Resp.LiveHr, 2000);
          onHr(parseLiveHr(frame));
        } catch (e) {
          this.log(`live HR: ${(e as Error).message}`);
        }
        await sleep(2200); // polling faster resets the sensor's warm-up
      }
    })();
    return () => { running = false; };
  }

  async disconnect(): Promise<void> {
    this.sub?.remove();
    this.sub = null;
    await this.device?.cancelConnection().catch(() => undefined);
    this.device = null;
    this.inbox = [];
    this.waiters = [];
  }

  private async write(data: Bytes): Promise<void> {
    this.log(`-> ${bytesToHex(data)}`);
    await this.device!.writeCharacteristicWithResponseForService(SERVICE_UUID, WRITE_CHAR_UUID, bytesToBase64(data))
      .catch(() => this.device!.writeCharacteristicWithoutResponseForService(SERVICE_UUID, WRITE_CHAR_UUID, bytesToBase64(data)));
  }

  private dispatch(data: Bytes): void {
    const i = this.waiters.findIndex((w) => w.pred(data));
    if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(data);
    else this.inbox.push(data);
  }

  private waitFor(pred: (b: Bytes) => boolean, timeoutMs: number): Promise<Bytes> {
    const hit = this.inbox.findIndex(pred);
    if (hit >= 0) return Promise.resolve(this.inbox.splice(hit, 1)[0]!);
    return new Promise((resolve, reject) => {
      const waiter = { pred, resolve: (b: Bytes) => { clearTimeout(timer); resolve(b); } };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error('timeout'));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }
}
