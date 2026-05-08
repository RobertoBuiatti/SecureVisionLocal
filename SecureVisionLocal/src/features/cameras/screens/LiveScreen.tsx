import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '@app/theme';
import { Camera } from '@shared/types';
import { Icon } from '@shared/components/Icon';
import { useCameraStore } from '../../../stores';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../app/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function LiveScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const cameras = useCameraStore((state) => state.cameras);

  const getStatusColor = (status: Camera['status']) => {
    switch (status) {
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

  const handleCameraPress = (cameraId: string) => {
    navigation.navigate('CameraDetail', { cameraId });
  };

  const renderCameraCard = ({ item }: { item: Camera }) => (
    <TouchableOpacity
      style={styles.cameraCard}
      activeOpacity={0.8}
      onPress={() => handleCameraPress(item.id)}
    >
      <View style={styles.cameraPreview}>
        <Text style={styles.previewPlaceholder}>📹</Text>
        {item.isRecording && (
          <View style={styles.recordingIndicator}>
            <Icon name="record-circle" size={12} color={colors.recording} />
            <Text style={styles.recordingText}>REC</Text>
          </View>
        )}
      </View>
      <View style={styles.cameraInfo}>
        <Text style={styles.cameraName}>{item.name}</Text>
        <View style={styles.cameraStatus}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          />
          <Text style={styles.statusText}>
            {item.status === 'online' ? 'Online' : 'Offline'}
          </Text>
          {item.hasPTZ && (
            <Icon name="video" size={12} color={colors.textMuted} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>SecureVision</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddCamera')}
        >
          <Icon name="plus-circle" size={28} color={colors.secondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {cameras.filter((c) => c.status === 'online').length}
          </Text>
          <Text style={styles.statLabel}>Online</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {cameras.filter((c) => c.isRecording).length}
          </Text>
          <Text style={styles.statLabel}>Gravando</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {cameras.filter((c) => c.status === 'offline').length}
          </Text>
          <Text style={styles.statLabel}>Offline</Text>
        </View>
      </View>

      <FlatList
        data={cameras}
        keyExtractor={(item) => item.id}
        renderItem={renderCameraCard}
        numColumns={2}
        contentContainerStyle={styles.grid}
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
  addButton: {
    padding: spacing.xs,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    marginHorizontal: spacing.screenPadding,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.secondary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  grid: {
    padding: spacing.screenPadding,
  },
  cameraCard: {
    flex: 1,
    margin: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cameraPreview: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPlaceholder: {
    fontSize: 40,
  },
  recordingIndicator: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recordingText: {
    fontSize: 10,
    color: colors.recording,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  cameraInfo: {
    padding: spacing.sm,
  },
  cameraName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  cameraStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },
});