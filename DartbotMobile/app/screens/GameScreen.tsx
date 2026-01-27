import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Modal, Platform } from 'react-native';
import { Text, Button, useTheme, TextInput } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  const level = parseInt(params.level as string, 10) || 10; // 1-18 from setup screen
  const [userScore, setUserScore] = useState<number>(startingScore);
  const [botScore, setBotScore] = useState<number>(startingScore);
  const initialFirstPlayer = (params.firstPlayer as Player) || 'user';
  const [currentPlayer, setCurrentPlayer] = useState<Player>(initialFirstPlayer);
  const [inputScore, setInputScore] = useState<string>('0');
  const [status, setStatus] = useState<string>('Enter your score');
  const [winner, setWinner] = useState<Player | null>(null);
  const [,setBotThinking] = useState<boolean>(false);

  // Stats tracking
  const [userThrows, setUserThrows] = useState<number[]>([]);
  const [userBestLeg, setUserBestLeg] = useState<number>(0);
  const [userCheckoutDarts, setUserCheckoutDarts] = useState<number | null>(null);
  const [userCheckoutDoubles, setUserCheckoutDoubles] = useState<number | null>(null);
  const [doubleAttempts, setDoubleAttempts] = useState<number>(0);

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
  const [doublePromptInput, setDoublePromptInput] = useState<string>('');
  const [checkoutDartsInput, setCheckoutDartsInput] = useState<string>('');
  const [checkoutDoublesInput, setCheckoutDoublesInput] = useState<string>('');

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

  const isValidThrow = (val: number) => val >= 0 && val <= 180 && ![179, 178, 176, 175, 173, 172, 169, 166, 163].includes(val);

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
      },
    ]);

    const logUserTurn = (score: number) => {
      if (player === 'user') {
        setUserThrows((prev) => [...prev, score]);
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
        // Auto-finish for checkouts 99 and 101+ except specific scores that should prompt
        const promptCheckouts = [101, 104, 107, 110];
        if (scoreBefore === 99 || (scoreBefore >= 101 && !promptCheckouts.includes(scoreBefore))) {
          setUserScore(0);
          setUserCheckoutDarts(3);
          setUserCheckoutDoubles(1);
          setDoubleAttempts((prev) => prev + 1);
          // Calculate best leg based on current throws + checkout darts
          setUserThrows((currentThrows) => {
            const totalDartsThisLeg = Math.max(0, currentThrows.length - 1) * 3 + 3;
            setUserBestLeg((prevBestLeg) => 
              prevBestLeg === 0 || totalDartsThisLeg < prevBestLeg ? totalDartsThisLeg : prevBestLeg
            );
            return currentThrows;
          });
          setWinner('user');
          setStatus('You win!');
        } else {
          // Check out achieved - show checkout prompt (don't set score yet)
          setCheckoutScore(scoreBefore);
          setShowCheckoutPrompt(true);
        }
      } else {
        setBotScore(0);
        setWinner(player);
        setStatus(`Dartbot wins!`);
      }
    } else {
      // Normal subtraction
      const newScore = scoreBefore - throwScore;
      if (player === 'user') {
        // Prompt whenever at 50 or below (and above 0) - defer score update until confirmed
        if (newScore > 0 && newScore <= 50 && isCheckoutEligible(scoreBefore)) {
          setPendingThrow(throwScore);
          setScoreBeforeDoublePrompt(scoreBefore);
          setShowDoublePrompt(true);
          return; // Don't transition to dartbot yet
        } else {
          setUserScore(newScore);
          setStatus(`You scored ${throwScore}. Next throw: Dartbot.`);
        }
      } else {
        setBotScore(newScore);
        setStatus(`Dartbot scored ${throwScore}. Next throw: You.`);
      }
      setCurrentPlayer(player === 'user' ? 'dartbot' : 'user');
    }
  };

  const handleSubmit = () => {
    if (winner || currentPlayer === 'dartbot') return;
    if (!inputScore) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const val = parseInt(inputScore, 10);
    applyThrow('user', val);
    setInputScore('0');
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
      
      return prev.slice(0, -statesToUndo);
    });
  };

  const handleDoublePromptClose = (dartsAtDouble: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const attempts = parseInt(dartsAtDouble, 10);
    if (!Number.isNaN(attempts) && attempts > 0) {
      setDoubleAttempts((prev) => prev + attempts);
    }
    
    // Apply the deferred throw now (if any)
    if (pendingThrow !== null) {
      const newScore = userScore - pendingThrow;
      setUserScore(newScore);
    }
    
    // Always advance to dartbot after double prompt is confirmed
    setCurrentPlayer('dartbot');
    
    setPendingThrow(null);
    setDoublePromptInput('');
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
      }
      
      // Calculate stats and set winner
      const turns = userThrows.length;
      const totalDartsThisLeg = Math.max(0, turns - 1) * 3 + (Number.isNaN(darts) ? 0 : darts);
      if (userBestLeg === 0 || totalDartsThisLeg < userBestLeg) {
        setUserBestLeg(totalDartsThisLeg);
      }
      
      setWinner('user');
      setStatus('You win!');
    }
    setCheckoutDartsInput('');
    setCheckoutDoublesInput('');
    setShowCheckoutPrompt(false);
  };

  // Determine checkout button options based on score
  const getCheckoutOptions = (score: number) => {
    const isOddUnder40 = score % 2 !== 0 && score < 40;
    const isEvenBetween2And40 = score % 2 === 0 && score >= 2 && score <= 40;
    const specialPromptScores = [100, 101, 104, 107, 110];
    const isSpecialPrompt = specialPromptScores.includes(score);

    return {
      // For 100,101,104,107,110 and odd < 40: allow 2 or 3 darts to checkout
      dartsOptions: (isOddUnder40 || isSpecialPrompt) ? ['2', '3'] : ['1', '2', '3'],
      // For even 2-40, odd < 40, and special prompts: allow 1 or 2 darts at double
      doublesOptions: (isOddUnder40 || isEvenBetween2And40 || isSpecialPrompt) ? ['1', '2'] : ['0', '1', '2', '3'],
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
      };
    }

    const turns = userThrows.length;
    const dartsInLeg = userCheckoutDarts
      ? Math.max(0, turns - 1) * 3 + userCheckoutDarts
      : turns * 3;

    // 3DA is total score divided by actual darts thrown, normalized to 3-dart average
    const allTotal = userThrows.reduce((a, b) => a + b, 0);
    const threeDartAvg = dartsInLeg > 0 ? ((allTotal / dartsInLeg) * 3).toFixed(2) : 0;
    
    // 9DA is first 3 turns only (first 3 throws)
    const first3 = userThrows.slice(0, 3);
    const first3Total = first3.reduce((a, b) => a + b, 0);
    const first9Avg = first3.length === 3 ? ((first3Total / 9) * 3).toFixed(2) : 0;

    const checkoutAttempts = doubleAttempts;
    const checkoutSuccess = userCheckoutDoubles && userCheckoutDoubles > 0 ? 1 : 0;
    const checkoutRate = checkoutAttempts > 0 ? ((checkoutSuccess / checkoutAttempts) * 100).toFixed(2) : 0;
    
    return {
      threeDartAvg: parseFloat(threeDartAvg as string) || 0,
      first9Avg: parseFloat(first9Avg as string) || 0,
      checkoutRate,
      checkoutAttempts,
      checkoutSuccess,
      lastScore: userThrows[userThrows.length - 1] || 0,
      dartsThrown: dartsInLeg,
    };
  }, [userThrows, userCheckoutDarts, userCheckoutDoubles, doubleAttempts]);

  const generateBotThrow = (): number => {
    // Simple model: target mean increases with level, some randomness; try to finish if possible
    const botCurrent = botScore;
    const needsDouble = outRule === 'double';

    // Try to finish if feasible
    if (botCurrent <= 170) {
      if (!needsDouble || botCurrent % 2 === 0) {
        return botCurrent; // attempt checkout
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
      applyThrow('dartbot', botThrow);
      setBotThinking(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [currentPlayer, winner]);

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
        {/* Scoreboard */}
        <View style={styles.scoreRow}>
          <View style={[styles.scoreCard, { backgroundColor: theme.colors.surfaceVariant, borderColor: currentPlayer === 'user' ? theme.colors.primary : theme.colors.outline }]}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              You
            </Text>
            <Text variant="headlineLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              {userScore}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              3 Dart Avg: {userStats.threeDartAvg}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              First 9 Dart Avg: {userStats.first9Avg}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Checkout Rate: {userStats.checkoutRate}% ({userStats.checkoutSuccess}/{userStats.checkoutAttempts || 0})
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Last Turn: {userStats.lastScore}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Best Leg: {userBestLeg}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Darts Thrown: {userStats.dartsThrown}
            </Text>
          </View>
          <View style={[styles.scoreCard, { backgroundColor: theme.colors.surfaceVariant, borderColor: currentPlayer === 'dartbot' ? theme.colors.primary : theme.colors.outline }]}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Dartbot
            </Text>
            <Text variant="headlineLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              {botScore}
            </Text>
          </View>
        </View>

        <View style={[styles.display, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
            {winner ? 'Game Over' : currentPlayer === 'user' ? 'Your turn' : 'Dartbot thinking...'}
          </Text>
          <Text variant="displayLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            {winner ? (winner === 'user' ? 'You win!' : 'Dartbot wins!') : inputScore || '0'}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
            {status}
          </Text>
        </View>

        {/* Keypad */}
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
        </View>

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={handleSubmit}
          style={styles.submitButton}
          disabled={currentPlayer === 'dartbot' || !!winner}
        >
          Submit Score
        </Button>
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
        {winner && (
          <Button
            mode="outlined"
            onPress={() => router.replace('/screens/HomeScreen')}
            style={{ marginTop: 12 }}
          >
            New Game
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  scoreCard: {
    flex: 1,
    marginHorizontal: 6,
    padding: 12,
    borderRadius: 16,
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
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 80,
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
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  button: {
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 12,
  },
  buttonLabel: {
    fontSize: 24,
    lineHeight: 32,
  },
  submitButton: {
    marginVertical: 12,
    paddingVertical: 8,
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
});