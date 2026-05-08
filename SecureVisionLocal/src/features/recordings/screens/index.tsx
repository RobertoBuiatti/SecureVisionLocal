import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../app/theme';
import type { MainTabScreenProps } from '../../app/navigation/types';

type Props = MainTabScreenProps<'Recordings'>;

interface Recording {
  id: string;
  cameraName: string;
  date: string;
  duration: string;
  size: string;
  hasMotion: boolean;
}

const mockRecordings: Recording[] = [
  {
    id: '1',
    cameraName: 'Entrada Principal',
    date: '07/05/2026 14:30',
    duration: '02:34:12',
    size: '1.2 GB',
    hasMotion: true,
  },
  {
    id: '2',
    cameraName: 'Garagem',
    date: '07/05/2026 12:15',
    duration: '00:45:23',
    size: '450 MB',
    hasMotion: false,
  },
  {
    id: '3',
    cameraName: 'Portão',
    date: '06/05/2026 22:00',
    duration: '08:00:00',
    size: '4.1 GB',
    hasMotion: true,
  },
];

export function RecordingsScreen({ }: Props) {
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';

  const renderRecording = ({ item }: { item: Recording }) => (
    <TouchableOpacity
      style={[styles.recordingCard, isDarkMode && styles.recordingCardDark]}
      onPress={() => {}}>
      <View style={styles.thumbnail}>
        <Text style={styles.thumbnailIcon}>🎬</Text>
      </View>
      <View style={styles.recordingInfo}>
        <Text style={[styles.recordingName, isDarkMode && styles.recordingNameDark]}>
          {item.cameraName}
        </Text>
        <Text style={[styles.recordingDate, isDarkMode && styles.recordingDateDark]}>
          {item.date}
        </Text>
        <View style={styles.recordingMeta}>
          <Text style={[styles.recordingDuration, isDarkMode && styles.recordingDurationDark]}>
            ⏱ {item.duration}
          </Text>
          <Text style={[styles.recordingSize, isDarkMode && styles.recordingSizeDark]}>
            💾 {item.size}
          </Text>
          {item.hasMotion && (
            <View style={[styles.motionBadge, isDarkMode && styles.motionBadgeDark]}>
              <Text style={styles.motionText}>Motion</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.playButton}>
        <Text style={styles.playIcon}>▶</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, isDarkMode && styles.containerDark]}>
      <FlatList
        data={mockRecordings}
        renderItem={renderRecording}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + spacing.md },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎬</Text>
            <Text style={[styles.emptyText, isDarkMode && styles.emptyTextDark]}>
              Nenhuma gravação encontrada
            </Text>
            <Text style={[styles.emptySubtext, isDarkMode && styles.emptySubtextDark]}>
              As gravações aparecerão aqui
            </Text>
          </View>
        }
      />
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
  listContent: {
    padding: spacing.md,
  },
  recordingCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  recordingCardDark: {
    backgroundColor: colors.surfaceDark,
  },
  thumbnail: {
    width: 80,
    height: 60,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailIcon: {
    fontSize: 24,
  },
  recordingInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  recordingName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  recordingNameDark: {
    color: colors.textDark,
  },
  recordingDate: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  recordingDateDark: {
    color: colors.textSecondaryDark,
  },
  recordingMeta: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  recordingDuration: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  recordingDurationDark: {
    color: colors.textSecondaryDark,
  },
  recordingSize: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  recordingSizeDark: {
    color: colors.textSecondaryDark,
  },
  motionBadge: {
    backgroundColor: colors.warning + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  motionBadgeDark: {
    backgroundColor: colors.warning + '30',
  },
  motionText: {
    fontSize: fontSize.xs,
    color: colors.warning,
    fontWeight: fontWeight.medium,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 16,
    color: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  emptyTextDark: {
    color: colors.textDark,
  },
  emptySubtext: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  emptySubtextDark: {
    color: colors.textSecondaryDark,
  },
});

export default RecordingsScreen;