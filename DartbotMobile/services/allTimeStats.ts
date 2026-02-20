import AsyncStorage from '@react-native-async-storage/async-storage';

const ALL_TIME_STATS_KEY = 'dartbot:all-time-user-stats';

type ScoreRangeKey = '180' | '171+' | '151+' | '131+' | '111+' | '91+' | '71+' | '51+' | '31+';

export interface ScoreRangeCounts {
  '180': number;
  '171+': number;
  '151+': number;
  '131+': number;
  '111+': number;
  '91+': number;
  '71+': number;
  '51+': number;
  '31+': number;
}

export interface AllTimeUserStats {
  matchesCompleted: number;
  totalLegsPlayed: number;
  totalScore: number;
  totalDartsThrown: number;
  first9ScoreTotal: number;
  first9DartsTotal: number;
  checkoutAttempts: number;
  checkoutSuccess: number;
  highestFinish: number;
  highestScore: number;
  bestLegDarts: number | null;
  scoreRanges: ScoreRangeCounts;
  updatedAt: string | null;
}

export interface CompletedMatchUserStatsInput {
  userThrows: number[];
  cumulativeCheckoutAttempts: number;
  cumulativeCheckoutSuccess: number;
  userHighestFinish: number;
  userBestLeg: number;
  legsPlayed: number;
}

const EMPTY_SCORE_RANGES: ScoreRangeCounts = {
  '180': 0,
  '171+': 0,
  '151+': 0,
  '131+': 0,
  '111+': 0,
  '91+': 0,
  '71+': 0,
  '51+': 0,
  '31+': 0,
};

const DEFAULT_ALL_TIME_STATS: AllTimeUserStats = {
  matchesCompleted: 0,
  totalLegsPlayed: 0,
  totalScore: 0,
  totalDartsThrown: 0,
  first9ScoreTotal: 0,
  first9DartsTotal: 0,
  checkoutAttempts: 0,
  checkoutSuccess: 0,
  highestFinish: 0,
  highestScore: 0,
  bestLegDarts: null,
  scoreRanges: EMPTY_SCORE_RANGES,
  updatedAt: null,
};

function sanitizeScoreRanges(raw?: Partial<ScoreRangeCounts>): ScoreRangeCounts {
  return {
    '180': Number(raw?.['180']) || 0,
    '171+': Number(raw?.['171+']) || 0,
    '151+': Number(raw?.['151+']) || 0,
    '131+': Number(raw?.['131+']) || 0,
    '111+': Number(raw?.['111+']) || 0,
    '91+': Number(raw?.['91+']) || 0,
    '71+': Number(raw?.['71+']) || 0,
    '51+': Number(raw?.['51+']) || 0,
    '31+': Number(raw?.['31+']) || 0,
  };
}

function countMatchScoreRanges(throws: number[]): ScoreRangeCounts {
  const counts: ScoreRangeCounts = { ...EMPTY_SCORE_RANGES };

  for (const score of throws) {
    if (score === 180) counts['180'] += 1;
    else if (score >= 171 && score <= 179) counts['171+'] += 1;
    else if (score >= 151 && score <= 170) counts['151+'] += 1;
    else if (score >= 131 && score <= 150) counts['131+'] += 1;
    else if (score >= 111 && score <= 130) counts['111+'] += 1;
    else if (score >= 91 && score <= 110) counts['91+'] += 1;
    else if (score >= 71 && score <= 90) counts['71+'] += 1;
    else if (score >= 51 && score <= 70) counts['51+'] += 1;
    else if (score >= 31 && score <= 50) counts['31+'] += 1;
  }

  return counts;
}

export async function getAllTimeUserStats(): Promise<AllTimeUserStats> {
  try {
    const raw = await AsyncStorage.getItem(ALL_TIME_STATS_KEY);
    if (!raw) return DEFAULT_ALL_TIME_STATS;

    const parsed = JSON.parse(raw) as Partial<AllTimeUserStats>;

    return {
      matchesCompleted: Number(parsed.matchesCompleted) || 0,
      totalLegsPlayed: Number(parsed.totalLegsPlayed) || 0,
      totalScore: Number(parsed.totalScore) || 0,
      totalDartsThrown: Number(parsed.totalDartsThrown) || 0,
      first9ScoreTotal: Number(parsed.first9ScoreTotal) || 0,
      first9DartsTotal: Number(parsed.first9DartsTotal) || 0,
      checkoutAttempts: Number(parsed.checkoutAttempts) || 0,
      checkoutSuccess: Number(parsed.checkoutSuccess) || 0,
      highestFinish: Number(parsed.highestFinish) || 0,
      highestScore: Number(parsed.highestScore) || 0,
      bestLegDarts: parsed.bestLegDarts === null || parsed.bestLegDarts === undefined ? null : Number(parsed.bestLegDarts) || null,
      scoreRanges: sanitizeScoreRanges(parsed.scoreRanges),
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch (error) {
    console.error('Failed to load all-time user stats:', error);
    return DEFAULT_ALL_TIME_STATS;
  }
}

export async function recordCompletedMatchUserStats(input: CompletedMatchUserStatsInput): Promise<AllTimeUserStats> {
  const current = await getAllTimeUserStats();

  const throws = input.userThrows ?? [];
  const matchScoreTotal = throws.reduce((sum, value) => sum + value, 0);
  const matchDartsThrown = throws.length * 3;
  const first3Throws = throws.slice(0, 3);
  const matchFirst9Score = first3Throws.reduce((sum, value) => sum + value, 0);
  const matchFirst9Darts = first3Throws.length * 3;
  const matchHighestScore = throws.length > 0 ? Math.max(...throws) : 0;
  const matchRanges = countMatchScoreRanges(throws);

  const bestLegDarts =
    input.userBestLeg > 0
      ? current.bestLegDarts === null
        ? input.userBestLeg
        : Math.min(current.bestLegDarts, input.userBestLeg)
      : current.bestLegDarts;

  const scoreRangeKeys: ScoreRangeKey[] = ['180', '171+', '151+', '131+', '111+', '91+', '71+', '51+', '31+'];
  const mergedRanges = scoreRangeKeys.reduce((acc, key) => {
    acc[key] = current.scoreRanges[key] + matchRanges[key];
    return acc;
  }, { ...EMPTY_SCORE_RANGES });

  const next: AllTimeUserStats = {
    matchesCompleted: current.matchesCompleted + 1,
    totalLegsPlayed: current.totalLegsPlayed + Math.max(0, input.legsPlayed || 0),
    totalScore: current.totalScore + matchScoreTotal,
    totalDartsThrown: current.totalDartsThrown + matchDartsThrown,
    first9ScoreTotal: current.first9ScoreTotal + matchFirst9Score,
    first9DartsTotal: current.first9DartsTotal + matchFirst9Darts,
    checkoutAttempts: current.checkoutAttempts + Math.max(0, input.cumulativeCheckoutAttempts || 0),
    checkoutSuccess: current.checkoutSuccess + Math.max(0, input.cumulativeCheckoutSuccess || 0),
    highestFinish: Math.max(current.highestFinish, input.userHighestFinish || 0),
    highestScore: Math.max(current.highestScore, matchHighestScore),
    bestLegDarts,
    scoreRanges: mergedRanges,
    updatedAt: new Date().toISOString(),
  };

  try {
    await AsyncStorage.setItem(ALL_TIME_STATS_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Failed to save all-time user stats:', error);
  }

  return next;
}

export async function resetAllTimeUserStats(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ALL_TIME_STATS_KEY);
  } catch (error) {
    console.error('Failed to reset all-time user stats:', error);
  }
}
