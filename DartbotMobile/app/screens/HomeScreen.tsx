import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Platform } from 'react-native';
import { Button, Card, Text, TextInput, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getPlayerName, setPlayerName } from '../../services/playerProfile';

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
  const [playerName, setPlayerNameState] = useState('Player');
  const [nameInput, setNameInput] = useState('Player');
  const [isEditingName, setIsEditingName] = useState(true);
  const nameInputRef = useRef<any>(null);

  useEffect(() => {
    let isActive = true;
    getPlayerName().then((name) => {
      if (!isActive) return;
      setPlayerNameState(name);
      setNameInput(name);
      setIsEditingName(name === 'Player');
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditingName) return;
    const timer = setTimeout(() => {
      nameInputRef.current?.focus?.();
    }, 100);
    return () => clearTimeout(timer);
  }, [isEditingName]);

  const handleSaveName = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const saved = await setPlayerName(nameInput);
    setPlayerNameState(saved);
    setNameInput(saved);
    setIsEditingName(false);
  };

  const handleSelectMode = (modeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (modeId === 'record') {
      router.push('/screens/H2HRecordScreen');
      return;
    }
    if (modeId === 'stats') {
      router.push('/screens/StatisticsScreen');
      return;
    }
    router.push({ pathname: '/screens/GameSetupScreen', params: { modeId } });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ padding: 24, paddingTop: 40, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, paddingRight: 4 }}>
            <Text variant="displaySmall" style={{ fontWeight: 'bold', marginBottom: 8, color: theme.colors.primary }}>
              Dartbot
            </Text>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 24 }}>
              Welcome, {playerName}
            </Text>
          </View>

          <View style={{ width: 150 }}>
            {isEditingName ? (
              <>
                <TextInput
                  ref={nameInputRef}
                  mode="outlined"
                  dense
                  label="Name"
                  value={nameInput}
                  onChangeText={setNameInput}
                  maxLength={24}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <Button
                  compact
                  mode="contained"
                  style={{ marginTop: 6, borderRadius: 8 }}
                  onPress={handleSaveName}
                >
                  Save
                </Button>
              </>
            ) : (
              <Button
                compact
                mode="outlined"
                onPress={() => {
                  setNameInput(playerName);
                  setIsEditingName(true);
                }}
              >
                {playerName}
              </Button>
            )}
          </View>
        </View>
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