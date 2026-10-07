import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'OpenRing',
  slug: 'openring',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  extra: { eas: { projectId: 'ef767628-eaaf-4b27-8e87-dfae908d062a' } },
  ios: {
    // Change to an identifier registered under your Apple Developer team.
    bundleIdentifier: 'com.jerrysmodz.openring',
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  plugins: [
    'expo-dev-client',
    [
      '@kingstinct/react-native-healthkit',
      {
        NSHealthShareUsageDescription: "OpenRing only saves your ring's data to Health. It does not read your other health data.",
        NSHealthUpdateUsageDescription: 'OpenRing saves heart rate and steps from your RingConn ring to Apple Health.',
        // No background delivery: nothing here observes Health, so skip that entitlement.
        background: false,
      },
    ],
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
