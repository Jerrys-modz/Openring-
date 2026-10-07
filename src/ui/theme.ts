import { useColorScheme } from 'react-native';

export const palettes = {
  light: { bg: '#F2F2F7', card: '#FFFFFF', text: '#111113', muted: '#6B6B72', border: '#D8D8DE', accent: '#0A84FF', onAccent: '#FFFFFF', danger: '#D70015', heart: '#E5384F', good: '#1F9D45' },
  dark: { bg: '#000000', card: '#1C1C1E', text: '#F2F2F7', muted: '#98989F', border: '#38383A', accent: '#4DA3FF', onAccent: '#001B33', danger: '#FF6961', heart: '#FF5A6E', good: '#34C759' },
};
export type Palette = typeof palettes.light;

export const usePalette = (): Palette => palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
