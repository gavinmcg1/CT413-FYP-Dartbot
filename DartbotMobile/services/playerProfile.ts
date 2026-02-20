import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYER_NAME_KEY = 'dartbot:player-name';
const DEFAULT_PLAYER_NAME = 'Player';

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_PLAYER_NAME;
  return trimmed.slice(0, 24);
}

export async function getPlayerName(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(PLAYER_NAME_KEY);
    if (!stored) return DEFAULT_PLAYER_NAME;
    return normalizeName(stored);
  } catch (error) {
    console.error('Failed to load player name:', error);
    return DEFAULT_PLAYER_NAME;
  }
}

export async function setPlayerName(name: string): Promise<string> {
  const normalized = normalizeName(name);
  try {
    await AsyncStorage.setItem(PLAYER_NAME_KEY, normalized);
  } catch (error) {
    console.error('Failed to save player name:', error);
  }
  return normalized;
}
