// GATT identifiers and protocol constants for the RingConn ring (see docs/PLAN.md).

export const SERVICE_UUID = '8327ad99-2d87-4a22-a8ce-6dd7971c0437';
export const WRITE_CHAR_UUID = '8327ad98-2d87-4a22-a8ce-6dd7971c0437';
export const NOTIFY_CHAR_UUID = '8327ad97-2d87-4a22-a8ce-6dd7971c0437';

// Standard Device Information service; System ID carries the ring's MAC.
export const DIS_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
export const DIS_SYSTEM_ID_UUID = '00002a23-0000-1000-8000-00805f9b34fb';

export const DEVICE_NAME_PREFIX = 'RingConn';

/** History cursor epoch: 2019-12-31 12:00:00 UTC, in unix seconds. */
export const CURSOR_EPOCH = 1577793600;

export enum Op {
  Status = 0x01,
  SyncOpen = 0x02,
  LiveHrMode = 0x06,
  Fetch = 0x07,
  Poll = 0x95,
  StatusQuery = 0xd0,
  AckPpg = 0xc7,
  AckActivity = 0xcc,
}

export enum Resp {
  Status = 0x81,
  Descriptor = 0x10,
  DescriptorAlt = 0x87,
  LiveHr = 0x15,
  BulkPpg = 0x47,
  BulkActivity = 0x4c,
  EndOfHistory = 0x50,
}

/** History channel selector (byte 6 of the sync-open command). */
export enum Channel {
  Sleep = 0x00,
  Awake = 0x03,
}
