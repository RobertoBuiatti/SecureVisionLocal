import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../app/theme';
import { useCameraStore } from '../../stores/cameraStore';
import type { MainTabScreenProps } from '../../app/navigation/types';

type Props = MainTabScreenProps<'Home'>;

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  const cameras = useCameraStore((state) => state.cameras);

  const onlineCameras = cameras.filter((c) => c.status === 'online').length;
  const recordingCameras = cameras.filter((c) => c.isRecording).length;
  const offlineCameras = cameras.filter((c) => c.status === 'offline').length;

  const stats = [
    {
      label: 'Câmeras Online',
      value: onlineCameras,
      color: colors.online,
      icon: '◎',
    },
    {
      label: 'Gravando',
      value: recordingCameras,
      color: colors.recording,
      icon: '●',
    },
    {
      label: 'Offline',
      value: offlineCameras,
      color: colors.offline,
      icon: '○',
    },
  ];

  return (
    <ScrollView
      style={[styles.container, isDarkMode && styles.containerDark]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md },
      ]}>
      <Text style={[styles.title, isDarkMode && styles.titleDark]}>
        SecureVision
      </Text>
      <Text style={[styles.subtitle, isDarkMode && styles.subtitleDark]}>
        Monitoramento Local
      </Text>

      <View style={styles.statsGrid}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={[styles.statCard, isDarkMode && styles.statCardDark]}>
            <Text style={[styles.statIcon, { color: stat.color }]}>
              {stat.icon}
            </Text>
            <Text style={[styles.statValue, isDarkMode && styles.statValueDark]}>
              {stat.value}
            </Text>
            <Text
              style={[styles.statLabel, isDarkMode && styles.statLabelDark]}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, isDarkMode && styles.sectionTitleDark]}>
        Acesso Rápido
      </Text>

      <View style={styles.quickAccess}>
        <TouchableOpacity
          style={[styles.quickButton, isDarkMode && styles.quickButtonDark]}
          onPress={() => navigation.navigate('Cameras')}>
          <Text style={styles.quickIcon}>📹</Text>
          <Text style={[styles.quickLabel, isDarkMode && styles.quickLabelDark]}>
            Todas as Câmeras
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickButton, isDarkMode && styles.quickButtonDark]}
          onPress={() => navigation.navigate('Recordings')}>
          <Text style={styles.quickIcon}>🎬</Text>
          <Text style={[styles.quickLabel, isDarkMode && styles.quickLabelDark]}>
            Gravações
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, isDarkMode && styles.sectionTitleDark]}>
        Câmeras Recentes
      </Text>

      {cameras.slice(0, 3).map((camera) => (
        <TouchableOpacity
          key={camera.id}
          style={[styles.cameraCard, isDarkMode && styles.cameraCardDark]}
          onPress={() =>
            navigation.navigate('CameraView', { cameraId: camera.id })
          }>
          <View style={styles.cameraInfo}>
            <Text
              style={[
                styles.cameraName,
                isDarkMode && styles.cameraNameDark,
              ]}>
              {camera.name}
            </Text>
            <Text
              style={[
                styles.cameraIp,
                isDarkMode && styles.cameraIpDark,
              ]}>
              {camera.ip}
            </Text>
          </View>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: colors[camera.status] },
            ]}
          />
        </TouchableOpacity>
      ))}
    </ScrollView>
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
  content: {
    padding: spacing.md,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  titleDark: {
    color: colors.textDark,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  subtitleDark: {
    color: colors.textSecondaryDark,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.xs,
    alignItems: 'center',
  },
  statCardDark: {
    backgroundColor: colors.surfaceDark,
  },
  statIcon: {
    fontSize: fontSize.xxl,
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  statValueDark: {
    color: colors.textDark,
  },
  statLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  statLabelDark: {
    color: colors.textSecondaryDark,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  sectionTitleDark: {
    color: colors.textDark,
  },
  quickAccess: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  quickButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.xs,
    alignItems: 'center',
  },
  quickButtonDark: {
    backgroundColor: colors.surfaceDark,
  },
  quickIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  quickLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  quickLabelDark: {
    color: colors.textDark,
  },
  cameraCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cameraCardDark: {
    backgroundColor: colors.surfaceDark,
  },
  cameraInfo: {
    flex: 1,
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
  },
  cameraIpDark: {
    color: colors.textSecondaryDark,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});

export default HomeScreen;