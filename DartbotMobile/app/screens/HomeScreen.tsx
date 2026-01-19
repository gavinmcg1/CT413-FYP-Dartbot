import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';

const API_BASE_URL = 'http://192.168.1.100:5000/api';

export default function HomeScreen() {
  const router = useRouter();

  const handleStartGame = () => {
    router.push('/screens/GameModesScreen');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dartbot</Text>
        <Text style={styles.subtitle}>An AI Bot you can play against across different darts games</Text>
      </View>
      <View style={styles.inputSection}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleStartGame}
        >
          <Text style={styles.buttonText}>Start Game</Text>
        </TouchableOpacity>
      </View>
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
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 20,
    color: '#ccc',
    marginTop: 5,
  },
  inputSection: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  }
});
