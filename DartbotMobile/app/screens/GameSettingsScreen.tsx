import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, RadioButton, Text, TextInput, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';

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
    let finalScore = parseInt(startingScore) || 501;
    if (startingScore === 'custom') {
      finalScore = Math.max(101, Math.min(9999, parseInt(customScore) || 501));
    }
    const settings = {
      startingScore: finalScore,
      matchFormat,
      matchType,
      matchValue: parseInt(matchValue) || 3,
      inRule,
      outRule,
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
      <View style={{ padding: 16 }}>
        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>
              Starting Score
            </Text>
            <RadioButton.Group onValueChange={setStartingScore} value={startingScore}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <RadioButton value="301" />
                <Text>301</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <RadioButton value="501" />
                <Text>501</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <RadioButton value="custom" />
                <Text>Custom</Text>
              </View>
            </RadioButton.Group>
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

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>
              Match Format
            </Text>
            <RadioButton.Group onValueChange={setMatchFormat} value={matchFormat}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <RadioButton value="bestOf" />
                <Text>Best Of</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <RadioButton value="firstTo" />
                <Text>First To</Text>
              </View>
            </RadioButton.Group>

            <RadioButton.Group onValueChange={setMatchType} value={matchType}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <RadioButton value="legs" />
                <Text>Legs</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <RadioButton value="sets" />
                <Text>Sets</Text>
              </View>
            </RadioButton.Group>
            <TextInput
              label={`Number of ${matchType === 'legs' ? 'Legs' : 'Sets'}`}
              value={matchValue}
              onChangeText={setMatchValue}
              keyboardType="number-pad"
              mode="outlined"
            />
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>
              In Rule
            </Text>
            <RadioButton.Group onValueChange={setInRule} value={inRule}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <RadioButton value="straight" />
                <Text>Straight In</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <RadioButton value="double" />
                <Text>Double In</Text>
              </View>
            </RadioButton.Group>
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>
              Out Rule
            </Text>
            <RadioButton.Group onValueChange={setOutRule} value={outRule}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <RadioButton value="straight" />
                <Text>Straight Out</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <RadioButton value="double" />
                <Text>Double Out</Text>
              </View>
            </RadioButton.Group>
          </Card.Content>
        </Card>

        <Button mode="contained" onPress={handleContinue} style={{ marginBottom: 8 }}>
          Continue
        </Button>

        <Button mode="text" onPress={() => router.back()}>
          Back
        </Button>
      </View>
    </ScrollView>
  );
}
