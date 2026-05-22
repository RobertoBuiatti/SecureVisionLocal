import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@app/theme';
import { Icon } from '@shared/components/Icon';
import { useCameraStore } from '../../../stores/cameraStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import type { RootStackScreenProps } from '@app/navigation/types';

type Props = RootStackScreenProps<'CameraSettings'>;

export function CameraSettingsScreen({ route, navigation }: Props): React.ReactElement {
  const { cameraId } = route.params;
  const insets = useSafeAreaInsets();
  const camera = useCameraStore((state) =>
    state.cameras.find((c) => c.id === cameraId)
  );
  const updateCamera = useCameraStore((state) => state.updateCamera);

  const {
    streamQuality,
    autoRecord,
    audioEnabled,
    setStreamQuality,
    toggleAutoRecord,
    toggleAudio,
  } = useSettingsStore();

  if (!camera) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Câmera não encontrada</Text>
      </View>
    );
  }

  const handleEditName = useCallback(() => {
    Alert.alert(
      'Editar Nome',
      'Digite o novo nome da câmera:',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salvar',
          onPress: () => {
            // Would use Alert.prompt on iOS
          },
        },
      ]
    );
  }, []);

  const handleRemoveCamera = useCallback(() => {
    Alert.alert(
      'Remover Câmera',
      `Tem certeza que deseja remover "${camera?.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            if (camera) {
              useCameraStore.getState().removeCamera(camera.id);
              navigation.navigate('Main');
            }
          },
        },
      ]
    );
  }, [camera, navigation]);

  const qualityOptions = [
    { key: 'low', label: 'Baixa' },
    { key: 'medium', label: 'Média' },
    { key: 'high', label: 'Alta' },
  ] as const;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configurações</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações da Câmera</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nome</Text>
            <TouchableOpacity onPress={handleEditName} style={styles.valueRow}>
              <Text style={styles.value}>{camera.name}</Text>
              <Icon name="pencil" size={14} color={colors.secondary} />
            </TouchableOpacity>
          </View>
          {([
            ['IP', camera.ip],
            ['Porta', String(camera.port)],
            ['Protocolo', camera.protocol.toUpperCase()],
            ['Tipo', camera.type],
          ] as const).map(([label, value], i) => (
            <View key={label} style={[styles.row, i === 3 && styles.rowLast]}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Qualidade do Stream</Text>
          {qualityOptions.map((opt, i) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.row, i === qualityOptions.length - 1 && styles.rowLast]}
              onPress={() => setStreamQuality(opt.key)}
            >
              <Text style={styles.label}>{opt.label}</Text>
              <View style={[
                styles.radio,
                streamQuality === opt.key && styles.radioSelected,
              ]} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gravação</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Gravação automática</Text>
            <Switch
              value={autoRecord}
              onValueChange={toggleAutoRecord}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor={autoRecord ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={styles.switchRowLast}>
            <Text style={styles.switchLabel}>Áudio</Text>
            <Switch
              value={audioEnabled}
              onValueChange={toggleAudio}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor={audioEnabled ? colors.primary : colors.textMuted}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stream URL</Text>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.urlText} numberOfLines={2}>{camera.streamUrl}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleRemoveCamera}
          >
            <Icon name="trash" size={20} color={colors.error} />
            <Text style={styles.deleteButtonText}>Remover Câmera</Text>
          </TouchableOpacity>
        </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.md,
    marginHorizontal: spacing.screenPadding,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 14,
    color: colors.textMuted,
  },
  value: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  switchRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
    marginRight: spacing.md,
  },
  urlText: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
    textAlign: 'right',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  deleteButtonText: {
    fontSize: 14,
    color: colors.error,
    fontWeight: '600',
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
