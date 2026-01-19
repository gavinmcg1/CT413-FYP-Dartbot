import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';

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

  const handleSelectMode = (modeId: string) => {
    // TODO: Navigate to game screen with selected mode
    console.log('Selected mode:', modeId);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Game Mode</Text>
        <Text style={styles.subtitle}>Choose how you want to play</Text>
      </View>

      <View style={styles.modesContainer}>
        {gameModes.map((mode) => (
          <TouchableOpacity
            key={mode.id}
            style={styles.modeCard}
            onPress={() => handleSelectMode(mode.id)}
          >
            <Text style={styles.modeTitle}>{mode.title}</Text>
            <Text style={styles.modeDescription}>{mode.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    paddingTop: 40,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    marginTop: 5,
  },
  modesContainer: {
    padding: 15,
  },
  modeCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  modeDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  backButton: {
    backgroundColor: '#6c757d',
    padding: 14,
    borderRadius: 8,
    margin: 15,
    marginTop: 5,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
