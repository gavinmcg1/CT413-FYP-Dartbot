import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, Modal, Platform, BackHandler } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { dartbotAPI } from '../../services/dartbotAPI';
import { simulateBotTurn, simulateDartAtTarget, parseCheckoutTarget, getAverageRangeForLevel, setSimulationResults, setAverageRangeForSimulation, setDoubleOutcomesResults, applyIntendedHitVariance } from '../../utils/dartGameIntegration';

/**
 * Count the number of darts in a checkout sequence
 * Sequences are comma-separated (e.g., "t20,t14,d11" has 3 darts)
 */
function countDartsInSequence(sequence: string): number {
  if (!sequence || typeof sequence !== 'string') return 0;
  return sequence.split(',').length;
}

/**
 * Filter checkout candidates to only those that can be completed with remaining darts
 * @param candidates - Array of checkout sequences (comma-separated)
 * @param remainingDarts - Number of darts left in the turn (1-3)
 * @returns Filtered candidates that can be completed with remaining darts
 */
function filterCandidatesByDarts(candidates: string[], remainingDarts: number): string[] {
  if (!candidates || candidates.length === 0) return [];
  return candidates.filter(seq => {
    const dartCount = countDartsInSequence(seq);
    return dartCount <= remainingDarts;
  });
}

/**
 * Single-dart finishable scores (doubles 2-40 and Bull)
 */
const SINGLE_DART_FINISHES = new Set([
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 50
]);

const IMPOSSIBLE_CHECKOUT_SCORES = new Set([1, 159, 162, 163, 165, 166, 168, 169]);

function formatCheckoutTokenForDisplay(token: string): string {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return '';

  if (normalized === 'ibull') return 'Bull';
  if (normalized === 'obull') return '25';

  const tripleMatch = normalized.match(/^t(\d{1,2})$/);
  if (tripleMatch) return `T${parseInt(tripleMatch[1], 10)}`;

  const doubleMatch = normalized.match(/^d(\d{1,2})$/);
  if (doubleMatch) return `D${parseInt(doubleMatch[1], 10)}`;

  const singleMatch = normalized.match(/^[sio](\d{1,2})$/);
  if (singleMatch) return `S${parseInt(singleMatch[1], 10)}`;

  return normalized.toUpperCase();
}

function formatCheckoutSequenceForDisplay(sequence: string | null): string {
  if (!sequence) return '';
  return sequence
    .split(',')
    .map((token) => formatCheckoutTokenForDisplay(token))
    .filter(Boolean)
    .join('  ');
}

/**
 * Calculate fallback quality for a checkout route
 * Higher score = better fallback (if treble is missed and becomes single)
 */
function calculateFallbackQuality(sequence: string, startingScore: number): number {
  const targets = sequence.split(',');
  if (targets.length < 2) return 0;
  
  const firstTarget = targets[0];
  const match = firstTarget.match(/^([tdiobs])(\d+)/i);
  if (!match) return 0;
  
  const [, prefix, valueStr] = match;
  const value = parseInt(valueStr, 10);
  
  // Only calculate fallback for trebles
  if (prefix.toLowerCase() !== 't') return 0;
  
  // If treble is missed, assume single is hit
  const singleScore = value;
  const fallbackRemaining = startingScore - singleScore;
  
  // Big bonus if fallback leaves a single-dart finish
  if (SINGLE_DART_FINISHES.has(fallbackRemaining)) {
    // Extra bonus for Bull (50) - easiest single finish
    if (fallbackRemaining === 50) return 100;
    // Good bonus for D20 (40) or D16 (32) - common finishes
    if (fallbackRemaining === 40 || fallbackRemaining === 32) return 80;
    // Standard bonus for other doubles
    return 60;
  }
  
  // Small bonus if fallback leaves a 2-dart finish
  if (fallbackRemaining > 50 && fallbackRemaining <= 110) return 20;
  
  return 0;
}

/**
 * Get the first valid checkout sequence from API recommendation
 * Filters candidates by remaining darts and returns the best one
 * SMART: When exactly 2 darts remain, re-ranks by fallback quality
 * @param recommendation - API recommendation object
 * @param remainingDarts - Number of darts left in the turn
 * @param currentScore - Current score remaining (for fallback calculation)
 * @returns First valid sequence string, or null if none available
 */
function getBestValidCheckoutSequence(
  recommendation: any,
  remainingDarts: number,
  currentScore?: number
): string | null {
  if (!recommendation) return null;
  
  // Get all candidates from API response
  const allCandidates = recommendation.all_candidates || [];
  if (allCandidates.length > 0) {
    // Filter candidates by dart count
    let validCandidates = filterCandidatesByDarts(allCandidates, remainingDarts);
    
    // SMART SELECTION: Only for specific 2-dart scores where treble-first fallback matters
    // - 61 to 70 (single leaves useful doubles/bull options)
    // - 101, 104, 107, 110 (special prompt scores)
    const smartFallbackScores = new Set([101, 104, 107, 110]);
    const shouldRerankByFallback =
      remainingDarts === 2 &&
      typeof currentScore === 'number' &&
      ((currentScore >= 61 && currentScore <= 70) || smartFallbackScores.has(currentScore));

    if (validCandidates.length > 1 && shouldRerankByFallback) {
      const candidatesWithQuality = validCandidates.map(seq => ({
        sequence: seq,
        quality: calculateFallbackQuality(seq, currentScore)
      }));
      
      // Sort by fallback quality (descending), keeping original order as tiebreaker
      candidatesWithQuality.sort((a, b) => b.quality - a.quality);
      
      validCandidates = candidatesWithQuality.map(c => c.sequence);
      
      // Log if we're changing the route due to fallback quality
      if (candidatesWithQuality[0].quality > 0 && candidatesWithQuality[0].sequence !== allCandidates[0]) {
        console.log(`[SMART CHECKOUT] 2 darts on ${currentScore}: Preferring ${candidatesWithQuality[0].sequence} over ${allCandidates[0]} (fallback quality: ${candidatesWithQuality[0].quality})`);
      }
    }
    
    if (validCandidates.length > 0) {
      return validCandidates[0]; // Return best valid sequence
    }
  }
  
  // Fallback to best sequence if all_candidates not available
  if (recommendation.best?.sequence) {
    const dartCount = countDartsInSequence(recommendation.best.sequence);
    if (dartCount <= remainingDarts) {
      return recommendation.best.sequence;
    }
  }
  
  return null;
}

export default function GameScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();

  type Player = 'user' | 'dartbot';

  const startingScore = useMemo(() => {
    const parsed = parseInt(params.startingScore as string, 10);
    return Number.isFinite(parsed) ? parsed : 501;
  }, [params.startingScore]);

  const outRule = (params.outRule as string) || 'double';
  const inRule = (params.inRule as string) || 'straight'; // 'straight' or 'double'
  const level = parseInt(params.level as string, 10) || 10; // 1-18 from setup screen
  const formatType = (params.formatType as string) || 'First To'; // "Best Of" or "First To"
  const legOrSet = (params.legOrSet as string) || 'Legs'; // "Legs" or "Sets"
  const formatNumber = parseInt(params.formatNumber as string, 10) || 1; // e.g., 3, 5, 7
  const gameFormat = `${formatType} ${formatNumber} ${legOrSet}`;
  const [userScore, setUserScore] = useState<number>(startingScore);
  const [botScore, setBotScore] = useState<number>(startingScore);
  const initialFirstPlayer = (params.firstPlayer as Player) || 'user';
  const [currentPlayer, setCurrentPlayer] = useState<Player>(initialFirstPlayer);
  const [inputScore, setInputScore] = useState<string>('0');
  const [status, setStatus] = useState<string>('Enter your score');
  const [winner, setWinner] = useState<Player | null>(null);
  const [matchWinner, setMatchWinner] = useState<Player | null>(null);
  const [,setBotThinking] = useState<boolean>(false);

  useEffect(() => {
    let isActive = true;
    const averageRange = getAverageRangeForLevel(level);
    setAverageRangeForSimulation(averageRange);
    Promise.all([
      dartbotAPI.getSimulationResults(),
      dartbotAPI.getDoubleOutcomes(),
    ]).then(([simulationData, doubleOutcomesData]) => {
      if (!isActive) return;
      setSimulationResults(simulationData, averageRange);
      setDoubleOutcomesResults(doubleOutcomesData);
    });
    return () => {
      isActive = false;
    };
  }, [level]);

  // Leg/Set tracking
  const requiredToWin = useMemo(() => {
    if (formatType === 'Best Of') {
      // For "Best Of" formats (legs or sets), you need a majority:
      // e.g., Best Of 3 => 2, Best Of 5 => 3, etc.
      return Math.ceil(formatNumber / 2);
    }
    // For "First To" formats (legs or sets), you need exactly formatNumber.
    return formatNumber;
  }, [formatType, formatNumber, legOrSet]);

  const [userLegsWon, setUserLegsWon] = useState<number>(0);
  const [botLegsWon, setBotLegsWon] = useState<number>(0);
  const [currentLegNumber, setCurrentLegNumber] = useState<number>(1);
  
  // Sets tracking
  const [userSetsWon, setUserSetsWon] = useState<number>(0);
  const [botSetsWon, setBotSetsWon] = useState<number>(0);
  const legsToWinSet = 3; // Always 3 legs to win a set

  // Stats tracking
  const [userThrows, setUserThrows] = useState<number[]>([]);
  const [userBestLeg, setUserBestLeg] = useState<number>(0);
  const [userWorstLeg, setUserWorstLeg] = useState<number>(0);
  const [userCheckoutDarts, setUserCheckoutDarts] = useState<number | null>(null);
  const [userCheckoutDoubles, setUserCheckoutDoubles] = useState<number | null>(null);
  const [doubleAttempts, setDoubleAttempts] = useState<number>(0);
  const [currentLegStartIndex, setCurrentLegStartIndex] = useState<number>(0);
  
  // Bot stats tracking
  const [botThrows, setBotThrows] = useState<number[]>([]);
  const [botBestLeg, setBotBestLeg] = useState<number>(0);
  const [botWorstLeg, setBotWorstLeg] = useState<number>(0);
  const [botCheckoutDarts, setBotCheckoutDarts] = useState<number | null>(null);
  const [botCheckoutDoubles, setBotCheckoutDoubles] = useState<number | null>(null);
  const [botDoubleAttempts, setBotDoubleAttempts] = useState<number>(0);
  const [botCurrentLegStartIndex, setBotCurrentLegStartIndex] = useState<number>(0);
  
  // Cumulative stats across all legs
  const [cumulativeDoubleAttempts, setCumulativeDoubleAttempts] = useState<number>(0);
  const [cumulativeCheckoutSuccess, setCumulativeCheckoutSuccess] = useState<number>(0);
  const [botCumulativeDoubleAttempts, setBotCumulativeDoubleAttempts] = useState<number>(0);
  const [botCumulativeCheckoutSuccess, setBotCumulativeCheckoutSuccess] = useState<number>(0);
  
  // Highest finish tracking
  const [userHighestFinish, setUserHighestFinish] = useState<number>(0);
  const [botHighestFinish, setBotHighestFinish] = useState<number>(0);

  // Double In stats
  const [hasHitDoubleIn, setHasHitDoubleIn] = useState<boolean>(false);
  const [doubleInAttempts, setDoubleInAttempts] = useState<number>(0);
  const [doubleInSuccess, setDoubleInSuccess] = useState<number>(0);
  const [cumulativeDoubleInAttempts, setCumulativeDoubleInAttempts] = useState<number>(0);
  const [cumulativeDoubleInSuccess, setCumulativeDoubleInSuccess] = useState<number>(0);

  // History for undo
  type GameState = {
    userScore: number;
    botScore: number;
    currentPlayer: Player;
    status: string;
    winner: Player | null;
    userThrows: number[];
    userBestLeg: number;
    userWorstLeg: number;
    userCheckoutDarts: number | null;
    userCheckoutDoubles: number | null;
    doubleAttempts: number;
    userLegsWon: number;
    botLegsWon: number;
    userSetsWon: number;
    botSetsWon: number;
    cumulativeDoubleAttempts: number;
    cumulativeCheckoutSuccess: number;
    cumulativeDoubleInAttempts: number;
    cumulativeDoubleInSuccess: number;
    currentLegStartIndex: number;
    hasHitDoubleIn: boolean;
    doubleInAttempts: number;
    doubleInSuccess: number;
    botThrows: number[];
    botBestLeg: number;
    botWorstLeg: number;
    botCheckoutDarts: number | null;
    botCheckoutDoubles: number | null;
    botDoubleAttempts: number;
    botCurrentLegStartIndex: number;
    botCumulativeDoubleAttempts: number;
    botCumulativeCheckoutSuccess: number;
    userHighestFinish: number;
    botHighestFinish: number;
  };
  const [history, setHistory] = useState<GameState[]>([]);

  // State to store checkout score for modal options
  const [checkoutScore, setCheckoutScore] = useState<number>(0);
  // State to store pending throw while double prompt is open
  const [pendingThrow, setPendingThrow] = useState<number | null>(null);
  // State to track score before double prompt for conditional options
  const [scoreBeforeDoublePrompt, setScoreBeforeDoublePrompt] = useState<number>(0);
  // Modals
  const [showDoublePrompt, setShowDoublePrompt] = useState(false);
  const [showCheckoutPrompt, setShowCheckoutPrompt] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showDoubleInPrompt, setShowDoubleInPrompt] = useState(false);
  const [statsPage, setStatsPage] = useState<'overview' | 'scores'>('overview');
  const [checkoutDartsInput, setCheckoutDartsInput] = useState<string>('');
  const [checkoutDoublesInput, setCheckoutDoublesInput] = useState<string>('');
  const [doubleInDartsInput, setDoubleInDartsInput] = useState<string>('');

  // Per-dart scoring mode
  type ScoringMode = 'keypad' | 'perDart';
  const [scoringMode, setScoringMode] = useState<ScoringMode>('keypad');
  type Dart = { value: number; multiplier: 1 | 2 | 3; label: string };
  const [currentDarts, setCurrentDarts] = useState<Dart[]>([]);
  type Multiplier = 1 | 2 | 3;
  const [selectedMultiplier, setSelectedMultiplier] = useState<Multiplier>(1);
  const [userCheckoutDisplay, setUserCheckoutDisplay] = useState<string>('');
  const [botCheckoutDisplay, setBotCheckoutDisplay] = useState<string>('');
  const checkoutDisplayCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let isActive = true;

    const averageRange = getAverageRangeForLevel(level);

    const getDisplayForScore = async (score: number): Promise<string> => {
      if (score < 2 || score > 170 || IMPOSSIBLE_CHECKOUT_SCORES.has(score)) {
        return '';
      }

      const cacheKey = `${averageRange}:${score}`;
      const cached = checkoutDisplayCacheRef.current.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      const recommendation = await dartbotAPI.getCheckoutRecommendation(score, averageRange);
      const firstSequence = recommendation?.all_candidates?.[0] ?? recommendation?.best?.sequence ?? null;
      const formatted = formatCheckoutSequenceForDisplay(firstSequence);
      checkoutDisplayCacheRef.current.set(cacheKey, formatted);
      return formatted;
    };

    Promise.all([getDisplayForScore(userScore), getDisplayForScore(botScore)]).then(([userDisplay, botDisplay]) => {
      if (!isActive) return;
      setUserCheckoutDisplay(userDisplay);
      setBotCheckoutDisplay(botDisplay);
    });

    return () => {
      isActive = false;
    };
  }, [userScore, botScore, level]);

  const handleNumberPress = (num: string) => {
    if (winner || currentPlayer === 'dartbot') return;
    // Limit to 3 digits (max score is 180)
    if (inputScore.length < 3) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setInputScore(inputScore === '0' ? num : inputScore + num);
    }
  };

  const handleClear = () => {
    if (winner || currentPlayer === 'dartbot') return;
    setInputScore('0');
  };

  const handleBackspace = () => {
    if (winner || currentPlayer === 'dartbot') return;
    const next = inputScore.slice(0, -1);
    setInputScore(next.length === 0 ? '0' : next);
  };

  const handleDartSelect = (value: number, multiplier?: 1 | 2 | 3, label?: string) => {
    if (winner || currentPlayer === 'dartbot' || currentDarts.length >= 3) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const finalMultiplier = multiplier ?? selectedMultiplier;
    const prefix = finalMultiplier === 1 ? 'S' : finalMultiplier === 2 ? 'D' : 'T';
    const finalLabel = label || `${prefix}${value}`;
    setCurrentDarts([...currentDarts, { value, multiplier: finalMultiplier, label: finalLabel }]);
  };

  const handleDartRemove = () => {
    if (winner || currentPlayer === 'dartbot' || currentDarts.length === 0) return;
    setCurrentDarts(currentDarts.slice(0, -1));
  };

  const handlePerDartConfirm = () => {
    if (currentDarts.length === 0) return;
    const totalScore = currentDarts.reduce((sum, dart) => sum + (dart.value * dart.multiplier), 0);
    setCurrentDarts([]);
    handleSubmit(totalScore);
  };

  const handleSubmit = (scoreOverride?: number) => {
    if (winner || currentPlayer === 'dartbot') return;
    const score = scoreOverride !== undefined ? scoreOverride : parseInt(inputScore, 10);
    if (!isValidThrow(score)) {
      setStatus(`Invalid score: ${score}`);
      return;
    }
    
    // For double in, show prompt on the first valid non-zero score (user needs to score something meaningful)
    if (inRule === 'double' && !hasHitDoubleIn && currentPlayer === 'user' && score > 0) {
      setDoubleInDartsInput('');
      setShowDoubleInPrompt(true);
      // Store the score to apply after confirming double in
      setPendingThrow(score);
      return;
    }
    
    applyThrow('user', score);
    setInputScore('0');
  };

  const isValidThrow = (val: number) => val >= 0 && val <= 180 && ![179, 178, 176, 175, 173, 172, 169, 166, 163].includes(val);

  // Handle leg completion and reset for next leg
  const handleLegWin = (legWinner: Player) => {
    const newUserLegsWon = legWinner === 'user' ? userLegsWon + 1 : userLegsWon;
    const newBotLegsWon = legWinner === 'dartbot' ? botLegsWon + 1 : botLegsWon;

    // If playing Legs format (not Sets), check if match is won
    if (legOrSet === 'Legs') {
      if (newUserLegsWon >= requiredToWin || newBotLegsWon >= requiredToWin) {
        setUserLegsWon(newUserLegsWon);
        setBotLegsWon(newBotLegsWon);
        setMatchWinner(newUserLegsWon >= requiredToWin ? 'user' : 'dartbot');
        setShowQuitConfirm(true);
        return;
      }
      // Leg won but match continues - reset for next leg
      setUserLegsWon(newUserLegsWon);
      setBotLegsWon(newBotLegsWon);
      setCurrentLegNumber((prev) => prev + 1);
      setUserScore(startingScore);
      setBotScore(startingScore);
      setWinner(null);
      setInputScore('0');
      setHasHitDoubleIn(false); // Reset double in for new leg
      // Reset checkout stats for new leg
      setUserCheckoutDarts(null);
      setUserCheckoutDoubles(null);
      setBotCheckoutDarts(null);
      setBotCheckoutDoubles(null);
      // Alternate first player for next leg
      const nextFirstPlayer = initialFirstPlayer === 'user' ? (currentLegNumber % 2 === 0 ? 'user' : 'dartbot') : (currentLegNumber % 2 === 0 ? 'dartbot' : 'user');
      setCurrentPlayer(nextFirstPlayer);
      setStatus(`Leg ${newUserLegsWon + newBotLegsWon + 1} starting. ${nextFirstPlayer === 'user' ? 'You' : 'Dartbot'} throws first.`);
      // Use functional updates to get current array lengths (not stale closure values)
      setUserThrows((current) => {
        setCurrentLegStartIndex(current.length);
        return current;
      });
      setBotThrows((current) => {
        setBotCurrentLegStartIndex(current.length);
        return current;
      });
      return;
    }

    // If playing Sets format, check if set is won (first to 3 legs wins a set)
    if (newUserLegsWon >= legsToWinSet || newBotLegsWon >= legsToWinSet) {
      // Set is won
      const newUserSetsWon = newUserLegsWon >= legsToWinSet ? userSetsWon + 1 : userSetsWon;
      const newBotSetsWon = newBotLegsWon >= legsToWinSet ? botSetsWon + 1 : botSetsWon;

      // Check if match is over (based on required sets to win)
      if (newUserSetsWon >= requiredToWin || newBotSetsWon >= requiredToWin) {
        setUserLegsWon(newUserLegsWon);
        setBotLegsWon(newBotLegsWon);
        setUserSetsWon(newUserSetsWon);
        setBotSetsWon(newBotSetsWon);
        setMatchWinner(newUserSetsWon >= requiredToWin ? 'user' : 'dartbot');
        setShowQuitConfirm(true);
        return;
      }

      // Set won but match continues - reset legs to 0-0 for next set
      setUserLegsWon(0);
      setBotLegsWon(0);
      setUserSetsWon(newUserSetsWon);
      setBotSetsWon(newBotSetsWon);
      setCurrentLegNumber(1); // Reset leg counter for new set
      setUserScore(startingScore);
      setBotScore(startingScore);
      setWinner(null);
      setInputScore('0');
      setHasHitDoubleIn(false); // Reset double in for new set
      // Reset checkout stats for new leg
      setUserCheckoutDarts(null);
      setUserCheckoutDoubles(null);
      setBotCheckoutDarts(null);
      setBotCheckoutDoubles(null);
      // Alternate first player for next set
      const nextFirstPlayer = initialFirstPlayer === 'user' ? (newUserSetsWon % 2 === 0 ? 'user' : 'dartbot') : (newUserSetsWon % 2 === 0 ? 'dartbot' : 'user');
      setCurrentPlayer(nextFirstPlayer);
      setStatus(`Set ${newUserSetsWon + newBotSetsWon} won! Starting Leg 1 of Set ${newUserSetsWon + newBotSetsWon + 1}. ${nextFirstPlayer === 'user' ? 'You' : 'Dartbot'} throws first.`);
      // Use functional updates to get current array lengths (not stale closure values)
      setUserThrows((current) => {
        setCurrentLegStartIndex(current.length);
        return current;
      });
      setBotThrows((current) => {
        setBotCurrentLegStartIndex(current.length);
        return current;
      });
      return;
    }

    // Leg won but set continues - reset for next leg
    setUserLegsWon(newUserLegsWon);
    setBotLegsWon(newBotLegsWon);
    setCurrentLegNumber((prev) => prev + 1);
    setUserScore(startingScore);
    setBotScore(startingScore);
    setWinner(null);
    setInputScore('0');
    setHasHitDoubleIn(false); // Reset double in for new leg
    // Reset checkout stats for new leg
    setUserCheckoutDarts(null);
    setUserCheckoutDoubles(null);
    setBotCheckoutDarts(null);
    setBotCheckoutDoubles(null);
    // Alternate first player for next leg - swap who threw first each leg
    const nextFirstPlayer = initialFirstPlayer === 'user' ? (currentLegNumber % 2 === 0 ? 'user' : 'dartbot') : (currentLegNumber % 2 === 0 ? 'dartbot' : 'user');
    setCurrentPlayer(nextFirstPlayer);
    setStatus(`Leg ${newUserLegsWon + newBotLegsWon + 1} starting. ${nextFirstPlayer === 'user' ? 'You' : 'Dartbot'} throws first.`);
    // Mark where the next leg starts for per-leg calculations
    // Use functional updates to get current array lengths (not stale closure values)
    setUserThrows((current) => {
      setCurrentLegStartIndex(current.length);
      return current;
    });
    setBotThrows((current) => {
      setBotCurrentLegStartIndex(current.length);
      return current;
    });
  };

  const applyThrow = (player: Player, throwScore: number, dartScores?: number[]) => {
    const needsDouble = outRule === 'double';
    const scoreBefore = player === 'user' ? userScore : botScore;
    // Complete list of mathematically impossible checkouts (cannot finish on double from these scores)
    const noCheckout = [1, 159, 162, 163, 165, 166, 168, 169];

    // Save state for undo
    setHistory((prev) => [
      ...prev,
      {
        userScore,
        botScore,
        currentPlayer,
        status,
        winner,
        userThrows: [...userThrows],
        userBestLeg,
        userWorstLeg,
        userCheckoutDarts,
        userCheckoutDoubles,
        doubleAttempts,
        userLegsWon,
        botLegsWon,
        userSetsWon,
        botSetsWon,
        cumulativeDoubleAttempts,
        cumulativeCheckoutSuccess,
        cumulativeDoubleInAttempts,
        cumulativeDoubleInSuccess,
        currentLegStartIndex,
        hasHitDoubleIn,
        doubleInAttempts,
        doubleInSuccess,
        botThrows: [...botThrows],
        botBestLeg,
        botWorstLeg,
        botCheckoutDarts,
        botCheckoutDoubles,
        botDoubleAttempts,
        botCurrentLegStartIndex,
        botCumulativeDoubleAttempts,
        botCumulativeCheckoutSuccess,
        userHighestFinish,
        botHighestFinish,
      },
    ]);

    const logUserTurn = (score: number) => {
      if (player === 'user') {
        setUserThrows((prev) => [...prev, score]);
        // Track double in attempts when 0 is entered (3 missed darts at double)
        if (inRule === 'double' && !hasHitDoubleIn && score === 0) {
          setCumulativeDoubleInAttempts((prev) => prev + 3);
        }
      }
    };

    if (!isValidThrow(throwScore)) {
      setStatus('Invalid score (0-180).');
      return;
    }

    const isCheckoutEligible = (score: number) => score >= 2 && score <= 170 && !noCheckout.includes(score);

    // In double-out, a scored 0 can still represent darts thrown at a checkout attempt.
    // Prompt for darts-at-double for any valid checkout score (2-170, excluding impossible).
    if (player === 'user' && needsDouble && throwScore === 0 && isCheckoutEligible(scoreBefore)) {
      logUserTurn(0);
      setPendingThrow(0);
      setScoreBeforeDoublePrompt(scoreBefore);
      setShowDoublePrompt(true);
      return;
    }

    // Bust if overshoot
    if (throwScore > scoreBefore) {
      logUserTurn(0);
      setStatus('Bust.');
      if (player === 'user' && scoreBefore > 0 && scoreBefore <= 50 && isCheckoutEligible(scoreBefore)) {
        setScoreBeforeDoublePrompt(scoreBefore);
        setShowDoublePrompt(true);
      } else {
        setCurrentPlayer(player === 'user' ? 'dartbot' : 'user');
      }
      return;
    }

    // Bust scenarios specific to double-out rules
    if (needsDouble) {
      const remainingAfter = scoreBefore - throwScore;
      // With 2 remaining you must hit double 1 exactly; any other score busts
      if (scoreBefore === 2 && throwScore !== 2 && throwScore !== 0) {
        logUserTurn(0);
        setStatus('Bust.');
        if (player === 'user' && scoreBefore > 0 && scoreBefore <= 50 && isCheckoutEligible(scoreBefore)) {
          setScoreBeforeDoublePrompt(scoreBefore);
          setShowDoublePrompt(true);
        } else {
          setCurrentPlayer(player === 'user' ? 'dartbot' : 'user');
        }
        return;
      }
      // Cannot leave a score of 1 when finishing on a double
      if (remainingAfter === 1) {
        logUserTurn(0);
        setStatus('Bust.');
        if (player === 'user' && scoreBefore > 0 && scoreBefore <= 50 && isCheckoutEligible(scoreBefore)) {
          setScoreBeforeDoublePrompt(scoreBefore);
          setShowDoublePrompt(true);
        } else {
          setCurrentPlayer(player === 'user' ? 'dartbot' : 'user');
        }
        return;
      }
    }

    // Track throw
    logUserTurn(throwScore);

    // Finishing logic
    if (throwScore === scoreBefore) {
      if (noCheckout.includes(scoreBefore)) {
        setStatus(`No checkout from ${scoreBefore}. Turn passes.`);
        setCurrentPlayer(player === 'user' ? 'dartbot' : 'user');
        return;
      }
      
      if (player === 'user') {
        // For straight out, skip prompts and auto-finish
        if (outRule !== 'double') {
          setUserScore(0);
          // Calculate how many darts were thrown (based on previous throws count)
          const dartsThrown = currentDarts.length > 0 ? currentDarts.length : (scoringMode === 'keypad' ? 3 : 1);
          setUserCheckoutDarts(dartsThrown);
          setUserCheckoutDoubles(0); // Not applicable for straight out
          setCumulativeCheckoutSuccess((prev) => prev + 1);
          // Track highest finish
          if (scoreBefore > userHighestFinish) {
            setUserHighestFinish(scoreBefore);
          }
          // Calculate best leg based on current throws + checkout darts
          setUserThrows((currentThrows) => {
            const currentLegThrowCount = currentThrows.length - currentLegStartIndex;
            const totalDartsThisLeg = Math.max(0, currentLegThrowCount - 1) * 3 + dartsThrown;
            setUserBestLeg((prevBestLeg) => 
              prevBestLeg === 0 || totalDartsThisLeg < prevBestLeg ? totalDartsThisLeg : prevBestLeg
            );
            setUserWorstLeg((prevWorstLeg) => 
              totalDartsThisLeg > prevWorstLeg ? totalDartsThisLeg : prevWorstLeg
            );
            return currentThrows;
          });
          setWinner('user');
          setStatus('You win this leg!');
          // Handle leg win after a short delay to show the win message
          setTimeout(() => handleLegWin('user'), 1000);
        } else {
          // Double out mode - check for auto-finish cases or show prompt
          // Auto-finish for checkouts 99 and 101+ except specific scores that should prompt
          const promptCheckouts = [101, 104, 107, 110];
          if (scoreBefore === 99 || (scoreBefore >= 101 && !promptCheckouts.includes(scoreBefore))) {
            setUserScore(0);
            setUserCheckoutDarts(3);
            setUserCheckoutDoubles(1);
            setDoubleAttempts((prev) => prev + 1);
            setCumulativeDoubleAttempts((prev) => prev + 1);
            setCumulativeCheckoutSuccess((prev) => prev + 1);
            // Track highest finish
            if (scoreBefore > userHighestFinish) {
              setUserHighestFinish(scoreBefore);
            }
            // Calculate best leg based on current throws + checkout darts
            setUserThrows((currentThrows) => {
              const currentLegThrowCount = currentThrows.length - currentLegStartIndex;
              const totalDartsThisLeg = Math.max(0, currentLegThrowCount - 1) * 3 + 3;
              setUserBestLeg((prevBestLeg) => 
                prevBestLeg === 0 || totalDartsThisLeg < prevBestLeg ? totalDartsThisLeg : prevBestLeg
              );
              setUserWorstLeg((prevWorstLeg) => 
                totalDartsThisLeg > prevWorstLeg ? totalDartsThisLeg : prevWorstLeg
              );
              return currentThrows;
            });
            setWinner('user');
            setStatus('You win this leg!');
            // Handle leg win after a short delay to show the win message
            setTimeout(() => handleLegWin('user'), 1000);
          } else {
            // Check out achieved - show checkout prompt (don't set score yet)
            setCheckoutScore(scoreBefore);
            setShowCheckoutPrompt(true);
          }
        }
      } else {
        // Bot finished
        const botCheckoutDartsUsed = dartScores && dartScores.length > 0 ? dartScores.length : 3;
        setBotScore(0);
        // Add the finishing throw to bot throws using functional setState to get current state
        setBotThrows((prev) => {
          const newBotThrows = [...prev, throwScore];
          
          // Calculate best leg based on the current leg throws only
          const currentLegThrowCount = newBotThrows.length - botCurrentLegStartIndex;
          const totalDartsThisLeg = Math.max(0, currentLegThrowCount - 1) * 3 + botCheckoutDartsUsed;
          if (botBestLeg === 0 || totalDartsThisLeg < botBestLeg) {
            setBotBestLeg(totalDartsThisLeg);
          }
          if (totalDartsThisLeg > botWorstLeg) {
            setBotWorstLeg(totalDartsThisLeg);
          }
          
          return newBotThrows;
        });
        
        setBotCheckoutDarts(botCheckoutDartsUsed);
        setBotCheckoutDoubles(1);
        // Note: Attempts are tracked in generateBotThrow when aiming at doubles
        setBotCumulativeCheckoutSuccess((prev) => prev + 1);
        // Track highest finish
        if (throwScore > botHighestFinish) {
          setBotHighestFinish(throwScore);
        }
        setWinner(player);
        setStatus(`Dartbot wins this leg!`);
        // Handle leg win after a short delay to show the win message
        setTimeout(() => handleLegWin('dartbot'), 1000);
      }
    } else {
      // Normal subtraction
      const newScore = scoreBefore - throwScore;
      if (player === 'user') {
        // For straight out, no need for double prompt - just update score
        if (outRule !== 'double') {
          setUserScore(newScore);
          setStatus(`You scored ${throwScore}. Next throw: Dartbot.`);
          setCurrentPlayer('dartbot');
        } else {
          // Double out: prompt whenever at 50 or below (and above 0) - defer score update until confirmed
          if (newScore > 0 && newScore <= 50 && isCheckoutEligible(scoreBefore)) {
            setPendingThrow(throwScore);
            setScoreBeforeDoublePrompt(scoreBefore);
            setShowDoublePrompt(true);
            return; // Don't transition to dartbot yet
          } else {
            setUserScore(newScore);
            setStatus(`You scored ${throwScore}. Next throw: Dartbot.`);
            setCurrentPlayer('dartbot');
          }
        }
      } else {
        setBotScore(newScore);
        setBotThrows((prev) => [...prev, throwScore]);
        const dartBreakdownMsg = dartScores && dartScores.length > 0 
          ? ` (${dartScores.map((s, i) => `D${i+1}:${s}`).join(', ')})` 
          : '';
        setStatus(`Dartbot scored ${throwScore}${dartBreakdownMsg}. Next throw: You.`);
        setCurrentPlayer('user');
      }
    }
  };

  const handleUndo = () => {
    setShowDoublePrompt(false);
    setShowCheckoutPrompt(false);
    setCheckoutDartsInput('');
    setCheckoutDoublesInput('');
    setInputScore('0');
    setPendingThrow(null);

    setHistory((prev) => {
      if (prev.length === 0) return prev;
      
      // Default: undo the most recent state (1)
      // Special case: if it's user's turn BECAUSE bot just threw, undo both (2)
      let statesToUndo = 1;
      const lastSnapshot = prev[prev.length - 1];
      if (currentPlayer === 'user' && lastSnapshot && lastSnapshot.currentPlayer === 'dartbot' && prev.length >= 2) {
        statesToUndo = 2; // Undo bot's and user's last turns
      }
      
      const targetState = prev[prev.length - statesToUndo];
      setUserScore(targetState.userScore);
      setBotScore(targetState.botScore);
      setCurrentPlayer(targetState.currentPlayer);
      setStatus(targetState.status);
      setWinner(targetState.winner);
      setUserThrows(targetState.userThrows);
      setUserBestLeg(targetState.userBestLeg);
      setUserWorstLeg(targetState.userWorstLeg);
      setUserCheckoutDarts(targetState.userCheckoutDarts);
      setUserCheckoutDoubles(targetState.userCheckoutDoubles);
      setDoubleAttempts(targetState.doubleAttempts);
      setUserLegsWon(targetState.userLegsWon);
      setBotLegsWon(targetState.botLegsWon);
      setUserSetsWon(targetState.userSetsWon);
      setBotSetsWon(targetState.botSetsWon);
      setCumulativeDoubleAttempts(targetState.cumulativeDoubleAttempts);
      setCumulativeCheckoutSuccess(targetState.cumulativeCheckoutSuccess);
      setCumulativeDoubleInAttempts(targetState.cumulativeDoubleInAttempts);
      setCumulativeDoubleInSuccess(targetState.cumulativeDoubleInSuccess);
      setCurrentLegStartIndex(targetState.currentLegStartIndex);
      setHasHitDoubleIn(targetState.hasHitDoubleIn);
      setDoubleInAttempts(targetState.doubleInAttempts);
      setDoubleInSuccess(targetState.doubleInSuccess);
      setBotThrows(targetState.botThrows);
      setBotBestLeg(targetState.botBestLeg);
      setBotWorstLeg(targetState.botWorstLeg);
      setBotCheckoutDarts(targetState.botCheckoutDarts);
      setBotCheckoutDoubles(targetState.botCheckoutDoubles);
      setBotDoubleAttempts(targetState.botDoubleAttempts);
      setBotCurrentLegStartIndex(targetState.botCurrentLegStartIndex);
      setBotCumulativeDoubleAttempts(targetState.botCumulativeDoubleAttempts);
      setBotCumulativeCheckoutSuccess(targetState.botCumulativeCheckoutSuccess);
      setUserHighestFinish(targetState.userHighestFinish);
      setBotHighestFinish(targetState.botHighestFinish);
      
      return prev.slice(0, -statesToUndo);
    });
  };

  const handleDoublePromptClose = (dartsAtDouble: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const attempts = parseInt(dartsAtDouble, 10);
    if (!Number.isNaN(attempts) && attempts > 0) {
      setDoubleAttempts((prev) => prev + attempts);
      setCumulativeDoubleAttempts((prev) => prev + attempts);
    }
    
    // Apply the deferred throw now (if any)
    if (pendingThrow !== null) {
      const newScore = userScore - pendingThrow;
      setUserScore(newScore);
    }
    
    // Always advance to dartbot after double prompt is confirmed
    setCurrentPlayer('dartbot');
    
    setPendingThrow(null);
    setShowDoublePrompt(false);
  };

  const handleCheckoutSubmit = () => {
    if (checkoutDartsInput && checkoutDoublesInput) {
      const darts = parseInt(checkoutDartsInput, 10);
      const doubles = parseInt(checkoutDoublesInput, 10);
      
      setUserScore(0);
      setUserCheckoutDarts(darts);
      setUserCheckoutDoubles(doubles);
      if (!Number.isNaN(doubles) && doubles > 0) {
        setDoubleAttempts((prev) => prev + doubles);
        setCumulativeDoubleAttempts((prev) => prev + doubles);
        setCumulativeCheckoutSuccess((prev) => prev + 1);
      }
      // Track highest finish
      if (checkoutScore > userHighestFinish) {
        setUserHighestFinish(checkoutScore);
      }
      
      // Calculate stats and set winner
      const currentLegThrowCount = userThrows.length - currentLegStartIndex;
      const totalDartsThisLeg = Math.max(0, currentLegThrowCount - 1) * 3 + (Number.isNaN(darts) ? 0 : darts);
      if (userBestLeg === 0 || totalDartsThisLeg < userBestLeg) {
        setUserBestLeg(totalDartsThisLeg);
      }
      if (totalDartsThisLeg > userWorstLeg) {
        setUserWorstLeg(totalDartsThisLeg);
      }
      
      setWinner('user');
      setStatus('You win this leg!');
      // Handle leg win after a short delay to show the win message
      setTimeout(() => handleLegWin('user'), 1000);
    }
    setCheckoutDartsInput('');
    setCheckoutDoublesInput('');
    setShowCheckoutPrompt(false);
  };

  const handleDoubleInSubmit = () => {
    if (doubleInDartsInput) {
      const darts = parseInt(doubleInDartsInput, 10);
      if (darts > 0) {
        // Track darts thrown to get the double, then +1 for success
        setCumulativeDoubleInAttempts((prev) => prev + darts);
        setCumulativeDoubleInSuccess((prev) => prev + 1);
        setDoubleInAttempts((prev) => prev + darts);
        setDoubleInSuccess((prev) => prev + 1);
      }
      
      setHasHitDoubleIn(true);
      setDoubleInDartsInput('');
      setShowDoubleInPrompt(false);
      
      // Apply the pending throw now that double in is confirmed
      if (pendingThrow !== null) {
        applyThrow('user', pendingThrow);
        setPendingThrow(null);
        setInputScore('0');
      }
    }
  };

  // Determine checkout button options based on score
  const getCheckoutOptions = (score: number) => {
    const isOddUnder40 = score % 2 !== 0 && score < 40;
    const isUnder98 = score < 98 && score > 40;
    const isEvenBetween2And40 = score % 2 === 0 && score >= 2 && score <= 40;
    const specialPromptScores = [100, 101, 104, 107, 110];
    const isSpecialPrompt = specialPromptScores.includes(score);

    return {
      // For even 2-40: allow 1,2,3 darts to checkout
      // For 100,101,104,107,110, odd < 40, and 41-97: allow 2 or 3 darts
      dartsOptions: isEvenBetween2And40
        ? ['1', '2', '3']
        : (isOddUnder40 || isSpecialPrompt || isUnder98)
          ? ['2', '3']
          : ['1', '2'],
      // For even 2-40, odd < 40, and special prompts: allow 1,2,3 darts at double; for 41-98: allow 1,2; for 99,101+: allow 0,1,2,3
      doublesOptions: (isEvenBetween2And40) ? ['1', '2', '3'] : (isUnder98 || isOddUnder40 || isSpecialPrompt) ? ['1', '2'] : ['2', '3'],
    };
  };

  // Calculate statistics
  const userStats = useMemo(() => {
    if (userThrows.length === 0) {
      return {
        threeDartAvg: 0,
        first9Avg: 0,
        checkoutRate: 0,
        lastScore: 0,
        dartsThrown: 0,
        checkoutAttempts: 0,
        checkoutSuccess: 0,
      };
    }

    // Calculate stats across ENTIRE MATCH, not just current leg
    const allThrows = userThrows;
    const turns = allThrows.length;
    const dartsInMatch = userCheckoutDarts
      ? Math.max(0, turns - 1) * 3 + userCheckoutDarts
      : turns * 3;

    // 3DA is total score divided by actual darts thrown in entire match
    const matchTotal = allThrows.reduce((a, b) => a + b, 0);
    const threeDartAvg = dartsInMatch > 0 ? ((matchTotal / dartsInMatch) * 3).toFixed(2) : 0;
    
    // 9DA is first 3 turns (9 darts) from the entire match (cumulative, not per-leg)
    const first3 = allThrows.slice(0, 3);
    const first3Total = first3.reduce((a, b) => a + b, 0);
    const first9Avg = first3.length === 3 ? ((first3Total / 9) * 3).toFixed(2) : '0';

    // Use cumulative stats for checkout rate across the entire match
    const checkoutAttempts = cumulativeDoubleAttempts || 0;
    const checkoutSuccess = cumulativeCheckoutSuccess || 0;
    const checkoutRate = checkoutAttempts > 0 ? ((checkoutSuccess / checkoutAttempts) * 100).toFixed(2) : '0';
    
    // Get current leg throws for lastScore and current leg darts
    const currentLegThrows = userThrows.slice(currentLegStartIndex);
    const currentLegTurns = currentLegThrows.length;
    // Calculate darts thrown in current leg only
    const dartsInCurrentLeg = (() => {
      // No throws yet in this leg - always return 0 (ignore stale checkout data)
      if (currentLegTurns === 0) return 0;
      // Leg finished with a checkout (only count checkout darts if score is actually 0)
      if (userScore === 0 && userCheckoutDarts && currentLegTurns > 0) {
        return Math.max(0, currentLegTurns - 1) * 3 + userCheckoutDarts;
      }
      // Leg in progress - only count if we have throws in this leg
      return currentLegTurns > 0 ? currentLegTurns * 3 : 0;
    })();
    
    return {
      threeDartAvg: parseFloat(threeDartAvg as string) || 0,
      first9Avg: parseFloat(first9Avg as string) || 0,
      checkoutRate: parseFloat(checkoutRate as string) || 0,
      checkoutAttempts: checkoutAttempts || 0,
      checkoutSuccess: checkoutSuccess || 0,
      lastScore: currentLegThrows[currentLegThrows.length - 1] || 0,
      dartsThrown: dartsInCurrentLeg,
    };
  }, [userThrows, userCheckoutDarts, userCheckoutDoubles, cumulativeDoubleAttempts, cumulativeCheckoutSuccess, currentLegStartIndex, userScore]);

  const botStats = useMemo(() => {
    if (botThrows.length === 0) {
      return {
        threeDartAvg: 0,
        first9Avg: 0,
        checkoutRate: 0,
        lastScore: 0,
        dartsThrown: 0,
        checkoutAttempts: 0,
        checkoutSuccess: 0,
      };
    }

    // Calculate stats across ENTIRE MATCH, not just current leg
    const allThrows = botThrows;
    const turns = allThrows.length;
    const dartsInMatch = botCheckoutDarts
      ? Math.max(0, turns - 1) * 3 + botCheckoutDarts
      : turns * 3;

    // 3DA is total score divided by actual darts thrown in entire match
    const matchTotal = allThrows.reduce((a, b) => a + b, 0);
    const threeDartAvg = dartsInMatch > 0 ? ((matchTotal / dartsInMatch) * 3).toFixed(2) : 0;
    
    // 9DA is first 3 turns (9 darts) from the entire match (cumulative, not per-leg)
    const first3 = allThrows.slice(0, 3);
    const first3Total = first3.reduce((a, b) => a + b, 0);
    const first9Avg = first3.length === 3 ? ((first3Total / 9) * 3).toFixed(2) : '0';

    // Use cumulative stats for checkout rate across the entire match
    const checkoutAttempts = botCumulativeDoubleAttempts || 0;
    const checkoutSuccess = botCumulativeCheckoutSuccess || 0;
    const checkoutRate = checkoutAttempts > 0 ? ((checkoutSuccess / checkoutAttempts) * 100).toFixed(2) : '0';
    
    // Get current leg throws for lastScore and current leg darts
    const currentLegThrows = botThrows.slice(botCurrentLegStartIndex);
    const currentLegTurns = currentLegThrows.length;
    // Calculate darts thrown in current leg only
    const dartsInCurrentLeg = (() => {
      // No throws yet in this leg - always return 0 (ignore stale checkout data)
      if (currentLegTurns === 0) return 0;
      // Leg finished with a checkout (only count checkout darts if score is actually 0)
      if (botScore === 0 && botCheckoutDarts && currentLegTurns > 0) {
        return Math.max(0, currentLegTurns - 1) * 3 + botCheckoutDarts;
      }
      // Leg in progress - only count if we have throws in this leg
      return currentLegTurns > 0 ? currentLegTurns * 3 : 0;
    })();
    
    return {
      threeDartAvg: parseFloat(threeDartAvg as string) || 0,
      first9Avg: parseFloat(first9Avg as string) || 0,
      checkoutRate: parseFloat(checkoutRate as string) || 0,
      checkoutAttempts: checkoutAttempts || 0,
      checkoutSuccess: checkoutSuccess || 0,
      lastScore: currentLegThrows[currentLegThrows.length - 1] || 0,
      dartsThrown: dartsInCurrentLeg,
    };
  }, [botThrows, botCheckoutDarts, botCheckoutDoubles, botCumulativeDoubleAttempts, botCumulativeCheckoutSuccess, botCurrentLegStartIndex, botScore]);

  const generateBotThrow = async (): Promise<{totalScore: number; dartScores: number[]}> => {
    // Use new probability-based engine
    const remainingScore = botScore;
    console.log(`\n========================================`);
    console.log(`[BOT TURN] Level: ${level}, Remaining: ${remainingScore}`);
    console.log(`========================================`);
    let turnResult = simulateBotTurn(level, remainingScore, outRule as 'straight' | 'double');
    
    let isAttemptingCheckout = false;

    // Get expected average range for this level to keep bot realistic
    const expectedAverageRange = getAverageRangeForLevel(level);
    let minAvg = 66; // default
    let maxAvg = 70; // default
    
    // Parse the range (handle "110+" case)
    if (expectedAverageRange.includes('-')) {
      const [min, max] = expectedAverageRange.split('-').map(x => parseInt(x, 10));
      minAvg = min;
      maxAvg = max || min; // If only one number, use it as both
    } else if (expectedAverageRange === '110+') {
      minAvg = 110;
      maxAvg = 120; // Cap at max possible 180
    }
    const targetAvg = (minAvg + maxAvg) / 2; // Middle of range is target

    // Calculate current bot 3-dart average
    const currentLegThrows = botThrows.slice(botCurrentLegStartIndex);
    const turns = currentLegThrows.length;
    const dartsInCurrentLeg = botCheckoutDarts
      ? Math.max(0, turns - 1) * 3 + botCheckoutDarts
      : turns * 3;
    const currentLegTotal = currentLegThrows.reduce((a, b) => a + b, 0);
    // Dynamically choose targets per dart based on live score (checkout vs approach)
    if (remainingScore <= 170) {
      console.log(`[BOT] Entering checkout range (score <= 170)`);
      isAttemptingCheckout = true;
    } else {
      console.log(`[BOT] Entering approach range (score > 170)`);
      isAttemptingCheckout = false;
    }

    let usedRoutingSimulation = true;

    try {
      const averageRange = getAverageRangeForLevel(level);
      const darts: typeof turnResult.darts = [];
      let turnScore = 0;
      let finished = false;
      let doublesAttempted = 0;
        console.log(`[BOT] Starting turn at ${remainingScore}`);

        let resultAlreadySet = false;
        for (let i = 0; i < 3; i++) {
          const scoreLeft = remainingScore - turnScore;
          let targetToken: string;
          let isFromSequence = false; // Track if target came from a checkout sequence
          let shouldApplyVariance = true;

          // Check if we can finish with one dart
          const canFinishWithOneDart = () => {
            if (outRule === 'double') {
              // Double out rule: can finish on doubles (2-40 even) or bullseye (50)
              if (scoreLeft === 50) return 'ibull'; // Bullseye
              if (scoreLeft >= 2 && scoreLeft <= 40 && scoreLeft % 2 === 0) {
                return `d${scoreLeft / 2}`; // Double
              }
            } else {
              // Straight out: can finish on any score
              if (scoreLeft === 50) return 'ibull';
              if (scoreLeft === 25) return 'obull';
              if (scoreLeft >= 1 && scoreLeft <= 20) return `s${scoreLeft}`;
              if (scoreLeft >= 21 && scoreLeft <= 40) return `d${Math.floor(scoreLeft / 2)}`;
              if (scoreLeft >= 42 && scoreLeft <= 60 && scoreLeft % 3 === 0) return `t${scoreLeft / 3}`;
            }
            return null;
          };

          console.log(`[BOT] Score check: scoreLeft=${scoreLeft}, checking routing...`);
          
          const oneDartFinish = canFinishWithOneDart();
          if (oneDartFinish) {
            // Can finish with one dart - aim directly for it!
            targetToken = oneDartFinish;
            isFromSequence = true; // One-dart finishes are calculated, not random fallback
            console.log(`[BOT] Can finish ${scoreLeft} with one dart! Aiming at ${targetToken}`);
          } else if (scoreLeft <= 170) {
            console.log(`[BOT] Route: scoreLeft <= 170, calling checkout API...`);
            // Call API for checkout if remaining score is 170 or below (in checkout_candidates.json)
            const remainingDartsInTurn = 3 - i; // If i=0, we have 3 darts; if i=1, we have 2 darts; if i=2, we have 1 dart
            try {
              const recommendation = await dartbotAPI.getCheckoutRecommendation(scoreLeft, averageRange);
              if (!recommendation) {
                console.warn(`[BOT] No recommendation returned for ${scoreLeft}, will use T20`);
                targetToken = 't20';
                isFromSequence = false;
              } else {
                // Get the best sequence that fits the remaining darts
                const bestSequence = getBestValidCheckoutSequence(recommendation, remainingDartsInTurn, scoreLeft);
                if (bestSequence) {
                  const parts = bestSequence.split(',');
                  targetToken = parts[0] ?? 't20';
                  isFromSequence = true;
                  console.log(`[BOT] Optimal sequence for ${scoreLeft} with ${remainingDartsInTurn} darts: ${bestSequence}, using first dart: ${targetToken}`);
                } else {
                  // No valid sequence with remaining darts.
                  // With one dart left, request an approach/setup suggestion (handles bogey scores).
                  if (remainingDartsInTurn === 1) {
                    // Preserve previous behavior: if checkout API has a route (even 2+ darts),
                    // follow its first dart as setup when only one dart remains this turn.
                    const allCandidates = recommendation.all_candidates || [];
                    const bestSeq = allCandidates[0] ?? recommendation.best?.sequence;
                    if (bestSeq) {
                      const parts = bestSeq.split(',');
                      targetToken = parts[0] ?? 't20';
                      isFromSequence = true;
                      console.log(`[BOT] No 1-dart checkout for ${scoreLeft}; using first dart from best checkout route: ${targetToken} (from ${bestSeq})`);
                    } else {
                      const setupSuggestion = await dartbotAPI.getApproachSuggestion(scoreLeft, outRule, 1);
                      const apiTarget = setupSuggestion?.target;
                      const apiIsActionable = Boolean(apiTarget) && setupSuggestion?.approach_play !== false;

                      if (setupSuggestion && apiIsActionable) {
                        targetToken = apiTarget as string;
                        isFromSequence = true;
                        console.log(`[BOT] No 1-dart checkout for ${scoreLeft}; using setup target ${targetToken} (${setupSuggestion.reason ?? 'API setup'})`);
                      } else {
                        targetToken = 't20';
                        isFromSequence = false;
                        console.warn(`[BOT] No setup suggestion for ${scoreLeft}, fallback T20`);
                      }
                    }
                  } else {
                    // For 2+ darts remaining, keep prior fallback behavior.
                    const allCandidates = recommendation.all_candidates || [];
                    const bestSeq = allCandidates[0] ?? recommendation.best?.sequence;
                    if (bestSeq) {
                      const parts = bestSeq.split(',');
                      targetToken = parts[0] ?? 't20';
                      isFromSequence = true;
                      console.warn(`[BOT] No sequence fits ${remainingDartsInTurn} darts for ${scoreLeft}, using best sequence's first target: ${targetToken} (from ${bestSeq})`);
                    } else {
                      console.warn(`[BOT] No checkout recommendation found for ${scoreLeft}, using fallback T20`);
                      targetToken = 't20';
                      isFromSequence = false;
                    }
                  }
                }
              }
            } catch (err) {
              console.warn(`[BOT] Failed to get checkout for ${scoreLeft}:`, err);
              targetToken = 't20';
              isFromSequence = false;
            }
          } else {
            // Score > 170: Use approach play to find best starting segment
            // Approach play identifies segments that leave better finishing positions
            console.log(`[BOT] Route: scoreLeft > 170 (${scoreLeft}), calling approach play API...`);
            try {
              const remainingDartsInTurn = 3 - i; // i=0 => 3 darts, i=1 => 2 darts, i=2 => 1 dart
              const approachSuggestion = await dartbotAPI.getApproachSuggestion(scoreLeft, outRule, remainingDartsInTurn);
              console.log(`[BOT] API response:`, approachSuggestion);
              if (approachSuggestion && approachSuggestion.segment) {
                targetToken = approachSuggestion.target ?? `t${approachSuggestion.segment}`;
                isFromSequence = false;
                // Do not mutate intended approach targets (e.g. T20 -> T1/T5).
                // Miss behavior is already handled in simulateDartAtTarget.
                shouldApplyVariance = false;
                console.log(`[BOT] Approach play for ${scoreLeft} (${remainingDartsInTurn} darts): ${targetToken.toUpperCase()} - ${approachSuggestion.reason}`);
                console.log(
                  `[BOT] Approach alternatives:`,
                  approachSuggestion.alternatives
                    ?.map((a: any) => `${(a.target ?? `t${a.segment}`).toUpperCase()}(${a.quality})`)
                    .join(', ') || 'none'
                );
              } else {
                // Fallback to T20 if approach suggestion fails
                console.warn(`[BOT] No approach suggestion for ${scoreLeft}, using fallback T20`);
                targetToken = 't20';
                isFromSequence = false;
                shouldApplyVariance = false;
              }
            } catch (err) {
              console.warn(`[BOT] Failed to get approach suggestion for ${scoreLeft}:`, err);
              targetToken = 't20';
              isFromSequence = false;
              shouldApplyVariance = false;
            }
          }

          const intended = parseCheckoutTarget(targetToken);
          // IMPORTANT: Do NOT apply variance to checkout sequence targets - use them exactly as specified
          // Also skip variance when API explicitly indicates power scoring mode.
          const intendedWithVariance = (isFromSequence || !shouldApplyVariance) ? intended : (
            !(outRule === 'double' && scoreLeft <= 60)
                ? applyIntendedHitVariance(intended, level)
              : intended
          );

          const isCheckoutSetup = intendedWithVariance[0] === 'S' && scoreLeft <= 60;

          console.log(`[BOT] Dart ${i + 1}: Score left=${scoreLeft}, Aiming at=${intendedWithVariance}`);

          // Track if aiming at double
          // Only track double attempts when finishing (score = 50 or score is 2-40 even)
          const canFinishOnDouble = scoreLeft === 50 || (scoreLeft >= 2 && scoreLeft <= 40 && scoreLeft % 2 === 0);
          const isAimingAtDouble = intendedWithVariance[0] === 'D';
          const lowLevelDoublePenaltyByLevel: Record<number, number> = {
            1: 0.50,
            2: 0.55,
            3: 0.60,
            4: 0.65,
            5: 0.70,
            6: 0.75,
            7: 0.80,
            8: 0.84,
            9: 0.87,
            10: 0.90,
            11: 0.92,
            12: 0.94,
            13: 0.96,
            14: 0.97,
            15: 0.98,
            16: 0.99,
          };
          const activeDoublePenalty = lowLevelDoublePenaltyByLevel[level] ?? 1.0;
          if (isAimingAtDouble && canFinishOnDouble) {
            doublesAttempted++;
          }

          // Pass previous dart for "following the marker" bonus
          const previousDart = i > 0 ? darts[i - 1] : null;
          const dart = simulateDartAtTarget(level, intendedWithVariance, undefined, isCheckoutSetup, previousDart);
          darts.push(dart);

          if (isAimingAtDouble) {
            console.log(
              `[BOT][DOUBLE %] Aim=${intendedWithVariance} HitChance=${(dart.hitProbability * 100).toFixed(1)}% | Level=${level} | DoublePenalty=${activeDoublePenalty.toFixed(2)}`
            );
          }
          
          // Log marker bonus if applied
          if (dart.markerBonus && dart.markerBonus > 0) {
            console.log(`[BOT] Marker bonus: +${(dart.markerBonus * 100).toFixed(1)}% hit chance (following previous dart)`);
          }
          
          console.log(
            `[BOT] Dart ${i + 1}: Score left=${scoreLeft}, Aiming at=${intendedWithVariance} (${(dart.hitProbability * 100).toFixed(1)}% hit chance), Hit=${dart.actual}, Score=${dart.score}, Success=${dart.actualHit ? '✓' : '✗'}`
          );
          
          const newTurnScore = turnScore + dart.score;
          console.log(`[BOT] Turn total so far: ${turnScore} + ${dart.score} = ${newTurnScore}, Remaining would be: ${remainingScore - newTurnScore}`);
          
          if (newTurnScore > remainingScore) {
            console.log(`[BOT] BUST! Scored ${newTurnScore} > ${remainingScore}`);
            turnResult = { darts, totalScore: 0, finished: false };
            resultAlreadySet = true;
            break;
          }

          turnScore = newTurnScore;

          if (newTurnScore === remainingScore) {
            if (outRule === 'double') {
              // Check if finished on double or bullseye (inner bull = 50 = D25)
              const isDouble = dart.actual && dart.actual[0] === 'D';
              const isBullseye = dart.score === 50; // Inner bull (50) counts as double
              if (!isDouble && !isBullseye) {
                console.log(`[BOT] Failed to finish on double! Turn score=${newTurnScore}`);
                turnResult = { darts, totalScore: 0, finished: false };
                resultAlreadySet = true;
                break;
              }
            }
            console.log(`[BOT] FINISHED! Total turn score=${turnScore}`);
            finished = true;
            turnResult = { darts, totalScore: turnScore, finished };
            break;
          }

          if (outRule === 'double' && newTurnScore === remainingScore - 1) {
            console.log(`[BOT] Left on 1! Cannot finish. Turn score=${newTurnScore}`);
            turnResult = { darts, totalScore: 0, finished: false };
            resultAlreadySet = true;
            break;
          }
        }
        
      // Track double attempts (every time bot aims at a finishing double)
      if (doublesAttempted > 0) {
        setBotCumulativeDoubleAttempts((prev) => prev + doublesAttempted);
      }
      // Note: Success is tracked in applyThrow when bot actually finishes

      // Set final turn result if not already set by break statements
      if (!resultAlreadySet && !finished && turnScore > 0) {
        // Valid turn that didn't finish and didn't bust
        console.log(`[BOT] Turn completed: ${turnScore} scored, ${remainingScore - turnScore} remaining`);
        turnResult = { darts, totalScore: turnScore, finished: false };
      } else if (!resultAlreadySet && !finished && turnScore === 0) {
        // Turn resulted in 0 (missed all darts in non-checkout)
        console.log(`[BOT] Turn ended with 0 score`);
        turnResult = { darts, totalScore: 0, finished: false };
      }
    } catch (err) {
      // Fallback to local simulation
      usedRoutingSimulation = false;
      console.warn('Routing data unavailable, using local turn simulation');
    }

    // Adjust non-checkout throws via dart-by-dart remapping (instead of raw score scaling)
    // so we keep realistic dart breakdown output.
    const boardOrder = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    const boardIndex = new Map<number, number>(boardOrder.map((seg, idx) => [seg, idx]));

    const getSingleNeighborSegments = (segment: number): number[] => {
      const idx = boardIndex.get(segment);
      if (idx === undefined) return [];
      const left1 = boardOrder[(idx - 1 + 20) % 20];
      const right1 = boardOrder[(idx + 1) % 20];
      const left2 = boardOrder[(idx - 2 + 20) % 20];
      const right2 = boardOrder[(idx + 2) % 20];
      return [left1, right1, left2, right2];
    };

    const getReduceOptions = (score: number): number[] => {
      // Trebles can collapse to singles (e.g. 60 -> 20)
      if (score % 3 === 0 && score >= 3 && score <= 60) {
        const single = score / 3;
        const neighbors = getSingleNeighborSegments(single);
        return [single, ...neighbors.filter((n) => n < single)];
      }

      // Singles remap to neighbors (e.g. 20 -> 1/5/18/12)
      if (score >= 1 && score <= 20) {
        return getSingleNeighborSegments(score).filter((n) => n < score);
      }

      return [];
    };

    const getIncreaseOptions = (score: number): number[] => {
      // Requested behavior: nearby misses can be pulled back toward 20
      if (score === 1 || score === 5 || score === 18 || score === 12 || score === 19) {
        return [20];
      }

      // Generic single uplift toward board center segment 20
      if (score >= 1 && score <= 20 && score !== 20) {
        const neighbors = getSingleNeighborSegments(score);
        const preferred = neighbors.filter((n) => n > score);
        return preferred.length > 0 ? preferred : [20];
      }

      return [];
    };

    let adjustedDartScores = turnResult.darts.map((d) => d.score);
    let finalThrow = adjustedDartScores.reduce((sum, s) => sum + s, 0);

    if (!isAttemptingCheckout && finalThrow > 0) {
      const projectedNewDarts = dartsInCurrentLeg + 3;
      const upperAvg = targetAvg * 1.25;
      const lowerAvg = targetAvg * 0.75;
      const projectedAvgFor = (total: number) => ((currentLegTotal + total) / projectedNewDarts) * 3;
      const maxDartChanges = 2;
      let dartChanges = 0;

      // Reduce by moving dart scores to neighboring/lower outcomes
      let projectedAvg = projectedAvgFor(finalThrow);
      while (projectedAvg > upperAvg && dartChanges < maxDartChanges) {
        let bestIdx = -1;
        let bestNewScore = -1;
        let bestDrop = 0;
        let shouldUseRandomS20Split = false;

        for (let idx = 0; idx < adjustedDartScores.length; idx++) {
          const current = adjustedDartScores[idx];
          const options = getReduceOptions(current);
          for (const next of options) {
            // Keep T20 reductions realistic: allow 60 -> 20 often, but not always.
            if (current === 60 && next === 20 && Math.random() < 0.35) {
              continue;
            }
            const drop = current - next;
            if (drop > bestDrop) {
              bestDrop = drop;
              bestIdx = idx;
              bestNewScore = next;
              shouldUseRandomS20Split = current === 20;
            }
          }
        }

        if (bestIdx < 0 || bestDrop <= 0) break;
        const prev = adjustedDartScores[bestIdx];
        if (shouldUseRandomS20Split && prev === 20) {
          const splitRoll = Math.random();
          bestNewScore = splitRoll < 0.5 ? 1 : 5;
        }
        adjustedDartScores[bestIdx] = bestNewScore;
        finalThrow = adjustedDartScores.reduce((sum, s) => sum + s, 0);
        projectedAvg = projectedAvgFor(finalThrow);
        dartChanges++;
        console.log(`[BOT] Neighbor-adjust reduce: D${bestIdx + 1} ${prev} -> ${bestNewScore}`);
      }

      // Increase by pulling low neighboring singles back toward 20 (occasionally)
      projectedAvg = projectedAvgFor(finalThrow);
      if (projectedAvg < lowerAvg && dartChanges < maxDartChanges && Math.random() < 0.3) {
        for (let idx = 0; idx < adjustedDartScores.length; idx++) {
          const current = adjustedDartScores[idx];
          const options = getIncreaseOptions(current);
          if (options.length > 0) {
            const next = options[0];
            if (next > current) {
              adjustedDartScores[idx] = next;
              finalThrow = adjustedDartScores.reduce((sum, s) => sum + s, 0);
              dartChanges++;
              console.log(`[BOT] Neighbor-adjust increase: D${idx + 1} ${current} -> ${next}`);
              break;
            }
          }
        }
      }
    }

    console.log(`[BOT TURN] Final throw: ${finalThrow}`);
    console.log(`========================================\n`);
    
    return { totalScore: finalThrow, dartScores: adjustedDartScores };
  };

  useEffect(() => {
    if (winner) return;
    if (currentPlayer !== 'dartbot') return;
    setBotThinking(true);
    const timer = setTimeout(async () => {
      const { totalScore: botThrow, dartScores } = await generateBotThrow();
      // Show individual dart scores in status if available
      if (dartScores.length > 0) {
        const dartBreakdown = dartScores.map((score, idx) => `D${idx + 1}: ${score}`).join(', ');
        console.log(`[BOT] Dart breakdown: ${dartBreakdown}`);
      }
      
      applyThrow('dartbot', botThrow, dartScores);
      setBotThinking(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [currentPlayer, winner]);

  // Handle back button for web and mobile
  const quitConfirmedRef = useRef(false);
  const showQuitConfirmRef = useRef(false);

  // Update ref when state changes
  useEffect(() => {
    showQuitConfirmRef.current = showQuitConfirm;
  }, [showQuitConfirm]);

  // Reset quit state when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      quitConfirmedRef.current = false;
      showQuitConfirmRef.current = false;
      setShowQuitConfirm(false);
      return () => {};
    }, [])
  );

  // Prevent removal during gameplay
  const shouldPreventRemoval = !matchWinner && !winner && !quitConfirmedRef.current;
  usePreventRemove(shouldPreventRemoval, () => {
    // This callback fires when user tries to navigate but removal is prevented
    if (!showQuitConfirmRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowQuitConfirm(true);
    }
  });

  // Mobile: Android/iOS hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (matchWinner || winner || quitConfirmedRef.current) {
        return false; // Allow default back behavior if match is over or quit confirmed
      }
      // Show modal if not already shown
      if (!showQuitConfirmRef.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setShowQuitConfirm(true);
      }
      // Always prevent default back behavior during gameplay
      return true;
    });

    return () => {
      backHandler.remove();
    };
  }, [matchWinner, winner]);

  const renderButton = (label: string, onPress: () => void, style?: any) => (
    <Button
      mode="contained"
      onPress={onPress}
      style={[styles.button, style]}
      labelStyle={styles.buttonLabel}
    >
      {label}
    </Button>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.content}>
        {/* Match Header - Show set/leg count */}
        <View style={{ marginBottom: 8, backgroundColor: theme.colors.surfaceVariant, padding: 8, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1 }}>
            {legOrSet === 'Sets' ? (
              <>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold', textAlign: 'center' }}>
                  {gameFormat} • Set {userSetsWon + botSetsWon + 1}, Leg {currentLegNumber}
                </Text>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 3, fontWeight: 'bold', textAlign: 'center' }}>
                  Sets: {userSetsWon} - {botSetsWon}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2, textAlign: 'center' }}>
                  Legs: {userLegsWon} - {botLegsWon}
                </Text>
              </>
            ) : (
              <>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold', textAlign: 'center' }}>
                  {gameFormat} • Leg {currentLegNumber}
                </Text>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 3, fontWeight: 'bold', textAlign: 'center' }}>
                  {userLegsWon} - {botLegsWon}
                </Text>
              </>
            )}
            {matchWinner && (
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 3, fontWeight: 'bold', textAlign: 'center' }}>
                {matchWinner === 'user' ? 'YOU WIN!' : 'BOT WINS!'}
              </Text>
            )}
          </View>
          <Button
            mode="contained"
            onPress={() => setShowStatsModal(true)}
            icon="chart-bar"
            compact
          >
            Stats
          </Button>
        </View>

        {/* Scoreboard */}
        <View style={styles.scoreRow}>
          <View style={[styles.scoreCard, { backgroundColor: theme.colors.surfaceVariant, borderColor: currentPlayer === 'user' ? theme.colors.primary : theme.colors.outline }]}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>You</Text>
            <Text variant="labelSmall" style={[styles.checkoutHintText, { color: theme.colors.onSurfaceVariant }]}>
              {userCheckoutDisplay || '—'}
            </Text>
            <Text variant="headlineMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {userScore}
            </Text>
          </View>
          <View style={[styles.scoreCard, { backgroundColor: theme.colors.surfaceVariant, borderColor: currentPlayer === 'dartbot' ? theme.colors.primary : theme.colors.outline }]}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Dartbot ({level})</Text>
            <Text variant="labelSmall" style={[styles.checkoutHintText, { color: theme.colors.onSurfaceVariant }]}>
              {botCheckoutDisplay || '—'}
            </Text>
            <Text variant="headlineMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {botScore}
            </Text>
          </View>
        </View>

        {/* Toggle Scoring Mode */}
        <Button
          mode={scoringMode === 'keypad' ? 'contained' : 'outlined'}
          onPress={() => {
            setScoringMode(scoringMode === 'keypad' ? 'perDart' : 'keypad');
            setCurrentDarts([]);
            setSelectedMultiplier(1);
            setInputScore('0');
          }}
          style={{ marginBottom: 12 }}
          disabled={winner !== null || currentPlayer === 'dartbot'}
        >
          {scoringMode === 'keypad' ? 'Switch to Per-Dart' : 'Switch to Keypad'}
        </Button>

        {/* Input Display */}
        <View style={[styles.display, { backgroundColor: theme.colors.surfaceVariant }]}>
          {scoringMode === 'keypad' ? (
            <>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                {winner ? 'Game Over' : currentPlayer === 'user' ? 'Your turn' : 'Dartbot thinking...'}
              </Text>
              <Text variant="displayLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                {winner ? (winner === 'user' ? 'You win!' : 'Dartbot wins!') : inputScore || '0'}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
                {status}
              </Text>
            </>
          ) : (
            <>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                {winner ? 'Game Over' : currentPlayer === 'user' ? 'Your turn' : 'Dartbot thinking...'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 8 }}>
                {currentDarts.map((dart, index) => (
                  <Text key={index} variant="headlineMedium" style={{ color: theme.colors.onSurfaceVariant, marginHorizontal: 4 }}>
                    {dart.label}
                  </Text>
                ))}
                {currentDarts.length === 0 && (
                  <Text variant="headlineMedium" style={{ color: theme.colors.onSurfaceVariant }}>---</Text>
                )}
              </View>
              <Text variant="displayMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {currentDarts.reduce((sum, dart) => sum + (dart.value * dart.multiplier), 0)}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
                {status}
              </Text>
            </>
          )}
        </View>

        {/* Scoring Input */}
        {scoringMode === 'keypad' ? (
        <View style={styles.keypad}>
          <View style={styles.row}>
            {renderButton('1', () => handleNumberPress('1'))}
            {renderButton('2', () => handleNumberPress('2'))}
            {renderButton('3', () => handleNumberPress('3'))}
          </View>
          <View style={styles.row}>
            {renderButton('4', () => handleNumberPress('4'))}
            {renderButton('5', () => handleNumberPress('5'))}
            {renderButton('6', () => handleNumberPress('6'))}
          </View>
          <View style={styles.row}>
            {renderButton('7', () => handleNumberPress('7'))}
            {renderButton('8', () => handleNumberPress('8'))}
            {renderButton('9', () => handleNumberPress('9'))}
          </View>
          <View style={styles.row}>
            {renderButton('Clear', handleClear, { backgroundColor: theme.colors.error })}
            {renderButton('0', () => handleNumberPress('0'))}
            {renderButton('⌫', handleBackspace, { backgroundColor: theme.colors.tertiary })}
          </View>

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={() => handleSubmit()}
          style={styles.submitButton}
          disabled={currentPlayer === 'dartbot' || !!winner}
        >
          Submit Score
        </Button>
        </View>
        ) : (
        <View style={styles.perDartContainer}>
          {/* Bull and 25 buttons */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Button
              mode="contained"
              onPress={() => handleDartSelect(50, 1, 'Bull')}
              style={{ flex: 1 }}
              disabled={winner !== null || currentPlayer === 'dartbot' || currentDarts.length >= 3}
            >
              Bull (50)
            </Button>
            <Button
              mode="contained"
              onPress={() => handleDartSelect(25, 1, '25')}
              style={{ flex: 1 }}
              disabled={winner !== null || currentPlayer === 'dartbot' || currentDarts.length >= 3}
            >
              25
            </Button>
          </View>

          {/* Multiplier Selection */}
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>Select Multiplier:</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <Button
              mode={selectedMultiplier === 1 ? 'contained' : 'outlined'}
              onPress={() => setSelectedMultiplier(1)}
              style={{ flex: 1 }}
              disabled={winner !== null || currentPlayer === 'dartbot'}
            >
              Single
            </Button>
            <Button
              mode={selectedMultiplier === 2 ? 'contained' : 'outlined'}
              onPress={() => setSelectedMultiplier(2)}
              style={{ flex: 1 }}
              disabled={winner !== null || currentPlayer === 'dartbot'}
            >
              Double
            </Button>
            <Button
              mode={selectedMultiplier === 3 ? 'contained' : 'outlined'}
              onPress={() => setSelectedMultiplier(3)}
              style={{ flex: 1 }}
              disabled={winner !== null || currentPlayer === 'dartbot'}
            >
              Treble
            </Button>
          </View>

          {/* Number Grid (1-20) */}
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>Select Number:</Text>
          <View style={styles.dartTable}>
            {[0, 1, 2, 3].map((rowIndex) => (
              <View key={rowIndex} style={styles.dartTableRow}>
                {[1, 2, 3, 4, 5].map((colIndex) => {
                  const num = rowIndex * 5 + colIndex;
                  return (
                    <Button
                      key={colIndex}
                      mode="outlined"
                      compact
                      onPress={() => handleDartSelect(num)}
                      style={[styles.dartTableCell, styles.dartTableButton]}
                      labelStyle={{ fontSize: 12, fontWeight: 'bold' }}
                      contentStyle={{ height: 40 }}
                      disabled={winner !== null || currentPlayer === 'dartbot' || currentDarts.length >= 3}
                    >
                      {num}
                    </Button>
                  );
                })}
              </View>
            ))}
          </View>
          {/* Control Buttons */}
          <View style={{ flexDirection: 'row', marginTop: 16, gap: 8 }}>
            <Button
              mode="outlined"
              onPress={handleDartRemove}
              style={{ flex: 1 }}
              icon="arrow-left"
              disabled={winner !== null || currentPlayer === 'dartbot' || currentDarts.length === 0}
            >
              Back
            </Button>
            <Button
              mode="outlined"
              onPress={() => {
                if (currentDarts.length < 3) {
                  handleDartSelect(0, 1, 'Miss');
                }
              }}
              style={{ flex: 1 }}
              disabled={winner !== null || currentPlayer === 'dartbot' || currentDarts.length >= 3}
            >
              MISS
            </Button>
          </View>
          <Button
            mode="contained"
            onPress={handlePerDartConfirm}
            style={styles.submitButton}
            disabled={winner !== null || currentPlayer === 'dartbot' || currentDarts.length === 0}
          >
            Confirm ({currentDarts.length} dart{currentDarts.length !== 1 ? 's' : ''})
          </Button>
        </View>
        )}

        {initialFirstPlayer === 'user' && (
          <Button
            mode="outlined"
            onPress={handleUndo}
            style={{ marginBottom: 8 }}
            disabled={history.length === 0}
          >
            Undo Last Turn
          </Button>
        )}
        {initialFirstPlayer === 'dartbot' && userThrows.length > 0 && (
          <Button
            mode="outlined"
            onPress={handleUndo}
            style={{ marginBottom: 8 }}
            disabled={history.length === 0}
          >
            Undo Last Turn
          </Button>
        )}
        {matchWinner && (
          <Button
            mode="outlined"
            onPress={() => setShowQuitConfirm(true)}
            style={{ marginTop: 12 }}
          >
            View Results
          </Button>
        )}
      </ScrollView>

      {/* Double Prompt Modal */}
      <Modal visible={showDoublePrompt} transparent={true} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalOverlay, { backgroundColor: `${theme.colors.background}E6` }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <Text variant="headlineSmall" style={{ color: theme.colors.onBackground, marginBottom: 16 }}>
              How many darts were thrown at double?
            </Text>
            <View style={styles.buttonGrid}>
              {(() => {
                const score = scoreBeforeDoublePrompt;
                let options: string[];
                
                // Checkout attempts from 99 or 101-170 (excluding special scores): [0, 1]
                const specialCheckoutScores = [100, 101, 104, 107, 110];
                const isCheckoutAttempt = score === 99 || (score >= 102 && score <= 170 && !specialCheckoutScores.includes(score));
                
                // Even 2-40 or 50: [0, 1, 2, 3]
                const isEven2To40 = score >= 2 && score <= 40 && score % 2 === 0;
                const is50 = score === 50;
                
                if (isCheckoutAttempt) {
                  options = ['0', '1'];
                } else if (isEven2To40 || is50) {
                  options = ['0', '1', '2', '3'];
                } else {
                  // Everything else (under 99, odd 2-40, 100, 101, 104, 107, 110): [0, 1, 2]
                  options = ['0', '1', '2'];
                }
                
                return options.map((num) => (
                  <Button
                    key={num}
                    mode="contained"
                    onPress={() => handleDoublePromptClose(num)}
                    style={{ flex: 1, marginHorizontal: 4 }}
                  >
                    {num}
                  </Button>
                ));
              })()}
            </View>
            <Button
              mode="outlined"
              onPress={() => {
                // Simply close the modal - score was never changed since we deferred it
                setPendingThrow(null);
                setShowDoublePrompt(false);
                // Remove the history entry that was created when applyThrow was called
                setHistory((prev) => prev.slice(0, -1));
                // Remove the logged throw for this attempt
                setUserThrows((prev) => prev.slice(0, -1));
              }}
              style={{ marginTop: 16, width: '100%' }}
            >
              Back
            </Button>
          </View>
        </View>
      </Modal>

      {/* Checkout Prompt Modal */}
      <Modal visible={showCheckoutPrompt} transparent={true} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalOverlay, { backgroundColor: `${theme.colors.background}E6` }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <Text variant="headlineSmall" style={{ color: theme.colors.onBackground, marginBottom: 16 }}>
              How many darts to checkout?
            </Text>
            <View style={styles.buttonGrid}>
              {getCheckoutOptions(checkoutScore).dartsOptions.map((num) => (
                <Button
                  key={num}
                  mode={checkoutDartsInput === num ? "contained" : "outlined"}
                  onPress={() => setCheckoutDartsInput(num)}
                  style={{ flex: 1, marginHorizontal: 4, marginBottom: 8 }}
                >
                  {num}
                </Button>
              ))}
            </View>
            <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginTop: 8, marginBottom: 8 }}>
              Darts at double?
            </Text>
            <View style={styles.buttonGrid}>
              {getCheckoutOptions(checkoutScore).doublesOptions.map((num) => (
                <Button
                  key={num}
                  mode={checkoutDoublesInput === num ? "contained" : "outlined"}
                  onPress={() => setCheckoutDoublesInput(num)}
                  style={{ flex: 1, marginHorizontal: 4 }}
                >
                  {num}
                </Button>
              ))}
            </View>
            <Button
              mode="contained"
              onPress={handleCheckoutSubmit}
              disabled={!checkoutDartsInput || !checkoutDoublesInput}
              style={{ marginTop: 16 }}
            >
              Finish Game
            </Button>
            <Button
              mode="outlined"
              onPress={() => {
                setShowCheckoutPrompt(false);
                // Remove the history entry that was created when applyThrow was called
                setHistory((prev) => prev.slice(0, -1));
                // Remove the logged throw for this attempt
                setUserThrows((prev) => prev.slice(0, -1));
              }}
              style={{ marginTop: 12, width: '100%' }}
            >
              Back
            </Button>
          </View>
        </View>
      </Modal>

      {/* Double In Prompt Modal */}
      <Modal visible={showDoubleInPrompt} transparent={true} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalOverlay, { backgroundColor: `${theme.colors.background}E6` }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <Text variant="headlineSmall" style={{ color: theme.colors.onBackground, marginBottom: 16 }}>
              How many darts to hit the double to start scoring?
            </Text>
            <View style={styles.buttonGrid}>
              {[1, 2, 3].map((num) => (
                <Button
                  key={num}
                  mode={doubleInDartsInput === String(num) ? "contained" : "outlined"}
                  onPress={() => setDoubleInDartsInput(String(num))}
                  style={{ flex: 1, marginHorizontal: 4, marginBottom: 8 }}
                >
                  {num}
                </Button>
              ))}
            </View>
            <Button
              mode="contained"
              onPress={handleDoubleInSubmit}
              disabled={!doubleInDartsInput}
              style={{ marginTop: 16 }}
            >
              Confirm
            </Button>
            <Button
              mode="outlined"
              onPress={() => {
                setShowDoubleInPrompt(false);
                setPendingThrow(null);
              }}
              style={{ marginTop: 12, width: '100%' }}
            >
              Cancel
            </Button>
          </View>
        </View>
      </Modal>

      {/* Stats Modal */}
      <Modal visible={showStatsModal} transparent={true} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalOverlay, { backgroundColor: `${theme.colors.background}E6` }]}>
          <ScrollView style={[styles.modalContent, { backgroundColor: theme.colors.background, maxWidth: '90%' }]}>
            <Text variant="headlineMedium" style={{ color: theme.colors.onBackground, marginBottom: 16, textAlign: 'center' }}>
              Match Statistics
            </Text>
            
            {/* Tab Navigation */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <Button
                mode={statsPage === 'overview' ? 'contained' : 'outlined'}
                onPress={() => setStatsPage('overview')}
                style={{ flex: 1 }}
              >
                Overview
              </Button>
              <Button
                mode={statsPage === 'scores' ? 'contained' : 'outlined'}
                onPress={() => setStatsPage('scores')}
                style={{ flex: 1 }}
              >
                Scores
              </Button>
            </View>

            {statsPage === 'overview' ? (
            <>
            {/* Game Info */}
            <View style={{ backgroundColor: theme.colors.surfaceVariant, padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                {gameFormat}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }}>
                {outRule === 'double' ? 'DOUBLE OUT' : 'STRAIGHT OUT'}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }}>
                Sets: You {userSetsWon} - {botSetsWon} Dartbot ({level})
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 2 }}>
                Current: Set {userSetsWon + botSetsWon + 1}, Leg {currentLegNumber} • Legs: You {userLegsWon} - {botLegsWon} Dartbot ({level})
              </Text>
            </View>

            {/* Stats Table */}
            <View style={styles.statsTable}>
              {/* Header Row */}
              <View style={styles.statsRow}>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>You</Text>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}> </Text>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>Dartbot ({level})</Text>
              </View>

              {/* 3-dart average */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.threeDartAvg ? userStats.threeDartAvg.toFixed(2) : '0.00'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>3-dart average</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botStats.threeDartAvg ? botStats.threeDartAvg.toFixed(2) : '0.00'}</Text>
              </View>

              {/* First 9 avg */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.first9Avg ? userStats.first9Avg.toFixed(2) : '0.00'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>First 9 avg.</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botStats.first9Avg ? botStats.first9Avg.toFixed(2) : '0.00'}</Text>
              </View>

              {/* Checkout rate */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.checkoutRate ? userStats.checkoutRate.toFixed(2) : '0.00'}%</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Checkout rate</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botStats.checkoutRate ? botStats.checkoutRate.toFixed(2) : '0.00'}%</Text>
              </View>

              {inRule === 'double' && (
                <View style={styles.statsRow}>
                  <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{cumulativeDoubleInAttempts > 0 ? ((cumulativeDoubleInSuccess / cumulativeDoubleInAttempts) * 100).toFixed(2) : '0.00'}%</Text>
                  <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Double In rate</Text>
                  <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
                </View>
              )}

              {/* Checkouts */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.checkoutSuccess}/{userStats.checkoutAttempts || 0}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Checkouts</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botStats.checkoutSuccess}/{botStats.checkoutAttempts || 0}</Text>
              </View>

              {/* Highest finish */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userHighestFinish > 0 ? userHighestFinish : '-'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Highest finish</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botHighestFinish > 0 ? botHighestFinish : '-'}</Text>
              </View>

              {/* Highest score */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{Math.max(...userThrows, 0)}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Highest score</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{Math.max(...botThrows, 0)}</Text>
              </View>

              {/* Best leg */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userBestLeg > 0 ? `${userBestLeg} DARTS` : '-'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Best leg</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botBestLeg > 0 ? `${botBestLeg} DARTS` : '-'}</Text>
              </View>

              {/* Worst leg */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userWorstLeg > 0 ? `${userWorstLeg} DARTS` : '-'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Worst leg</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botWorstLeg > 0 ? `${botWorstLeg} DARTS` : '-'}</Text>
              </View>

              {/* Darts Thrown This Leg */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.dartsThrown || 0}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Darts Thrown</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botStats.dartsThrown || 0}</Text>
              </View>

              {/* Last Throw */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.lastScore || 0}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Last Throw</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botStats.lastScore || 0}</Text>
              </View>
            </View>
            </>
            ) : (
            <>
            {/* Scores Breakdown */}
            <View style={styles.statsTable}>
              {/* Header Row */}
              <View style={styles.statsRow}>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>User</Text>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Score Range</Text>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>Dartbot ({level})</Text>
              </View>

              {(() => {
                const scoreRanges = [
                  { label: '180', min: 180, max: 180 },
                  { label: '171+', min: 171, max: 179 },
                  { label: '151+', min: 151, max: 170 },
                  { label: '131+', min: 131, max: 150 },
                  { label: '111+', min: 111, max: 130 },
                  { label: '91+', min: 91, max: 110 },
                  { label: '71+', min: 71, max: 90 },
                  { label: '51+', min: 51, max: 70 },
                  { label: '31+', min: 31, max: 50 },
                ];

                return scoreRanges.map((range, index) => {
                  const userCount = userThrows.filter((score) => score >= range.min && score <= range.max).length;
                  const botCount = botThrows.filter((score) => score >= range.min && score <= range.max).length;
                  const isAlt = index % 2 === 1;
                  return (
                    <View key={range.label} style={[styles.statsRow, isAlt && styles.statsRowAlt]}>
                      <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>
                        {userCount}
                      </Text>
                      <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>
                        {range.label}
                      </Text>
                      <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>
                        {botCount}
                      </Text>
                    </View>
                  );
                });
              })()}
            </View>
            </>
            )}

            <Button
              mode="contained"
              onPress={() => {
                setShowStatsModal(false);
                setStatsPage('overview');
              }}
              style={{ marginTop: 24, marginBottom: 32 }}
            >
              Close
            </Button>
          </ScrollView>
        </View>
      </Modal>

      {/* Game Over Results Modal */}
      <Modal visible={matchWinner !== null && showQuitConfirm} transparent={true} animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: `${theme.colors.background}E6` }]}>
          <ScrollView style={[styles.modalContent, { backgroundColor: theme.colors.background, maxWidth: '95%', maxHeight: '90%' }]}>
            
            {/* Final Result Header */}
            <View style={{ backgroundColor: theme.colors.primary, padding: 16, borderRadius: 12, marginBottom: 16, alignItems: 'center' }}>
              <Text variant="displaySmall" style={{ color: theme.colors.onPrimary, fontWeight: 'bold', marginBottom: 8 }}>
                {matchWinner === 'user' ? '🎉 YOU WIN! 🎉' : '💪 DARTBOT WINS 💪'}
              </Text>
              <Text variant="headlineSmall" style={{ color: theme.colors.onPrimary, marginTop: 8 }}>
                {gameFormat}
              </Text>
              {legOrSet === 'Sets' ? (
                <Text variant="titleLarge" style={{ color: theme.colors.onPrimary, fontWeight: 'bold', marginTop: 8 }}>
                  Sets: {userSetsWon} - {botSetsWon}
                </Text>
              ) : (
                <Text variant="titleLarge" style={{ color: theme.colors.onPrimary, fontWeight: 'bold', marginTop: 8 }}>
                  Legs: {userLegsWon} - {botLegsWon}
                </Text>
              )}
            </View>

            {/* Final Stats */}
            <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 12, fontWeight: 'bold' }}>
              Final Statistics
            </Text>
            <View style={styles.statsTable}>
              {/* Header Row */}
              <View style={styles.statsRow}>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>You</Text>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}> </Text>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>Dartbot ({level})</Text>
              </View>

              {/* 3-dart average */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.threeDartAvg.toFixed(2)}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>3-dart avg</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botStats.threeDartAvg.toFixed(2)}</Text>
              </View>

              {/* Checkout rate */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.checkoutRate.toFixed(2)}%</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Checkout rate</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botStats.checkoutRate.toFixed(2)}%</Text>
              </View>

              {inRule === 'double' && (
                <View style={[styles.statsRow, styles.statsRowAlt]}>
                  <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{cumulativeDoubleInAttempts > 0 ? ((cumulativeDoubleInSuccess / cumulativeDoubleInAttempts) * 100).toFixed(2) : '0.00'}%</Text>
                  <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Double In rate</Text>
                  <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
                </View>
              )}

              {/* Checkouts */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.checkoutSuccess}/{userStats.checkoutAttempts || 0}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Checkouts</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botStats.checkoutSuccess}/{botStats.checkoutAttempts || 0}</Text>
              </View>

              {/* Highest score */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{Math.max(...userThrows, 0)}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Highest score</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{Math.max(...botThrows, 0)}</Text>
              </View>

              {/* Best leg */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userBestLeg > 0 ? `${userBestLeg} darts` : '-'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Best leg</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>{botBestLeg > 0 ? `${botBestLeg} darts` : '-'}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 20 }}>
              <Button
                mode="contained"
                onPress={() => {
                  setShowQuitConfirm(false);
                  setTimeout(() => {
                    router.push('/screens/GameSetupScreen');
                  }, 100);
                }}
                style={{ flex: 1 }}
              >
                New Game
              </Button>
              <Button
                mode="outlined"
                onPress={() => {
                  setShowQuitConfirm(false);
                  setTimeout(() => {
                    router.push('/screens/HomeScreen');
                  }, 100);
                }}
                style={{ flex: 1 }}
              >
                Quit
              </Button>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Quit Confirmation Modal (during gameplay) */}
      <Modal visible={!matchWinner && showQuitConfirm} transparent={true} animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: `${theme.colors.background}E6` }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <Text variant="headlineSmall" style={{ color: theme.colors.onBackground, marginBottom: 24, textAlign: 'center' }}>
              Do you want to quit this match?
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button
                mode="outlined"
                onPress={() => setShowQuitConfirm(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={() => {
                  quitConfirmedRef.current = true;
                  setShowQuitConfirm(false);
                  setTimeout(() => {
                    router.push('/screens/HomeScreen');
                  }, 100);
                }}
                buttonColor={theme.colors.error}
                style={{ flex: 1 }}
              >
                Quit
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  scoreCard: {
    flex: 1,
    marginHorizontal: 4,
    padding: 6,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  checkoutHintText: {
    marginTop: 2,
    minHeight: 16,
    fontWeight: '700',
  },
  display: {
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    minHeight: 50,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  keypad: {
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  button: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 4,
    borderRadius: 8,
  },
  buttonLabel: {
    fontSize: 16,
    lineHeight: 32,
  },
  submitButton: {
    marginVertical: 4,
    paddingVertical: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    marginHorizontal: 20,
    padding: 24,
    borderRadius: 20,
    minWidth: '80%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  buttonGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  perDartContainer: {
    marginVertical: 12,
  },
  dartTable: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dartTableRow: {
    flexDirection: 'row',
  },
  dartTableCell: {
    flex: 1,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#444',
    minHeight: 36,
  },
  dartTableButton: {
    margin: 0,
    borderRadius: 0,
  },
  statsTable: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    overflow: 'hidden',
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  statsRowAlt: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  statsCell: {
    flex: 1,
  },
  statsCellLeft: {
    textAlign: 'left',
    fontWeight: 'bold',
  },
  statsCellCenter: {
    textAlign: 'center',
    flex: 2,
  },
  statsCellRight: {
    textAlign: 'right',
    fontWeight: 'bold',
  },
});