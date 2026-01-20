import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Modal } from 'react-native';
import { Text, Button, useTheme, TextInput } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';

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
  const [currentPlayer, setCurrentPlayer] = useState<Player>((params.firstPlayer as Player) || 'user');
  const [inputScore, setInputScore] = useState<string>('');
  const [status, setStatus] = useState<string>('Enter your score');
  const [winner, setWinner] = useState<Player | null>(null);
  const [botThinking, setBotThinking] = useState<boolean>(false);

  // Stats tracking
  const [userThrows, setUserThrows] = useState<number[]>([]);
  const [userBestLeg, setUserBestLeg] = useState<number>(0);
  const [userCheckoutDarts, setUserCheckoutDarts] = useState<number | null>(null);
  const [userCheckoutDoubles, setUserCheckoutDoubles] = useState<number | null>(null);
  const [doubleAttempts, setDoubleAttempts] = useState<number>(0);

  // Modals
  const [showDoublePrompt, setShowDoublePrompt] = useState(false);
  const [showCheckoutPrompt, setShowCheckoutPrompt] = useState(false);
  const [checkoutDartsInput, setCheckoutDartsInput] = useState<string>('');
  const [checkoutDoublesInput, setCheckoutDoublesInput] = useState<string>('');

  const handleNumberPress = (num: string) => {
    if (winner || currentPlayer === 'dartbot') return;
    // Limit to 3 digits (max score is 180)
    if (inputScore.length < 3) {
      setInputScore(inputScore + num);
    }
  };

  const handleClear = () => {
    if (winner || currentPlayer === 'dartbot') return;
    setInputScore('');
  };

  const handleBackspace = () => {
    if (winner || currentPlayer === 'dartbot') return;
    setInputScore(inputScore.slice(0, -1));
  };

  const isValidThrow = (val: number) => val >= 0 && val <= 180 && ![179, 178, 176, 175, 173, 172, 169, 166, 163].includes(val);

  const applyThrow = (player: Player, throwScore: number) => {
    const needsDouble = outRule === 'double';
    const scoreBefore = player === 'user' ? userScore : botScore;
    const noCheckout = [1, 159, 162, 163, 165, 166, 168, 169];

    if (!isValidThrow(throwScore)) {
      setStatus('Invalid score (0-180).');
      return;
    }

    // Bust if overshoot
    if (throwScore > scoreBefore) {
      setStatus(`${player === 'user' ? 'You' : 'Dartbot'} busts. No score.`);
      setCurrentPlayer(player === 'user' ? 'dartbot' : 'user');
      return;
    }

    // Track throw
    if (player === 'user') {
      setUserThrows([...userThrows, throwScore]);
    }

    // Finishing logic
    if (throwScore === scoreBefore) {
      if (noCheckout.includes(scoreBefore)) {
        setStatus(`No checkout from ${scoreBefore}. Turn passes.`);
        setCurrentPlayer(player === 'user' ? 'dartbot' : 'user');
        return;
      }
      if (needsDouble && throwScore % 2 !== 0) {
        setStatus(`${player === 'user' ? 'You' : 'Dartbot'} busts (need double).`);
        setCurrentPlayer(player === 'user' ? 'dartbot' : 'user');
        return;
      }
      if (player === 'user') {
        setUserScore(0);
        // Check out achieved - show checkout prompt
        setShowCheckoutPrompt(true);
      } else {
        setBotScore(0);
        setWinner(player);
        setStatus(`Dartbot wins!`);
      }
    } else {
      // Normal subtraction
      const newScore = scoreBefore - throwScore;
      if (player === 'user') {
        setUserScore(newScore);
        // Prompt whenever at 50 or below (and above 0)
        if (newScore > 0 && newScore <= 50) {
          setShowDoublePrompt(true);
        }
      } else {
        setBotScore(newScore);
      }
      setCurrentPlayer(player === 'user' ? 'dartbot' : 'user');
      setStatus(`${player === 'user' ? 'You scored' : 'Dartbot scored'} ${throwScore}. Next throw: ${player === 'user' ? 'Dartbot' : 'You'}.`);
    }
  };

  const handleSubmit = () => {
    if (winner || currentPlayer === 'dartbot') return;
    if (!inputScore) return;
    const val = parseInt(inputScore, 10);
    applyThrow('user', val);
    setInputScore('');
  };

  const handleDoublePromptClose = (dartsAtDouble: string) => {
    const attempts = parseInt(dartsAtDouble, 10);
    if (!Number.isNaN(attempts) && attempts > 0) {
      setDoubleAttempts((prev) => prev + attempts);
    }
    setShowDoublePrompt(false);
  };

  const handleCheckoutSubmit = () => {
    if (checkoutDartsInput && checkoutDoublesInput) {
      const darts = parseInt(checkoutDartsInput, 10);
      const doubles = parseInt(checkoutDoublesInput, 10);
      
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
          disabled={!inputScore || currentPlayer === 'dartbot' || !!winner}
        >
          Submit Score
        </Button>
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
      <Modal visible={showDoublePrompt} transparent={true} animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: `${theme.colors.background}99` }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <Text variant="headlineSmall" style={{ color: theme.colors.onBackground, marginBottom: 16 }}>
              How many darts were thrown at double?
            </Text>
            <View style={styles.buttonGrid}>
              {['0', '1', '2', '3'].map((num) => (
                <Button
                  key={num}
                  mode="contained"
                  onPress={() => handleDoublePromptClose(num)}
                  style={{ flex: 1, marginHorizontal: 4 }}
                >
                  {num}
                </Button>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Checkout Prompt Modal */}
      <Modal visible={showCheckoutPrompt} transparent={true} animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: `${theme.colors.background}99` }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <Text variant="headlineSmall" style={{ color: theme.colors.onBackground, marginBottom: 16 }}>
              How many darts to checkout?
            </Text>
            <View style={styles.buttonGrid}>
              {['1', '2', '3'].map((num) => (
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
              {['0', '1', '2', '3'].map((num) => (
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
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  display: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 80,
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
    padding: 20,
    borderRadius: 12,
    minWidth: '80%',
  },
  buttonGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
