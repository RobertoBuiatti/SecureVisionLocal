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
import { useColors, spacing } from '@app/theme';
import type { Camera } from '@shared/types';
import { Icon } from '@shared/components/Icon';
import { useCameraStore } from '../../../stores';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../app/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function LiveScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const colors = useColors();
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
      style={[styles.cameraCard, { backgroundColor: colors.surface }]}
      activeOpacity={0.8}
      onPress={() => handleCameraPress(item.id)}
    >
      <View style={[styles.cameraPreview, { backgroundColor: colors.backgroundLight }]}>
        <Text style={styles.previewPlaceholder}>📹</Text>
        {item.isRecording && (
          <View style={styles.recordingIndicator}>
            <Icon name="record-circle" size={12} color={colors.recording} />
            <Text style={[styles.recordingText, { color: colors.recording }]}>REC</Text>
          </View>
        )}
      </View>
      <View style={styles.cameraInfo}>
        <Text style={[styles.cameraName, { color: colors.text }]}>{item.name}</Text>
        <View style={styles.cameraStatus}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          />
          <Text style={[styles.statusText, { color: colors.textMuted }]}>
            {item.status === 'online' ? 'Online' : item.status === 'connecting' ? 'Conectando' : item.status === 'error' ? 'Erro' : 'Offline'}
          </Text>
          {item.hasPTZ && (
            <Icon name="video" size={12} color={colors.textMuted} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>SecureVision</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddCamera')}
        >
          <Icon name="plus-circle" size={28} color={colors.secondary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.stats, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.secondary }]}>
            {cameras.filter((c) => c.status === 'online').length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Online</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.secondary }]}>
            {cameras.filter((c) => c.isRecording).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Gravando</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.secondary }]}>
            {cameras.filter((c) => c.status === 'offline').length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Offline</Text>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  addButton: {
    padding: 4,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  grid: {
    padding: 16,
  },
  cameraCard: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cameraPreview: {
    aspectRatio: 16 / 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPlaceholder: {
    fontSize: 40,
  },
  recordingIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recordingText: {
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  cameraInfo: {
    padding: 8,
  },
  cameraName: {
    fontSize: 14,
    fontWeight: '600',
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
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    flex: 1,
  },
});