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
import { colors, spacing } from '@app/theme';
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
      date: '07/05/2026 12:00',
      duration: '01:30:00',
      size: '850 MB',
      hasMotion: false,
    },
    {
      id: '3',
      cameraName: 'Fundos',
      date: '06/05/2026 22:15',
      duration: '03:45:00',
      size: '2.1 GB',
      hasMotion: true,
    },
  ]);

  const renderRecording = ({ item }: { item: Recording }) => (
    <TouchableOpacity style={styles.recordingCard} activeOpacity={0.8}>
      <View style={styles.thumbnail}>
        <Text style={styles.thumbnailIcon}>🎬</Text>
      </View>
      <View style={styles.recordingInfo}>
        <Text style={styles.cameraName}>{item.cameraName}</Text>
        <Text style={styles.dateTime}>{item.date}</Text>
        <View style={styles.metadata}>
          <View style={styles.metaItem}>
            <Icon name="clock" size={12} color={colors.textMuted} />
            <Text style={styles.metaText}>{item.duration}</Text>
          </View>
          <View style={styles.metaItem}>
            <Icon name="folder" size={12} color={colors.textMuted} />
            <Text style={styles.metaText}>{item.size}</Text>
          </View>
          {item.hasMotion && (
            <View style={styles.motionBadge}>
              <Icon name="warning" size={10} color={colors.warning} />
              <Text style={styles.motionText}>Movimento</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.playButton}>
        <Icon name="play-circle" size={32} color={colors.secondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gravações</Text>
        <TouchableOpacity style={styles.filterButton}>
          <Icon name="search" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.storageInfo}>
        <Text style={styles.storageText}>
          45.2 GB / 100 GB usado
        </Text>
        <View style={styles.storageBar}>
          <View style={[styles.storageFill, { width: '45.2%' }]} />
        </View>
      </View>

      <FlatList
        data={recordings}
        keyExtractor={item => item.id}
        renderItem={renderRecording}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  filterButton: {
    padding: spacing.xs,
  },
  storageInfo: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
  },
  storageText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  storageBar: {
    height: 6,
    backgroundColor: colors.backgroundLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  storageFill: {
    height: '100%',
    backgroundColor: colors.secondary,
    borderRadius: 3,
  },
  list: {
    padding: spacing.screenPadding,
  },
  recordingCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 80,
    height: 60,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailIcon: {
    fontSize: 24,
  },
  recordingInfo: {
    flex: 1,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  cameraName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  dateTime: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  metaText: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 4,
  },
  motionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  motionText: {
    fontSize: 10,
    color: colors.warning,
    marginLeft: 2,
  },
  playButton: {
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
});