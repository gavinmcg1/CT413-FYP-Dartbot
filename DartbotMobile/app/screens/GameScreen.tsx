import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function GameScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [score, setScore] = useState<string>('');

  const handleNumberPress = (num: string) => {
    // Limit to 3 digits (max score is 180)
    if (score.length < 3) {
      setScore(score + num);
    }
  };

  const handleClear = () => {
    setScore('');
  };

  const handleBackspace = () => {
    setScore(score.slice(0, -1));
  };

  const handleSubmit = () => {
    if (score) {
      console.log('Score entered:', score);
      // Handle score submission logic here
      setScore('');
    }
  };

  const renderButton = (label: string, onPress: () => void, style?: any) => (
    <Button
      mode="contained"
      onPress={onPress}
      style={[styles.button, style]}
      labelStyle={styles.buttonLabel}
    >
      {label}
    </Button>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        {/* Score Display */}
        <View style={[styles.display, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text variant="displayLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            {score || '0'}
          </Text>
        </View>

        {/* Keypad */}
        <View style={styles.keypad}>
          <View style={styles.row}>
            {renderButton('1', () => handleNumberPress('1'))}
            {renderButton('2', () => handleNumberPress('2'))}
            {renderButton('3', () => handleNumberPress('3'))}
          </View>
          <View style={styles.row}>
            {renderButton('4', () => handleNumberPress('4'))}
            {renderButton('5', () => handleNumberPress('5'))}
            {renderButton('6', () => handleNumberPress('6'))}
          </View>
          <View style={styles.row}>
            {renderButton('7', () => handleNumberPress('7'))}
            {renderButton('8', () => handleNumberPress('8'))}
            {renderButton('9', () => handleNumberPress('9'))}
          </View>
          <View style={styles.row}>
            {renderButton('Clear', handleClear, { backgroundColor: theme.colors.error })}
            {renderButton('0', () => handleNumberPress('0'))}
            {renderButton('⌫', handleBackspace, { backgroundColor: theme.colors.tertiary })}
          </View>
        </View>

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={handleSubmit}
          style={styles.submitButton}
          disabled={!score}
        >
          Submit Score
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  display: {
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
    minHeight: 100,
  },
  keypad: {
    flex: 1,
    justifyContent: 'center',
    maxHeight: 400,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  button: {
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 24,
    lineHeight: 32,
  },
  submitButton: {
    marginTop: 20,
    paddingVertical: 8,
  },
});
