import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useColors, spacing } from '@app/theme';
import { Icon } from '@shared/components/Icon';
import { useRecordingStore } from '@stores/recordingStore';
import type { Recording } from '@shared/types';

const CAMERA_LABELS: Record<string, string> = {
  cam_1: 'Entrada Principal',
  cam_2: 'Garagem',
  cam_3: 'Portão',
  cam_4: 'Jardim',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

export function RecordingsScreen(): React.ReactElement {
  const colors = useColors();
  const recordings = useRecordingStore(state => state.recordings);
  const initialize = useRecordingStore(state => state.initialize);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initialize();
    setLoading(false);
  }, [initialize]);

  const renderRecording = ({ item }: { item: Recording }) => {
    const camName = item.cameraName || CAMERA_LABELS[item.cameraId] || item.cameraId;
    const dur = formatDuration(item.duration);
    const sizeStr = formatSize(item.fileSize);

    return (
      <TouchableOpacity
        style={[styles.recordingCard, { backgroundColor: colors.surface }]}
        activeOpacity={0.7}
      >
        <View style={[styles.thumbnail, { backgroundColor: colors.backgroundLight }]}>
          <Icon name="video" size={24} color={colors.textMuted} />
        </View>
        <View style={styles.recordingInfo}>
          <Text style={[styles.recordingName, { color: colors.text }]}>{camName}</Text>
          <Text style={[styles.recordingDate, { color: colors.textMuted }]}>
            {formatDate(item.startTime)}
          </Text>
          <View style={styles.recordingMeta}>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>{dur}</Text>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>{sizeStr}</Text>
            {(item as any).hasMotion && (
              <View style={[styles.motionBadge, { backgroundColor: colors.warning + '20' }]}>
                <Text style={[styles.motionText, { color: colors.warning }]}>Movimento</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity style={[styles.playButton, { backgroundColor: colors.primary }]}>
          <Icon name="play" size={16} color={colors.text} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Gravações</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
          {recordings.length} {recordings.length === 1 ? 'gravação' : 'gravações'}
        </Text>
      </View>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={item => item.id}
          renderItem={renderRecording}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="video" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.text }]}>Nenhuma gravação encontrada</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                As gravações aparecerão aqui automaticamente
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 14, marginTop: 2 },
  list: { padding: spacing.screenPadding },
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
  recordingInfo: { flex: 1, marginLeft: spacing.sm },
  recordingName: { fontSize: 16, fontWeight: '600' },
  recordingDate: { fontSize: 14, marginTop: 2 },
  recordingMeta: { flexDirection: 'row', marginTop: spacing.xs, alignItems: 'center', gap: spacing.sm },
  metaText: { fontSize: 12 },
  motionBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4 },
  motionText: { fontSize: 10, fontWeight: '600' },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyText: { fontSize: 18, fontWeight: '500', marginTop: spacing.md },
  emptySubtext: { fontSize: 14, marginTop: spacing.xs },
});
