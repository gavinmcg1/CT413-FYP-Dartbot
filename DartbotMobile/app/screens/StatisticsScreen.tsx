import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { AllTimeUserStats, getAllTimeUserStats } from '../../services/allTimeStats';
import { getPlayerName } from '../../services/playerProfile';

type StatsTab = 'overview' | 'scores';

const EMPTY_STATS: AllTimeUserStats = {
  matchesCompleted: 0,
  totalLegsPlayed: 0,
  totalScore: 0,
  totalDartsThrown: 0,
  first9ScoreTotal: 0,
  first9DartsTotal: 0,
  checkoutAttempts: 0,
  checkoutSuccess: 0,
  highestFinish: 0,
  highestScore: 0,
  bestLegDarts: null,
  scoreRanges: {
    '180': 0,
    '171+': 0,
    '151+': 0,
    '131+': 0,
    '111+': 0,
    '91+': 0,
    '71+': 0,
    '51+': 0,
    '31+': 0,
  },
  updatedAt: null,
};

export default function StatisticsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [stats, setStats] = useState<AllTimeUserStats>(EMPTY_STATS);
  const [playerName, setPlayerName] = useState('Player');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StatsTab>('overview');

  const loadStats = useCallback(async () => {
    setLoading(true);
    const [data, name] = await Promise.all([getAllTimeUserStats(), getPlayerName()]);
    setStats(data);
    setPlayerName(name);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const threeDartAverage = useMemo(() => {
    if (stats.totalDartsThrown <= 0) return '0.00';
    return ((stats.totalScore / stats.totalDartsThrown) * 3).toFixed(2);
  }, [stats.totalScore, stats.totalDartsThrown]);

  const first9Average = useMemo(() => {
    if (stats.first9DartsTotal <= 0) return '0.00';
    return ((stats.first9ScoreTotal / stats.first9DartsTotal) * 3).toFixed(2);
  }, [stats.first9ScoreTotal, stats.first9DartsTotal]);

  const checkoutRate = useMemo(() => {
    if (stats.checkoutAttempts <= 0) return '0.00';
    return ((stats.checkoutSuccess / stats.checkoutAttempts) * 100).toFixed(2);
  }, [stats.checkoutAttempts, stats.checkoutSuccess]);

  const scoreRows = [
    { label: '180', value: stats.scoreRanges['180'] },
    { label: '171+', value: stats.scoreRanges['171+'] },
    { label: '151+', value: stats.scoreRanges['151+'] },
    { label: '131+', value: stats.scoreRanges['131+'] },
    { label: '111+', value: stats.scoreRanges['111+'] },
    { label: '91+', value: stats.scoreRanges['91+'] },
    { label: '71+', value: stats.scoreRanges['71+'] },
    { label: '51+', value: stats.scoreRanges['51+'] },
    { label: '31+', value: stats.scoreRanges['31+'] },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 16 }}>
      <Text variant="headlineMedium" style={{ textAlign: 'center', marginBottom: 14 }}>
        {playerName} - All Time Statistics
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <Button mode={tab === 'overview' ? 'contained' : 'outlined'} style={{ flex: 1 }} onPress={() => setTab('overview')}>
          Overview
        </Button>
        <Button mode={tab === 'scores' ? 'contained' : 'outlined'} style={{ flex: 1 }} onPress={() => setTab('scores')}>
          Scores
        </Button>
      </View>

      {loading ? (
        <Card style={{ borderRadius: 12, paddingVertical: 18 }}>
          <Card.Content>
            <ActivityIndicator />
          </Card.Content>
        </Card>
      ) : tab === 'overview' ? (
        <Card style={{ borderRadius: 12 }}>
          <Card.Content>
            <View style={{ borderWidth: 1, borderColor: '#444', borderRadius: 8, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#444' }}>
                <Text variant="titleSmall" style={{ flex: 2, fontWeight: 'bold', textAlign: 'left' }}>Metric</Text>
                <Text variant="titleSmall" style={{ flex: 1, fontWeight: 'bold', textAlign: 'right' }}>All Time</Text>
              </View>

              {[
                { metric: '3-dart average', value: threeDartAverage },
                { metric: 'First 9 avg.', value: first9Average },
                { metric: 'Checkout rate', value: `${checkoutRate}%` },
                { metric: 'Checkouts', value: `${stats.checkoutSuccess}/${stats.checkoutAttempts}` },
                { metric: 'Highest finish', value: stats.highestFinish > 0 ? String(stats.highestFinish) : '-' },
                { metric: 'Highest score', value: String(stats.highestScore) },
                { metric: 'Best leg', value: stats.bestLegDarts ? `${stats.bestLegDarts} darts` : '-' },
                { metric: 'Darts Thrown', value: String(stats.totalDartsThrown) },
                { metric: 'Total Legs Played', value: String(stats.totalLegsPlayed) },
              ].map((row, index) => (
                <View
                  key={row.metric}
                  style={{
                    flexDirection: 'row',
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    borderBottomWidth: index === 8 ? 0 : 1,
                    borderBottomColor: '#444',
                    backgroundColor: index % 2 === 1 ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                  }}
                >
                  <Text style={{ flex: 2, textAlign: 'left' }}>{row.metric}</Text>
                  <Text style={{ flex: 1, textAlign: 'right', fontWeight: 'bold' }}>{row.value}</Text>
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Card.Content>
            <View style={{ borderWidth: 1, borderColor: '#444', borderRadius: 8, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#444' }}>
                <Text variant="titleSmall" style={{ flex: 2, fontWeight: 'bold', textAlign: 'left' }}>Score Range</Text>
                <Text variant="titleSmall" style={{ flex: 1, fontWeight: 'bold', textAlign: 'right' }}>All Time</Text>
              </View>
              {scoreRows.map((row, index) => (
                <View
                  key={row.label}
                  style={{
                    flexDirection: 'row',
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    borderBottomWidth: index === scoreRows.length - 1 ? 0 : 1,
                    borderBottomColor: '#444',
                    backgroundColor: index % 2 === 1 ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                  }}
                >
                  <Text style={{ flex: 2, textAlign: 'left' }}>{row.label}</Text>
                  <Text style={{ flex: 1, textAlign: 'right', fontWeight: 'bold' }}>{row.value}</Text>
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}

      <Button mode="contained" style={{ marginTop: 16, borderRadius: 12 }} onPress={() => router.back()}>
        Back
      </Button>
    </ScrollView>
  );
}
