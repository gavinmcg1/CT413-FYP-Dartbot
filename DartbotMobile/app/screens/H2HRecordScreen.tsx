import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Card, MD2Colors, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getH2HRecord, H2HRecord, resetH2HRecord } from '../../services/h2hRecord';
import { getPlayerName } from '../../services/playerProfile';

const EMPTY_RECORD: H2HRecord = {
  userWins: 0,
  botWins: 0,
  draws: 0,
  totalMatches: 0,
  updatedAt: null,
};

export default function H2HRecordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [record, setRecord] = useState<H2HRecord>(EMPTY_RECORD);
  const [playerName, setPlayerName] = useState('Player');
  const [loading, setLoading] = useState(true);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    const [data, name] = await Promise.all([
      getH2HRecord(),
      getPlayerName(),
    ]);
    setRecord(data);
    setPlayerName(name);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecord();
    }, [loadRecord])
  );

  const percentages = useMemo(() => {
    if (record.totalMatches === 0) {
      return { user: 0, bot: 0, draw: 0 };
    }

    return {
      user: (record.userWins / record.totalMatches) * 100,
      bot: (record.botWins / record.totalMatches) * 100,
      draw: (record.draws / record.totalMatches) * 100,
    };
  }, [record]);

  const barFlex = useMemo(() => {
    if (record.totalMatches === 0) {
      return { user: 1, draw: 1, bot: 1 };
    }

    return {
      user: percentages.user,
      draw: percentages.draw,
      bot: percentages.bot,
    };
  }, [record.totalMatches, percentages]);

  const userColor = MD2Colors.green500;
  const botColor = MD2Colors.red500;
  const drawColor = theme.colors.outline;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 16 }}>
      <Card style={{ borderRadius: 16, marginBottom: 12 }}>
        <Card.Content>
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginBottom: 6 }}>
            H2H Record
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Total matches against Dartbot: {record.totalMatches}
          </Text>
        </Card.Content>
      </Card>

      <Card style={{ borderRadius: 16, marginBottom: 12 }}>
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: '600', marginBottom: 10 }}>
            Win / Loss / Draw Slider
          </Text>

          {loading ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  height: 16,
                  borderRadius: 999,
                  overflow: 'hidden',
                  marginBottom: 12,
                  backgroundColor: theme.colors.surfaceVariant,
                }}
              >
                <View style={{ flex: barFlex.user, backgroundColor: userColor }} />
                <View style={{ flex: barFlex.draw, backgroundColor: drawColor }} />
                <View style={{ flex: barFlex.bot, backgroundColor: botColor }} />
              </View>

              <View style={{ gap: 8 }}>
                <Text variant="bodyMedium" style={{ color: userColor }}>
                  {playerName} Wins: {record.userWins} ({percentages.user.toFixed(1)}%)
                </Text>
                <Text variant="bodyMedium" style={{ color: botColor }}>
                  Bot Wins: {record.botWins} ({percentages.bot.toFixed(1)}%)
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Draws: {record.draws} ({percentages.draw.toFixed(1)}%)
                </Text>
              </View>
            </>
          )}
        </Card.Content>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button mode="outlined" style={{ flex: 1 }} onPress={() => router.back()}>
          Back
        </Button>
        <Button
          mode="contained"
          style={{ flex: 1 }}
          onPress={async () => {
            await resetH2HRecord();
            await loadRecord();
          }}
        >
          Reset
        </Button>
      </View>
    </ScrollView>
  );
}
