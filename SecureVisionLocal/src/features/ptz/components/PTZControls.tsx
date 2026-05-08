import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, spacing } from '@app/theme';
import { Icon } from '@shared/components/Icon';
import { PTZPreset, PTZTour } from '@features/ptz/types';

interface PTZControlsProps {
  presets: PTZPreset[];
  tours: PTZTour[];
  activeTourId?: string;
  isTourRunning: boolean;
  onPresetSelect: (presetId: string) => void;
  onTourStart: (tourId: string) => void;
  onTourStop: () => void;
  onTourPause: () => void;
  onTourResume: () => void;
  onAddPreset: () => void;
  onAddTour: () => void;
}

export function PTZControls({
  presets,
  tours,
  activeTourId,
  isTourRunning,
  onPresetSelect,
  onTourStart,
  onTourStop,
  onTourPause,
  onTourResume,
  onAddPreset,
  onAddTour,
}: PTZControlsProps): React.ReactElement {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Presets</Text>
          <TouchableOpacity onPress={onAddPreset} style={styles.addButton}>
            <Icon name="plus-circle" size={20} color={colors.secondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.presetsGrid}>
          {presets.map((preset, index) => (
            <TouchableOpacity
              key={preset.id}
              style={styles.presetButton}
              onPress={() => onPresetSelect(preset.id)}
            >
              <Text style={styles.presetNumber}>{index + 1}</Text>
              <Text style={styles.presetName} numberOfLines={1}>
                {preset.name}
              </Text>
            </TouchableOpacity>
          ))}
          {presets.length === 0 && (
            <Text style={styles.emptyText}>Nenhum preset configurado</Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tours Automáticos</Text>
          <TouchableOpacity onPress={onAddTour} style={styles.addButton}>
            <Icon name="plus-circle" size={20} color={colors.secondary} />
          </TouchableOpacity>
        </View>

        {isTourRunning ? (
          <View style={styles.tourControls}>
            <View style={styles.tourStatus}>
              <View style={styles.tourIndicator}>
                <Icon name="record-circle" size={16} color={colors.recording} />
                <Text style={styles.tourStatusText}>Tour em execução</Text>
              </View>
            </View>
            <View style={styles.tourButtons}>
              <TouchableOpacity
                style={styles.tourControlButton}
                onPress={onTourPause}
              >
                <Icon name="pause-circle" size={28} color={colors.warning} />
                <Text style={styles.tourButtonText}>Pausar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tourControlButton, styles.stopButton]}
                onPress={onTourStop}
              >
                <Icon name="stop-circle" size={28} color={colors.error} />
                <Text style={[styles.tourButtonText, styles.stopText]}>Parar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.toursList}>
            {tours.map(tour => (
              <TouchableOpacity
                key={tour.id}
                style={styles.tourItem}
                onPress={() => onTourStart(tour.id)}
              >
                <View style={styles.tourInfo}>
                  <Icon name="play-circle" size={20} color={colors.secondary} />
                  <View style={styles.tourDetails}>
                    <Text style={styles.tourName}>{tour.name}</Text>
                    <Text style={styles.tourMeta}>
                      {tour.presets.length} posições • {tour.speed}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.tourStatusDot,
                    { backgroundColor: tour.enabled ? colors.success : colors.error },
                  ]}
                />
              </TouchableOpacity>
            ))}
            {tours.length === 0 && (
              <Text style={styles.emptyText}>Nenhum tour configurado</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zoom</Text>
        <View style={styles.zoomControls}>
          <TouchableOpacity style={styles.zoomButton}>
            <Icon name="plus-circle" size={32} color={colors.secondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomButton}>
            <Icon name="minus-circle" size={32} color={colors.secondary} />
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.screenPadding,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    padding: spacing.xs,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  presetButton: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xs,
  },
  presetNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.secondary,
  },
  presetName: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    width: '100%',
    paddingVertical: spacing.md,
  },
  toursList: {
    gap: spacing.sm,
  },
  tourItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
  },
  tourInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tourDetails: {
    marginLeft: spacing.sm,
  },
  tourName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  tourMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  tourStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tourControls: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
  },
  tourStatus: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tourIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tourStatusText: {
    fontSize: 14,
    color: colors.recording,
    marginLeft: spacing.xs,
    fontWeight: '600',
  },
  tourButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  tourControlButton: {
    alignItems: 'center',
    padding: spacing.sm,
  },
  stopButton: {
    marginLeft: spacing.lg,
  },
  tourButtonText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  stopText: {
    color: colors.error,
  },
  zoomControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  zoomButton: {
    padding: spacing.md,
  },
});