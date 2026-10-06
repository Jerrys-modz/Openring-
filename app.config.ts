import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'OpenRing',
  slug: 'openring',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    // Change to an identifier registered under your Apple Developer team.
    bundleIdentifier: 'com.jerrysmodz.openring',
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  plugins: [
    'expo-dev-client',
    [
      'react-native-ble-plx',
      {
        modes: ['central'],
        bluetoothAlwaysPermission: 'OpenRing connects to your RingConn ring to read your health data.',
      },
    ],
  ],
};

export default config;
