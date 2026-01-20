import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const paperTheme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;

  return (
    <PaperProvider theme={paperTheme}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="screens/HomeScreen" options={{ headerShown: false }} />
          <Stack.Screen name="screens/GameModesScreen" options={{ title: 'Game Modes' }} />
          <Stack.Screen name="screens/GameSetupScreen" options={{ title: 'Game Setup' }} />
          <Stack.Screen name="screens/GameSettingsScreen" options={{ title: 'Game Settings' }} />
          <Stack.Screen name="screens/CoinFlipScreen" options={{ title: 'Coin Flip' }} />
          <Stack.Screen name="screens/GameScreen" options={{ title: 'Game' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </PaperProvider>
  );
}
