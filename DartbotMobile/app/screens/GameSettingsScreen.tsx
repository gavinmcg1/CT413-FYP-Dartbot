import React, { useState } from 'react';
import { ScrollView, View, Platform } from 'react-native';
import { Button, Card, SegmentedButtons, Text, TextInput, useTheme, IconButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function GameSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [startingScore, setStartingScore] = useState<string>('501');
  const [customScore, setCustomScore] = useState<string>('');
  const [matchFormat, setMatchFormat] = useState<string>('bestOf');
  const [matchType, setMatchType] = useState<string>('legs');
  const [matchValue, setMatchValue] = useState<string>('3');
  const [inRule, setInRule] = useState<string>('straight');
  const [outRule, setOutRule] = useState<string>('double');

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let finalScore = parseInt(startingScore) || 501;
    if (startingScore === 'custom') {
      finalScore = Math.max(101, Math.min(9999, parseInt(customScore) || 501));
    }
    // Convert matchFormat to formatType with proper capitalization
    const formatType = matchFormat === 'bestOf' ? 'Best Of' : 'First To';
    // Convert matchType to legOrSet with proper capitalization
    const legOrSet = matchType === 'legs' ? 'Legs' : 'Sets';
    
    const settings = {
      startingScore: finalScore,
      formatType,
      legOrSet,
      formatNumber: parseInt(matchValue) || 3,
      inRule,
      outRule,
      level: 10, // default level, will be overridden from GameSetupScreen if needed
    };
    console.log('Game settings:', settings);
    // Navigate to coin flip screen
    router.push({
      pathname: '/screens/CoinFlipScreen',
      params: settings,
    });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ padding: 16, gap: 16 }}>
        <Card style={{
          borderRadius: 18,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
            },
            android: { elevation: 4 },
          }),
        }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>
              Starting Score
            </Text>
            <SegmentedButtons
              value={startingScore}
              onValueChange={setStartingScore}
              style={{ marginBottom: 8 }}
              buttons={[
                { value: '301', label: '301' },
                { value: '501', label: '501' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {startingScore === 'custom' && (
              <TextInput
                label="Custom Score (101-9999)"
                value={customScore}
                onChangeText={setCustomScore}
                keyboardType="number-pad"
                mode="outlined"
                style={{ marginTop: 12 }}
              />
            )}
          </Card.Content>
        </Card>

        <Card style={{
          borderRadius: 18,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
            },
            android: { elevation: 4 },
          }),
        }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>
              Match Format
            </Text>
            <SegmentedButtons
              value={matchFormat}
              onValueChange={setMatchFormat}
              style={{ marginBottom: 12 }}
              buttons={[
                { value: 'bestOf', label: 'Best Of' },
                { value: 'firstTo', label: 'First To' },
              ]}
            />

            <SegmentedButtons
              value={matchType}
              onValueChange={setMatchType}
              style={{ marginBottom: 12 }}
              buttons={[
                { value: 'legs', label: 'Legs' },
                { value: 'sets', label: 'Sets' },
              ]}
            />
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: theme.colors.surfaceVariant,
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 6,
            }}>
              <IconButton
                icon="chevron-down"
                size={26}
                onPress={() => {
                  const next = Math.max(1, (parseInt(matchValue, 10) || 1) - 1);
                  setMatchValue(String(next));
                }}
              />
              <Text variant="headlineMedium" style={{ fontWeight: '700' }}>
                {matchValue}
              </Text>
              <IconButton
                icon="chevron-up"
                size={26}
                onPress={() => {
                  const next = Math.min(99, (parseInt(matchValue, 10) || 1) + 1);
                  setMatchValue(String(next));
                }}
              />
            </View>
          </Card.Content>
        </Card>

        <Card style={{
          borderRadius: 18,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
            },
            android: { elevation: 4 },
          }),
        }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>
              In Rule
            </Text>
            <SegmentedButtons
              value={inRule}
              onValueChange={setInRule}
              style={{ marginBottom: 4 }}
              buttons={[
                { value: 'straight', label: 'Straight In' },
                { value: 'double', label: 'Double In' },
              ]}
            />
          </Card.Content>
        </Card>

        <Card style={{
          borderRadius: 18,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
            },
            android: { elevation: 4 },
          }),
        }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>
              Out Rule
            </Text>
            <SegmentedButtons
              value={outRule}
              onValueChange={setOutRule}
              style={{ marginBottom: 4 }}
              buttons={[
                { value: 'straight', label: 'Straight Out' },
                { value: 'double', label: 'Double Out' },
              ]}
            />
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleContinue}
          style={{
            marginBottom: 8,
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
          Continue
        </Button>

        <Button mode="text" onPress={() => router.back()}>
          Back
        </Button>
      </View>
    </ScrollView>
  );
}
