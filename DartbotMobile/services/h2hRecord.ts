import AsyncStorage from '@react-native-async-storage/async-storage';

const H2H_RECORD_KEY = 'dartbot:h2h-record';
const MATCH_HISTORY_KEY = 'dartbot:match-history';

export type H2HOutcome = 'userWin' | 'botWin' | 'draw';

export interface TurnDetail {
  turnNumber: number;
  scoreThrown: number;
  remainingBefore: number; // Score before this turn
  remainingAfter: number;  // Score after this turn
}

export interface LegDetail {
  legNumber: number;
  userTurns: TurnDetail[];
  botTurns: TurnDetail[];
  winner: 'user' | 'bot';
  userDartsThrown: number;  // Total darts in leg
  botDartsThrown: number;   // Total darts in leg
  userLegAverage: number;   // 3-dart average for leg
  botLegAverage: number;    // 3-dart average for leg
}

export interface MatchDetail {
  matchId: string;
  date: string; // ISO timestamp
  outcome: H2HOutcome;
  gameFormat: string; // e.g., "Best Of 3 Legs"
  level: string; // Bot level (1-50)
  legs: LegDetail[]; // Array of leg details
  userLegsWon: number;
  botLegsWon: number;
  userHighestFinish: number;
  username: string;
}

export interface H2HRecord {
  userWins: number;
  botWins: number;
  draws: number;
  totalMatches: number;
  updatedAt: string | null;
}

const DEFAULT_H2H_RECORD: H2HRecord = {
  userWins: 0,
  botWins: 0,
  draws: 0,
  totalMatches: 0,
  updatedAt: null,
};

export async function getH2HRecord(): Promise<H2HRecord> {
  try {
    const raw = await AsyncStorage.getItem(H2H_RECORD_KEY);
    if (!raw) {
      return DEFAULT_H2H_RECORD;
    }

    const parsed = JSON.parse(raw) as Partial<H2HRecord>;
    const userWins = Number(parsed.userWins) || 0;
    const botWins = Number(parsed.botWins) || 0;
    const draws = Number(parsed.draws) || 0;

    return {
      userWins,
      botWins,
      draws,
      totalMatches: userWins + botWins + draws,
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch (error) {
    console.error('Failed to load H2H record:', error);
    return DEFAULT_H2H_RECORD;
  }
}

/**
 * Get all match history details
 */
export async function getMatchHistory(): Promise<MatchDetail[]> {
  try {
    const raw = await AsyncStorage.getItem(MATCH_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const matches = JSON.parse(raw) as MatchDetail[];
    // Sort by date, most recent first
    return matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('Failed to load match history:', error);
    return [];
  }
}

export async function recordH2HResult(outcome: H2HOutcome): Promise<H2HRecord> {
  const current = await getH2HRecord();

  const next: H2HRecord = {
    ...current,
    userWins: current.userWins + (outcome === 'userWin' ? 1 : 0),
    botWins: current.botWins + (outcome === 'botWin' ? 1 : 0),
    draws: current.draws + (outcome === 'draw' ? 1 : 0),
    totalMatches: current.totalMatches + 1,
    updatedAt: new Date().toISOString(),
  };

  try {
    await AsyncStorage.setItem(H2H_RECORD_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Failed to save H2H record:', error);
  }

  return next;
}

/**
 * Record a complete match with leg-by-leg breakdown
 */
export async function recordMatchDetail(match: MatchDetail): Promise<void> {
  try {
    const history = await getMatchHistory();
    history.unshift(match); // Add to front
    // Keep last 100 matches to avoid storage bloat
    const trimmed = history.slice(0, 100);
    await AsyncStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save match detail:', error);
  }
}

export async function resetH2HRecord(): Promise<void> {
  try {
    await AsyncStorage.removeItem(H2H_RECORD_KEY);
    await AsyncStorage.removeItem(MATCH_HISTORY_KEY);
  } catch (error) {
    console.error('Failed to reset H2H record:', error);
  }
}
