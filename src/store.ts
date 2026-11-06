import AsyncStorage from '@react-native-async-storage/async-storage';
import bundled from './assets/model.json';

export type Sample = { l: string; v: number[] };
const KEY = 'lsm:samples:v1';

// Prioridad: muestras guardadas en el dispositivo → modelo empaquetado en la app
export async function loadSamples(): Promise<Sample[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return (bundled as { samples: Sample[] }).samples ?? [];
}

export const saveSamples = (s: Sample[]) =>
  AsyncStorage.setItem(KEY, JSON.stringify(s));