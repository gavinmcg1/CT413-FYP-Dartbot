import React from 'react';
import { ScrollView, View, Platform } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

//const API_BASE_URL = 'http://192.168.1.100:5000/api';

const gameModes = [
  {
    id: 'standardGame',
    title: 'Standard Game',
    description: 'Classic X01 darts game - race to zero',
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

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();

  const handleSelectMode = (modeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/screens/GameSetupScreen', params: { modeId } });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ padding: 24, paddingTop: 40, marginBottom: 20 }}>
        <Text variant="displaySmall" style={{ fontWeight: 'bold', marginBottom: 8, color: theme.colors.primary }}>
          Dartbot
        </Text>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 24 }}>
          An AI Bot you can play against across different darts games
        </Text>
      </View>

      <View style={{ padding: 12 }}>
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginBottom: 10, paddingHorizontal: 4 }}>
          Select Game Mode
        </Text>
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
    </ScrollView>
  );
}
