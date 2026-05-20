import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@app/theme';
import { Icon } from '@shared/components/Icon';
import { PTZJoystick } from '@features/ptz/components/PTZJoystick';
import { PTZControls } from '@features/ptz/components/PTZControls';
import { ptzService } from '@features/ptz/services/ptzService';
import { PTZPreset, PTZTour, PTZSpeed, PTZCommand } from '@features/ptz/types';
import type { RootStackScreenProps } from '@app/navigation/types';

type Props = RootStackScreenProps<'PTZControl'>;

const JOYSTICK_DIRECTION_MAP: Record<string, PTZCommand> = {
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP_LEFT: 'UP_LEFT',
  UP_RIGHT: 'UP_RIGHT',
  DOWN_LEFT: 'DOWN_LEFT',
  DOWN_RIGHT: 'DOWN_RIGHT',
};

function mapJoystickToPTZCommand(direction: string): PTZCommand | null {
  return JOYSTICK_DIRECTION_MAP[direction] || null;
}

export function PTZControlScreen({ route, navigation }: Props): React.ReactElement {
  const { cameraId } = route.params;
  const insets = useSafeAreaInsets();

  const [presets, setPresets] = useState<PTZPreset[]>([]);
  const [tours, setTours] = useState<PTZTour[]>([]);
  const [isTourRunning, setIsTourRunning] = useState(false);
  const [activeTourId, setActiveTourId] = useState<string | undefined>();
  const [tourProgress, setTourProgress] = useState(0);

  useEffect(() => {
    loadData();
  }, [cameraId]);

  const loadData = useCallback(async () => {
    const cameraPresets = ptzService.getPresets(cameraId);
    const cameraTours = ptzService.getTours(cameraId);

    if (cameraPresets.length === 0) {
      const mockPresets: PTZPreset[] = [
        { id: '1', cameraId, name: 'Entrada', presetNumber: 1, position: { pan: 0, tilt: 0, zoom: 1 }, createdAt: Date.now(), updatedAt: Date.now() },
        { id: '2', cameraId, name: 'Portão', presetNumber: 2, position: { pan: 45, tilt: 10, zoom: 3 }, createdAt: Date.now(), updatedAt: Date.now() },
        { id: '3', cameraId, name: 'Garagem', presetNumber: 3, position: { pan: -45, tilt: 5, zoom: 2 }, createdAt: Date.now(), updatedAt: Date.now() },
        { id: '4', cameraId, name: 'Fundos', presetNumber: 4, position: { pan: 90, tilt: 0, zoom: 5 }, createdAt: Date.now(), updatedAt: Date.now() },
      ];
      setPresets(mockPresets);
      ptzService.setPresets(cameraId, mockPresets);
    } else {
      setPresets(cameraPresets);
    }

    if (cameraTours.length === 0) {
      const mockTours: PTZTour[] = [
        {
          id: 'tour1',
          cameraId,
          name: 'Rota Principal',
          description: 'Ciclo completo de vigilância',
          presets: [
            { presetId: '1', duration: 15 },
            { presetId: '2', duration: 10 },
            { presetId: '3', duration: 15 },
            { presetId: '4', duration: 10 },
          ],
          speed: 'medium',
          transitionTime: 2,
          loop: true,
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'tour2',
          cameraId,
          name: 'Rota Rápida',
          description: 'Verificação rápida',
          presets: [
            { presetId: '1', duration: 5 },
            { presetId: '2', duration: 5 },
          ],
          speed: 'fast',
          transitionTime: 1,
          loop: true,
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      setTours(mockTours);
      ptzService.setTours(cameraId, mockTours);
    } else {
      setTours(cameraTours);
    }

    ptzService.addListener(handlePTZEvent);
    return () => {
      ptzService.removeListener(handlePTZEvent);
    };
  }, [cameraId]);

  const handlePTZEvent = useCallback((event: { type: string; data?: { tour?: { id?: string } } }) => {
    if (event.type === 'TOUR_START') {
      setIsTourRunning(true);
      setActiveTourId(event.data?.tour?.id ?? undefined);
    } else if (event.type === 'TOUR_STOP' || event.type === 'TOUR_COMPLETE') {
      setIsTourRunning(false);
      setActiveTourId(undefined);
      setTourProgress(0);
    } else if (event.type === 'PRESET_REACHED') {
      const progress = ptzService.getCurrentTourProgress(cameraId);
      if (progress !== null) {
        setTourProgress(progress);
      }
    }
  }, [cameraId]);

  const handleJoystickMove = useCallback(async (direction: string, speed: PTZSpeed) => {
    const command = mapJoystickToPTZCommand(direction);
    if (command) {
      await ptzService.sendCommand(cameraId, command, speed);
    }
  }, [cameraId]);

  const handleJoystickRelease = useCallback(async () => {
    await ptzService.sendCommand(cameraId, 'STOP');
  }, [cameraId]);

  const handlePresetSelect = useCallback(async (presetId: string) => {
    if (isTourRunning) {
      await ptzService.stopTour(cameraId);
      setIsTourRunning(false);
    }
    await ptzService.goToPreset(cameraId, presetId);
  }, [cameraId, isTourRunning]);

  const handleTourStart = useCallback(async (tourId: string) => {
    await ptzService.startTour(cameraId, tourId);
  }, [cameraId]);

  const handleTourStop = useCallback(async () => {
    await ptzService.stopTour(cameraId);
  }, [cameraId]);

  const handleTourPause = useCallback(async () => {
    await ptzService.pauseTour(cameraId);
  }, [cameraId]);

  const handleTourResume = useCallback(async () => {
    await ptzService.resumeTour(cameraId);
  }, [cameraId]);

  const handleAddPreset = useCallback(() => {
    Alert.alert('Adicionar Preset', 'Funcionalidade de adicionar preset');
  }, []);

  const handleAddTour = useCallback(() => {
    Alert.alert('Adicionar Tour', 'Funcionalidade de adicionar tour');
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Controle PTZ</Text>
        <View style={styles.headerRight} />
      </View>

      {isTourRunning && (
        <View style={styles.tourProgressBar}>
          <View
            style={[styles.tourProgressFill, { width: `${tourProgress}%` }]}
          />
          <Text style={styles.tourProgressText}>
            Tour: {Math.round(tourProgress)}%
          </Text>
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.preview}>
          <Text style={styles.previewPlaceholder}>📹</Text>
          <Text style={styles.previewText}>Visualização da Câmera</Text>
        </View>

        <View style={styles.joystickSection}>
          <Text style={styles.sectionLabel}>Controle Manual</Text>
          <View style={styles.joystickContainer}>
            <PTZJoystick
              size={180}
              onMove={handleJoystickMove}
              onRelease={handleJoystickRelease}
              disabled={isTourRunning}
            />
          </View>
          <Text style={styles.joystickHint}>
            Arraste o joystick para mover a câmera
          </Text>
        </View>

        <PTZControls
          presets={presets}
          tours={tours}
          activeTourId={activeTourId}
          isTourRunning={isTourRunning}
          onPresetSelect={handlePresetSelect}
          onTourStart={handleTourStart}
          onTourStop={handleTourStop}
          onTourPause={handleTourPause}
          onTourResume={handleTourResume}
          onAddPreset={handleAddPreset}
          onAddTour={handleAddTour}
        />
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerRight: {
    width: 40,
  },
  tourProgressBar: {
    height: 30,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.md,
    borderRadius: 15,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  tourProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.secondary,
    opacity: 0.3,
  },
  tourProgressText: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  preview: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.screenPadding,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPlaceholder: {
    fontSize: 60,
  },
  previewText: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  joystickSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  joystickContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});