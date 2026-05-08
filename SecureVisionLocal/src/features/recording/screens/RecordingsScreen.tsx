import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, spacing } from '@app/theme';
import { Icon } from '@shared/components/Icon';

interface Recording {
  id: string;
  cameraName: string;
  date: string;
  duration: string;
  size: string;
  hasMotion: boolean;
}

export function RecordingsScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [recordings] = useState<Recording[]>([
    {
      id: '1',
      cameraName: 'Entrada Principal',
      date: '07/05/2026 14:30',
      duration: '02:15:30',
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
    {
      id: '4',
      cameraName: 'Entrada Principal',
      date: '06/05/2026 18:30',
      duration: '01:30:00',
      size: '800 MB',
      hasMotion: true,
    },
    {
      id: '5',
      cameraName: 'Jardim',
      date: '05/05/2026 14:00',
      duration: '03:45:12',
      size: '2.0 GB',
      hasMotion: false,
    },
  ]);

  const renderRecording = ({ item }: { item: Recording }) => (
    <TouchableOpacity
      style={[styles.recordingCard, { backgroundColor: colors.surface }]}
      onPress={() => {}}
    >
      <View style={[styles.thumbnail, { backgroundColor: colors.backgroundLight }]}>
        <Icon name="video" size={24} color={colors.textMuted} />
      </View>
      <View style={styles.recordingInfo}>
        <Text style={[styles.recordingName, { color: colors.text }]}>
          {item.cameraName}
        </Text>
        <Text style={[styles.recordingDate, { color: colors.textMuted }]}>
          {item.date}
        </Text>
        <View style={styles.recordingMeta}>
          <Text style={[styles.recordingDuration, { color: colors.textMuted }]}>
            {item.duration}
          </Text>
          <Text style={[styles.recordingSize, { color: colors.textMuted }]}>
            {item.size}
          </Text>
          {item.hasMotion && (
            <View style={[styles.motionBadge, { backgroundColor: colors.warning + '20' }]}>
              <Text style={[styles.motionText, { color: colors.warning }]}>Motion</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity style={[styles.playButton, { backgroundColor: colors.primary }]}>
        <Icon name="play" size={16} color={colors.text} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Gravações</Text>
      </View>
      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        renderItem={renderRecording}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="video" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.text }]}>
              Nenhuma gravação encontrada
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
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
  },
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  list: {
    padding: spacing.screenPadding,
  },
  recordingCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  thumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  recordingName: {
    fontSize: 16,
    fontWeight: '600',
  },
  recordingDate: {
    fontSize: 14,
    marginTop: 2,
  },
  recordingMeta: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  recordingDuration: {
    fontSize: 12,
    marginRight: spacing.sm,
  },
  recordingSize: {
    fontSize: 12,
    marginRight: spacing.sm,
  },
  motionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  motionText: {
    fontSize: 10,
    fontWeight: '600',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
});