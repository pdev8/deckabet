import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GameScreen from './src/screens/GameScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { C } from './src/theme';

export default function App() {
  // No nav lib yet (two screens). GameScreen stays mounted so the in-progress
  // deal's state and timers are untouched; SettingsScreen overlays it.
  // Each screen applies its own safe-area insets (via SafeAreaProvider), so
  // the overlay's controls clear the notch / Dynamic Island.
  const [screen, setScreen] = useState<'game' | 'settings'>('game');

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <GameScreen onOpenSettings={() => setScreen('settings')} />
        {screen === 'settings' && (
          <View style={StyleSheet.absoluteFill}>
            <SettingsScreen onClose={() => setScreen('game')} />
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
});
