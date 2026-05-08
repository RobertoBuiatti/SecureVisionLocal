import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, fontSize, fontWeight, getStatusColor, useTheme } from '../../../app/theme';
import { useCameraStore } from '../../../stores/cameraStore';
import type { RootStackScreenProps } from '../../../app/navigation/types';

type Props = RootStackScreenProps<'CameraView'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function CameraViewScreen({ route, navigation }: Props) {
  const { isDark } = useTheme();
  const { cameraId } = route.params;
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  
  const cameras = useCameraStore((state) => state.cameras);
  const camera = cameras.find((c) => c.id === cameraId);

  if (!camera) {
    return (
      <View style={[styles.container, isDarkMode && styles.containerDark]}>
        <Text style={[styles.errorText, isDarkMode && styles.errorTextDark]}>
          Câmera não encontrada
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDarkMode && styles.containerDark]}>
      <View
        style={[
          styles.videoContainer,
          { paddingTop: insets.top },
        ]}>
        <View style={styles.videoPlaceholder}>
          <Text style={styles.placeholderIcon}>📹</Text>
          <Text style={[styles.placeholderText, isDarkMode && styles.placeholderTextDark]}>
            Stream: {camera.streamUrl}
          </Text>
          <Text style={[styles.placeholderSubtext, isDarkMode && styles.placeholderSubtextDark]}>
            Conectando a {camera.ip}:{camera.port}...
          </Text>
        </View>

        <View style={styles.overlay}>
          <View style={[styles.statusBar, isDarkMode && styles.statusBarDark]}>
            <Text style={[styles.cameraName, isDarkMode && styles.cameraNameDark]}>
              {camera.name}
            </Text>
            <View style={styles.statusInfo}>
              <View
                style={[styles.statusDot, { backgroundColor: getStatusColor(camera.status, isDark) }]}
              />
              <Text style={[styles.statusText, isDarkMode && styles.statusTextDark]}>
                {camera.status.toUpperCase()}
              </Text>
              {camera.isRecording && (
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>REC</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.timestamp}>
            <Text style={[styles.timestampText, isDarkMode && styles.timestampTextDark]}>
              {new Date().toLocaleString('pt-BR')}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity style={[styles.controlButton, isDarkMode && styles.controlButtonDark]}>
          <Text style={styles.controlIcon}>⏸</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.controlButton, styles.recordButton, isDarkMode && styles.recordButtonDark]}>
          <Text style={styles.controlIcon}>⏺</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.controlButton, isDarkMode && styles.controlButtonDark]}>
          <Text style={styles.controlIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  containerDark: {
    backgroundColor: colors.backgroundDark,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  placeholderIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  placeholderText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  placeholderTextDark: {
    color: colors.textSecondaryDark,
  },
  placeholderSubtext: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  placeholderSubtextDark: {
    color: colors.textSecondaryDark,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.overlay,
  },
  statusBarDark: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  cameraName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: '#fff',
  },
  cameraNameDark: {
    color: '#fff',
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: '#fff',
  },
  statusTextDark: {
    color: '#fff',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.recording,
    marginRight: 4,
  },
  recordingText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.recording,
  },
  timestamp: {
    alignSelf: 'flex-end',
    padding: spacing.md,
  },
  timestampText: {
    fontSize: fontSize.sm,
    color: '#fff',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  timestampTextDark: {
    color: '#fff',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingTop: spacing.md,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonDark: {
    backgroundColor: colors.surfaceDark,
  },
  recordButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.recording,
  },
  recordButtonDark: {
    backgroundColor: colors.recording,
  },
  controlIcon: {
    fontSize: 24,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  errorTextDark: {
    color: colors.error,
  },
});

export default CameraViewScreen;