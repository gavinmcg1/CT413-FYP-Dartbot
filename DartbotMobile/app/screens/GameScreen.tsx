import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Modal, Platform } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

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
  const [userCheckoutDarts, setUserCheckoutDarts] = useState<number | null>(null);
  const [userCheckoutDoubles, setUserCheckoutDoubles] = useState<number | null>(null);
  const [doubleAttempts, setDoubleAttempts] = useState<number>(0);
  const [currentLegStartIndex, setCurrentLegStartIndex] = useState<number>(0);
  
  // Cumulative stats across all legs
  const [cumulativeDoubleAttempts, setCumulativeDoubleAttempts] = useState<number>(0);
  const [cumulativeCheckoutSuccess, setCumulativeCheckoutSuccess] = useState<number>(0);

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

  // State to track the last dart's multiplier for checkout validation
  const [lastDartMultiplier, setLastDartMultiplier] = useState<1 | 2 | 3>(1);

  const handlePerDartConfirm = () => {
    if (currentDarts.length === 0) return;
    const totalScore = currentDarts.reduce((sum, dart) => sum + (dart.value * dart.multiplier), 0);
    // Track the last dart's multiplier for finishing validation
    const lastDartMult = currentDarts[currentDarts.length - 1].multiplier;
    setLastDartMultiplier(lastDartMult);
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
    
    // For keypad mode, use selectedMultiplier; for per-dart mode, lastDartMultiplier is already set
    if (scoringMode === 'keypad') {
      setLastDartMultiplier(selectedMultiplier);
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
      // Alternate first player for next leg
      const nextFirstPlayer = initialFirstPlayer === 'user' ? (currentLegNumber % 2 === 0 ? 'user' : 'dartbot') : (currentLegNumber % 2 === 0 ? 'dartbot' : 'user');
      setCurrentPlayer(nextFirstPlayer);
      setStatus(`Leg ${newUserLegsWon + newBotLegsWon + 1} starting. ${nextFirstPlayer === 'user' ? 'You' : 'Dartbot'} throws first.`);
      setCurrentLegStartIndex(userThrows.length);
      setUserCheckoutDarts(null);
      setUserCheckoutDoubles(null);
      setDoubleAttempts(0);
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
      // Alternate first player for next set
      const nextFirstPlayer = initialFirstPlayer === 'user' ? (newUserSetsWon % 2 === 0 ? 'user' : 'dartbot') : (newUserSetsWon % 2 === 0 ? 'dartbot' : 'user');
      setCurrentPlayer(nextFirstPlayer);
      setStatus(`Set ${newUserSetsWon + newBotSetsWon} won! Starting Leg 1 of Set ${newUserSetsWon + newBotSetsWon + 1}. ${nextFirstPlayer === 'user' ? 'You' : 'Dartbot'} throws first.`);
      setCurrentLegStartIndex(userThrows.length);
      setUserCheckoutDarts(null);
      setUserCheckoutDoubles(null);
      setDoubleAttempts(0);
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
    // Alternate first player for next leg - swap who threw first each leg
    const nextFirstPlayer = initialFirstPlayer === 'user' ? (currentLegNumber % 2 === 0 ? 'user' : 'dartbot') : (currentLegNumber % 2 === 0 ? 'dartbot' : 'user');
    setCurrentPlayer(nextFirstPlayer);
    setStatus(`Leg ${newUserLegsWon + newBotLegsWon + 1} starting. ${nextFirstPlayer === 'user' ? 'You' : 'Dartbot'} throws first.`);
    // Mark where the next leg starts for per-leg calculations
    setCurrentLegStartIndex(userThrows.length);
    // Reset per-leg tracking
    setUserCheckoutDarts(null);
    setUserCheckoutDoubles(null);
    setDoubleAttempts(0);
  };

  const applyThrow = (player: Player, throwScore: number) => {
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
          // Calculate best leg based on current throws + checkout darts
          setUserThrows((currentThrows) => {
            const totalDartsThisLeg = Math.max(0, currentThrows.length - 1) * 3 + dartsThrown;
            setUserBestLeg((prevBestLeg) => 
              prevBestLeg === 0 || totalDartsThisLeg < prevBestLeg ? totalDartsThisLeg : prevBestLeg
            );
            return currentThrows;
          });
          setLastDartMultiplier(1); // Reset for next leg
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
            // Calculate best leg based on current throws + checkout darts
            setUserThrows((currentThrows) => {
              const totalDartsThisLeg = Math.max(0, currentThrows.length - 1) * 3 + 3;
              setUserBestLeg((prevBestLeg) => 
                prevBestLeg === 0 || totalDartsThisLeg < prevBestLeg ? totalDartsThisLeg : prevBestLeg
              );
              return currentThrows;
            });
            setLastDartMultiplier(1); // Reset for next leg
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
        setBotScore(0);
        setLastDartMultiplier(1); // Reset for next leg
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
        setStatus(`Dartbot scored ${throwScore}. Next throw: You.`);
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
      
      // Calculate stats and set winner
      const turns = userThrows.length;
      const totalDartsThisLeg = Math.max(0, turns - 1) * 3 + (Number.isNaN(darts) ? 0 : darts);
      if (userBestLeg === 0 || totalDartsThisLeg < userBestLeg) {
        setUserBestLeg(totalDartsThisLeg);
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
        if (scoringMode === 'keypad') {
          setLastDartMultiplier(selectedMultiplier);
        }
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
      // For 100,101,104,107,110 and odd < 40: allow 2 or 3 darts to checkout
      dartsOptions: (isOddUnder40 || isSpecialPrompt || isUnder98) ? ['2', '3'] : ['1', '2'],
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

    // Current leg throws only for per-leg stats
    const currentLegThrows = userThrows.slice(currentLegStartIndex);
    const turns = currentLegThrows.length;
    const dartsInCurrentLeg = userCheckoutDarts
      ? Math.max(0, turns - 1) * 3 + userCheckoutDarts
      : turns * 3;

    // 3DA is total score divided by actual darts thrown in current leg
    const currentLegTotal = currentLegThrows.reduce((a, b) => a + b, 0);
    const threeDartAvg = dartsInCurrentLeg > 0 ? ((currentLegTotal / dartsInCurrentLeg) * 3).toFixed(2) : 0;
    
    // 9DA is first 3 turns of current leg only
    const first3 = currentLegThrows.slice(0, 3);
    const first3Total = first3.reduce((a, b) => a + b, 0);
    const first9Avg = first3.length === 3 ? ((first3Total / 9) * 3).toFixed(2) : 0;

    // Use cumulative stats for checkout rate across the entire match
    const checkoutAttempts = cumulativeDoubleAttempts || 0;
    const checkoutSuccess = cumulativeCheckoutSuccess || 0;
    const checkoutRate = checkoutAttempts > 0 ? ((checkoutSuccess / checkoutAttempts) * 100).toFixed(2) : '0';
    
    return {
      threeDartAvg: parseFloat(threeDartAvg as string) || 0,
      first9Avg: parseFloat(first9Avg as string) || 0,
      checkoutRate: parseFloat(checkoutRate as string) || 0,
      checkoutAttempts: checkoutAttempts || 0,
      checkoutSuccess: checkoutSuccess || 0,
      lastScore: currentLegThrows[currentLegThrows.length - 1] || 0,
      dartsThrown: dartsInCurrentLeg,
    };
  }, [userThrows, userCheckoutDarts, userCheckoutDoubles, cumulativeDoubleAttempts, cumulativeCheckoutSuccess, currentLegStartIndex]);

  const generateBotThrow = (): number => {
    // Simple model: target mean increases with level, some randomness; try to finish if possible
    const botCurrent = botScore;
    const needsDouble = outRule === 'double';
    const noCheckout = [1, 159, 162, 163, 165, 166, 168, 169];

    // Try to finish if feasible
    if (botCurrent <= 170) {
      if (!needsDouble || botCurrent % 2 === 0) {
        // Only return checkout if it's valid
        if (!noCheckout.includes(botCurrent)) {
          return botCurrent; // attempt checkout
        }
      }
    }

    const mean = 40 + level * 4; // rough scaling 1-18 => 44..112
    const spread = 45;
    const rand = () => Math.random();
    const noise = (rand() + rand() + rand()) / 3; // pseudo-normal 0-1
    let attempt = Math.round(mean + (noise - 0.5) * spread);
    if (attempt < 0) attempt = 0;
    if (attempt > 180) attempt = 180;
    if (needsDouble && attempt > botCurrent) attempt = botCurrent - (botCurrent % 2);
    if (attempt < 0) attempt = 0;
    return attempt;
  };

  useEffect(() => {
    if (winner) return;
    if (currentPlayer !== 'dartbot') return;
    setBotThinking(true);
    const timer = setTimeout(() => {
      const botThrow = generateBotThrow();
      // For bot finishing throws in double out, assume it hits a double
      if (botThrow === botScore && outRule === 'double' && botThrow <= 170 && botThrow % 2 === 0) {
        setLastDartMultiplier(2);
      } else {
        setLastDartMultiplier(1);
      }
      applyThrow('dartbot', botThrow);
      setBotThinking(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [currentPlayer, winner]);

  // Handle back button
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (matchWinner) {
        // Allow navigation if match is over
        return;
      }
      // Prevent default behavior (going back)
      e.preventDefault();
      // Show quit confirmation
      setShowQuitConfirm(true);
    });
    return unsubscribe;
  }, [navigation, matchWinner]);

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
            <Text variant="headlineMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {userScore}
            </Text>
          </View>
          <View style={[styles.scoreCard, { backgroundColor: theme.colors.surfaceVariant, borderColor: currentPlayer === 'dartbot' ? theme.colors.primary : theme.colors.outline }]}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Dartbot</Text>
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
                Sets: You {userSetsWon} - {botSetsWon} Dartbot
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 2 }}>
                Current: Set {userSetsWon + botSetsWon + 1}, Leg {currentLegNumber} • Legs: You {userLegsWon} - {botLegsWon} Dartbot
              </Text>
            </View>

            {/* Stats Table */}
            <View style={styles.statsTable}>
              {/* Header Row */}
              <View style={styles.statsRow}>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>You</Text>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}> </Text>
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>Dartbot</Text>
              </View>

              {/* 3-dart average */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.threeDartAvg ? userStats.threeDartAvg.toFixed(2) : '0.00'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>3-dart average</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* First 9 avg */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.first9Avg ? userStats.first9Avg.toFixed(2) : '0.00'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>First 9 avg.</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Checkout rate */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.checkoutRate ? userStats.checkoutRate.toFixed(2) : '0.00'}%</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Checkout rate</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
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
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Highest finish */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userCheckoutDarts && userCheckoutDarts > 0 ? startingScore - userScore : '-'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Highest finish</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Highest score */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{Math.max(...userThrows, 0)}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Highest score</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Best leg */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userBestLeg > 0 ? `${userBestLeg} DARTS` : '-'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Best leg</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Worst leg */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>-</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Worst leg</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Darts Thrown This Leg */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.dartsThrown || 0}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Darts Thrown</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Last Throw */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.lastScore || 0}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Last Throw</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
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
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>Dartbot</Text>
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
                  const count = userThrows.filter((score) => score >= range.min && score <= range.max).length;
                  const isAlt = index % 2 === 1;
                  return (
                    <View key={range.label} style={[styles.statsRow, isAlt && styles.statsRowAlt]}>
                      <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>
                        {count}
                      </Text>
                      <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>
                        {range.label}
                      </Text>
                      <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>
                        -
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
                <Text variant="titleSmall" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>Dartbot</Text>
              </View>

              {/* 3-dart average */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.threeDartAvg ? userStats.threeDartAvg.toFixed(2) : '0.00'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>3-dart avg</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Checkout rate */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userStats.checkoutRate ? userStats.checkoutRate.toFixed(2) : '0.00'}%</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Checkout rate</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
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
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Highest score */}
              <View style={styles.statsRow}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{Math.max(...userThrows, 0)}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Highest score</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
              </View>

              {/* Best leg */}
              <View style={[styles.statsRow, styles.statsRowAlt]}>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellLeft, { color: theme.colors.onBackground }]}>{userBestLeg > 0 ? `${userBestLeg} darts` : '-'}</Text>
                <Text variant="bodyMedium" style={[styles.statsCell, styles.statsCellCenter, { color: theme.colors.onBackground }]}>Best leg</Text>
                <Text variant="bodyLarge" style={[styles.statsCell, styles.statsCellRight, { color: theme.colors.onBackground }]}>-</Text>
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
                    router.push('/screens/GameModesScreen');
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
                  setShowQuitConfirm(false);
                  setTimeout(() => {
                    router.push('/screens/GameModesScreen');
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
  dartTableHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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