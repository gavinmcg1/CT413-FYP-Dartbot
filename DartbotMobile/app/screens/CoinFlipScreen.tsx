import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function CoinFlipScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<'user' | 'dartbot' | null>(null);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const flipCoin = () => {
    setIsFlipping(true);
    setResult(null);

    // Reset animations
    rotateAnim.setValue(0);
    scaleAnim.setValue(1);

    // Randomly determine winner
    const winner = Math.random() < 0.5 ? 'user' : 'dartbot';

    // Create flip animation sequence
    Animated.parallel([
      Animated.sequence([
        // Flip multiple times
        Animated.timing(rotateAnim, {
          toValue: 10, // 10 full rotations
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        // Scale up during flip
        Animated.timing(scaleAnim, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        // Scale back down
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // After animation completes, show result
      setIsFlipping(false);
      setResult(winner);
    });
  };

  const handleContinue = () => {
    // Navigate to game screen
    console.log('Starting game with:', {
      ...params,
      firstPlayer: result,
    });
    router.push({
      pathname: '/screens/GameScreen',
      params: { ...params, firstPlayer: result },
    });
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <Text variant="headlineMedium" style={{ color: theme.colors.onBackground, marginBottom: 24, textAlign: 'center' }}>
          Who Throws First?
        </Text>

        <View style={styles.coinContainer}>
          <Animated.View
            style={[
              styles.coin,
              {
                backgroundColor: theme.colors.primary,
                transform: [
                  { rotateY: spin },
                  { scale: scaleAnim },
                ],
              },
            ]}
          >
            <Text variant="displayMedium" style={{ color: theme.colors.onPrimary, fontWeight: 'bold' }}>
              {isFlipping ? '?' : result === 'user' ? 'YOU' : result === 'dartbot' ? 'BOT' : '?'}
            </Text>
          </Animated.View>
        </View>

        {result && (
          <View style={styles.resultContainer}>
            <Text variant="headlineSmall" style={{ color: theme.colors.onBackground, textAlign: 'center', marginBottom: 8 }}>
              {result === 'user' ? 'You throw first!' : 'Dartbot throws first!'}
            </Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          {!isFlipping && !result && (
            <Button
              mode="contained"
              onPress={flipCoin}
              style={{ marginBottom: 12 }}
            >
              Flip Coin
            </Button>
          )}
          
          {result && (
            <Button
              mode="contained"
              onPress={handleContinue}
            >
              Start Game
            </Button>
          )}

          <Button
            mode="outlined"
            onPress={() => router.back()}
            style={{ marginTop: 12 }}
          >
            Back
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  coinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 40,
    height: 200,
  },
  coin: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  resultContainer: {
    marginTop: 20,
    marginBottom: 20,
  },
  buttonContainer: {
    marginTop: 20,
  },
});
