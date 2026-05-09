import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, StatusBar, View, Text, ActivityIndicator } from 'react-native';
import { AppNavigator } from './app/navigation/AppNavigator';
import { ThemeProvider, useColors } from './app/theme';
import { useCameraStore } from './stores/cameraStore';
import { useRecordingStore } from './stores/recordingStore';

function AppContent(): React.ReactElement {
  const colors = useColors();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function initialize() {
      try {
        await useCameraStore.getState().initialize();
        useRecordingStore.getState().initialize();
        setIsReady(true);
      } catch (error) {
        console.error('[App] Initialization error:', error);
        setIsReady(true);
      }
    }
    initialize();
  }, []);

  if (!isReady) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>Carregando...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background}
        />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function App(): React.ReactElement {
  return (
    <ThemeProvider initialMode="dark">
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
});

export default App;