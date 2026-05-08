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
import { useCameraStore } from '../../stores/cameraStore';
import type { MainTabScreenProps } from '../../app/navigation/types';
import type { Camera } from '@shared/types';

type Props = MainTabScreenProps<'Cameras'>;

export function CamerasScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  const cameras = useCameraStore((state) => state.cameras);

  const renderCamera = ({ item }: { item: Camera }) => (
    <TouchableOpacity
      style={[styles.cameraCard, isDarkMode && styles.cameraCardDark]}
      onPress={() => navigation.navigate('CameraView', { cameraId: item.id })}>
      <View style={styles.cameraThumbnail}>
        <Text style={styles.thumbnailPlaceholder}>📹</Text>
      </View>
      <View style={styles.cameraInfo}>
        <Text style={[styles.cameraName, isDarkMode && styles.cameraNameDark]}>
          {item.name}
        </Text>
        <Text style={[styles.cameraIp, isDarkMode && styles.cameraIpDark]}>
          {item.ip}:{item.port}
        </Text>
        <View style={styles.cameraMeta}>
          <Text style={[styles.cameraProtocol, isDarkMode && styles.cameraProtocolDark]}>
            {item.protocol.toUpperCase()}
          </Text>
          {item.hasPTZ && (
            <Text style={[styles.ptzBadge, isDarkMode && styles.ptzBadgeDark]}>
              PTZ
            </Text>
          )}
        </View>
      </View>
      <View style={styles.statusContainer}>
        <View
          style={[styles.statusDot, { backgroundColor: colors[item.status] }]}
        />
        <Text style={[styles.statusText, isDarkMode && styles.statusTextDark]}>
          {item.status === 'online' ? 'Online' : item.status === 'offline' ? 'Offline' : 'Erro'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, isDarkMode && styles.containerDark]}>
      <FlatList
        data={cameras}
        renderItem={renderCamera}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + spacing.md },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📹</Text>
            <Text style={[styles.emptyText, isDarkMode && styles.emptyTextDark]}>
              Nenhuma câmera configurada
            </Text>
            <Text style={[styles.emptySubtext, isDarkMode && styles.emptySubtextDark]}>
              Adicione uma câmera para começar
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
  cameraCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  cameraCardDark: {
    backgroundColor: colors.surfaceDark,
  },
  cameraThumbnail: {
    width: 80,
    height: 60,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholder: {
    fontSize: 24,
  },
  cameraInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  cameraName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  cameraNameDark: {
    color: colors.textDark,
  },
  cameraIp: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cameraIpDark: {
    color: colors.textSecondaryDark,
  },
  cameraMeta: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  cameraProtocol: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
  cameraProtocolDark: {
    color: colors.primaryLight,
  },
  ptzBadge: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: fontWeight.medium,
    marginLeft: spacing.sm,
    backgroundColor: colors.success + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  ptzBadgeDark: {
    color: colors.success,
    backgroundColor: colors.success + '30',
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  statusTextDark: {
    color: colors.textSecondaryDark,
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

export default CamerasScreen;