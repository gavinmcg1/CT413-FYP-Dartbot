import React from 'react';
import { ScrollView, View, Platform } from 'react-native';
import { Card, Button, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const gameModes = [
  {
    id: 'standardGame',
    title: 'Standard Game',
    description: 'Classic X01 darts game - race to zero',
  },
  {
    id: 'cricket',
    title: 'Cricket',
    description: 'Close out numbers 15-20 and bullseye',
  },
  {
    id: 'around-the-clock',
    title: 'Around the Clock',
    description: 'Hit each number from 1 to 20 in order',
  },
  {
    id: 'shanghai',
    title: 'Shanghai',
    description: 'Hit single, double, and triple of the same number',
  },
  {
    id: 'record',
    title: 'H2H Record',
    description: 'View your head-to-head record against the AI',
  },
  {
    id: 'stats',
    title: 'Statistics',
    description: 'View your game statistics and performance',
  },
];

export default function GameModesScreen() {
  const router = useRouter();
  const theme = useTheme();

  const handleSelectMode = (modeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/screens/GameSetupScreen', params: { modeId } });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ padding: 16, paddingTop: 20, marginBottom: 10 }}>
        <Text variant="headlineLarge" style={{ fontWeight: 'bold', marginBottom: 8 }}>
          Select Game Mode
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Choose how you want to play
        </Text>
      </View>

      <View style={{ padding: 12 }}>
        {gameModes.map((mode) => (
          <Card
            key={mode.id}
            style={{
              marginBottom: 12,
              borderRadius: 16,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                },
                android: { elevation: 3 },
              }),
            }}
            onPress={() => handleSelectMode(mode.id)}
          >
            <Card.Content>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 6 }}>
                {mode.title}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {mode.description}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      <Button
        mode="outlined"
        onPress={() => router.back()}
        style={{ margin: 16, marginTop: 8 }}
      >
        Back to Home
      </Button>
    </ScrollView>
  );
}
