import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@app/theme';
import { Icon } from '@shared/components/Icon';
import { useCameraStore } from '../../../stores';
import type { RootStackScreenProps } from '../../../app/navigation/types';

const { width: screenWidth } = Dimensions.get('window');

type Props = RootStackScreenProps<'CameraDetail'>;

export function CameraDetailScreen({ route, navigation }: Props): React.ReactElement {
  const { cameraId } = route.params;
  const insets = useSafeAreaInsets();
  const camera = useCameraStore((state) =>
    state.cameras.find((c) => c.id === cameraId)
  );

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    if (!camera) {
      navigation.goBack();
    }
  }, [camera, navigation]);

  if (!camera) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Câmera não encontrada</Text>
      </View>
    );
  }

  const handlePTZPress = () => {
    navigation.navigate('PTZControl', { cameraId });
  };

  const handleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const getStatusColor = () => {
    switch (camera.status) {
      case 'online':
        return colors.live;
      case 'offline':
        return colors.offline;
      case 'error':
        return colors.error;
      case 'connecting':
        return colors.warning;
      default:
        return colors.offline;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: isFullscreen ? 0 : insets.top }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.background}
        hidden={isFullscreen}
      />

      {!isFullscreen && (
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Icon name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.cameraName}>{camera.name}</Text>
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: getStatusColor() },
                ]}
              />
              <Text style={styles.statusText}>
                {camera.status === 'online' ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('CameraSettings', { cameraId })}
            style={styles.settingsButton}
          >
            <Icon name="cog-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleFullscreen}
        style={[
          styles.videoContainer,
          isFullscreen && styles.videoContainerFullscreen,
        ]}
      >
        <View style={styles.videoPlaceholder}>
          <Icon name="video" size={80} color={colors.textMuted} />
          <Text style={styles.streamPlaceholder}>
            Stream: {camera.streamUrl}
          </Text>
          {camera.isRecording && (
            <View style={styles.recordingBadge}>
              <Icon name="record-circle" size={14} color={colors.recording} />
              <Text style={styles.recordingText}>GRAVANDO</Text>
            </View>
          )}
        </View>

        <View style={styles.overlay}>
          <Text style={styles.timestamp}>
            {new Date().toLocaleString('pt-BR')}
          </Text>
        </View>
      </TouchableOpacity>

      {!isFullscreen && (
        <View style={styles.controls}>
          {camera.hasPTZ && (
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handlePTZPress}
            >
              <Icon name="gamepad-variant" size={24} color={colors.secondary} />
              <Text style={styles.controlLabel}>PTZ</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {}}
          >
            <Icon name="camera-plus" size={24} color={colors.secondary} />
            <Text style={styles.controlLabel}>Capturar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {}}
          >
            <Icon name="microphone" size={24} color={colors.secondary} />
            <Text style={styles.controlLabel}>Áudio</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {}}
          >
            <Icon name="record" size={24} color={colors.error} />
            <Text style={styles.controlLabel}>
              {camera.isRecording ? 'Parar' : 'Gravar'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isFullscreen && (
        <TouchableOpacity
          style={styles.exitFullscreen}
          onPress={handleFullscreen}
        >
          <Icon name="fullscreen-exit" size={28} color={colors.text} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  cameraName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  settingsButton: {
    padding: spacing.xs,
  },
  videoContainer: {
    flex: 1,
    marginHorizontal: spacing.screenPadding,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  videoContainerFullscreen: {
    marginHorizontal: 0,
    marginVertical: 0,
    borderRadius: 0,
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
  },
  streamPlaceholder: {
    marginTop: spacing.md,
    fontSize: 12,
    color: colors.textMuted,
  },
  recordingBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
  },
  recordingText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.recording,
  },
  overlay: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timestamp: {
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.screenPadding,
  },
  controlButton: {
    alignItems: 'center',
    padding: spacing.md,
  },
  controlLabel: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.textMuted,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  exitFullscreen: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: colors.overlay,
    padding: spacing.sm,
    borderRadius: 8,
  },
});