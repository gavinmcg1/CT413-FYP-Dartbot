import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function CoinFlipScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<'user' | 'dartbot' | null>(null);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const flipCoin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsFlipping(true);
    setResult(null);

    // Reset animation
    rotateAnim.setValue(0);

    // Randomly determine winner
    const winner = Math.random() < 0.5 ? 'user' : 'dartbot';

    // Create flip animation sequence
    Animated.timing(rotateAnim, {
      toValue: 10, // 10 full rotations
      duration: 2000,
      useNativeDriver: true,
    }).start(() => {
      // After animation completes, show result
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsFlipping(false);
      setResult(winner);
    });
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    inputRange: [0, 10],
    outputRange: ['0deg', '3600deg'],
    extrapolate: 'clamp',
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
                  { perspective: 900 },
                  { rotateY: spin },
                ],
              },
            ]}
          >
            <View style={styles.face}>
              <Text variant="displayMedium" style={{ color: theme.colors.onPrimary, fontWeight: 'bold' }}>
                {isFlipping ? '?' : result === 'user' ? 'YOU' : result === 'dartbot' ? 'BOT' : '?'}
              </Text>
            </View>
            <View style={[styles.face, styles.backFace]}>
              <Text variant="displayMedium" style={{ color: theme.colors.onPrimary, fontWeight: 'bold' }}>
                {isFlipping ? '?' : result === 'user' ? 'YOU' : result === 'dartbot' ? 'BOT' : '?'}
              </Text>
            </View>
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
    height: 240,
    overflow: 'visible',
  },
  coin: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  backFace: {
    transform: [{ rotateY: '180deg' }],
  },
  resultContainer: {
    marginTop: 20,
    marginBottom: 20,
  },
  buttonContainer: {
    marginTop: 20,
  },
});
