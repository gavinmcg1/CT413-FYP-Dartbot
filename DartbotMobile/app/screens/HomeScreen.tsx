import React from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';

const API_BASE_URL = 'http://192.168.1.100:5000/api';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();

  const handleStartGame = () => {
    router.push('/screens/GameModesScreen');
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

      <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
        <Button
          mode="contained"
          onPress={handleStartGame}
          style={{ paddingVertical: 8 }}
        >
          Start Game
        </Button>
      </View>
    </ScrollView>
  );
}
