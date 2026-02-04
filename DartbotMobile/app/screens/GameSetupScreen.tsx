import React, { useMemo, useState } from 'react';
import { View, Platform } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const modeTitles: Record<string, string> = {
  standardGame: 'Standard Game',
  cricket: 'Cricket',
  'around-the-clock': 'Around the Clock',
  shanghai: 'Shanghai',
  record: 'H2H Record',
  stats: 'Statistics',
};

export default function GameSetupScreen() {
  const { modeId } = useLocalSearchParams<{ modeId?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const [level, setLevel] = useState<number>(10);

  const levelAverages: Record<number, string> = {
    1: '20-25',
    2: '26-30',
    3: '31-35',
    4: '36-40',
    5: '41-45',
    6: '46-50',
    7: '51-55',
    8: '56-60',
    9: '61-65',
    10: '66-70',
    11: '71-75',
    12: '76-80',
    13: '81-85',
    14: '86-90',
    15: '91-95',
    16: '96-100',
    17: '101-110',
    18: '110+',
  };

  const averageRange = useMemo(() => {
    return levelAverages[level] ?? 'TBD';
  }, [level, levelAverages]);

  const title = useMemo(() => {
    if (modeId && modeTitles[modeId]) return modeTitles[modeId];
    return 'Standard Game';
  }, [modeId]);

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/screens/GameSettingsScreen',
      params: { level: level.toString() }
    });
  };

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: theme.colors.background }}>
      <Card style={{
        marginBottom: 16,
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
      }}>
        <Card.Content>
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            {title}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Play against Dartbot. Set the bot level (1-18).
          </Text>
        </Card.Content>
      </Card>

      <Card style={{
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
      }}>
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: '600', marginBottom: 8 }}>
            Dartbot Level: {level} ({averageRange} avg)
          </Text>
          <Slider
            value={level}
            onValueChange={setLevel}
            minimumValue={1}
            maximumValue={18}
            step={1}
          />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            1 = novice • 18 = expert
          </Text>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleStart}
        style={{
          marginTop: 20,
          borderRadius: 14,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
            },
          }),
        }}
        labelStyle={{ fontSize: 17, fontWeight: '600' }}
      >
        Next
      </Button>

      <Button mode="text" onPress={() => router.back()} style={{ marginTop: 8 }}>
        Back
      </Button>
    </View>
  );
}
