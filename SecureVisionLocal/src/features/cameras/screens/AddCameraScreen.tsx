import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, fontSize, fontWeight } from '@app/theme';
import { Icon } from '@shared/components/Icon';
import { useCameraStore } from '../../../stores/cameraStore';
import type { Camera, CameraProtocol } from '@shared/types';

type CameraProtocolOption = {
  value: CameraProtocol;
  label: string;
};

const PROTOCOLS: CameraProtocolOption[] = [
  { value: 'rtsp', label: 'RTSP' },
  { value: 'onvif', label: 'ONVIF' },
  { value: 'http', label: 'HTTP' },
  { value: 'mjpeg', label: 'MJPEG' },
];

export function AddCameraScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const addCamera = useCameraStore((state) => state.addCamera);

  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('554');
  const [ipError, setIpError] = useState('');
  const [protocol, setProtocol] = useState<CameraProtocol>('rtsp');
  const [streamUrl, setStreamUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasPTZ, setHasPTZ] = useState(false);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('Erro', 'Nome da câmera é obrigatório');
      return;
    }
    if (!ip.trim()) {
      Alert.alert('Erro', 'Endereço IP é obrigatório');
      return;
    }
    const ipRegex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
    if (!ipRegex.test(ip.trim())) {
      setIpError('Formato de IP inválido');
      return;
    }
    setIpError('');
    if (!port.trim()) {
      Alert.alert('Erro', 'Porta é obrigatória');
      return;
    }

    const cameraData = {
      name: name.trim(),
      ip: ip.trim(),
      port: parseInt(port, 10) || 554,
      protocol,
      streamUrl: streamUrl.trim() || `rtsp://${ip.trim()}:${port}/stream`,
      username: username.trim() || undefined,
      password: password.trim() || undefined,
      hasPTZ,
      type: hasPTZ ? 'ptz' as const : 'bullet' as const,
      presetCount: 0,
    };

    addCamera(cameraData);
    Alert.alert('Sucesso', 'Câmera adicionada com sucesso', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }, [name, ip, port, protocol, streamUrl, username, password, hasPTZ, addCamera, navigation]);

  const isFormValid = name.trim() && ip.trim() && port.trim();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Adicionar Câmera</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações Básicas</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome da Câmera *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ex: Câmera frontal"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Protocolo</Text>
            <View style={styles.protocolContainer}>
              {PROTOCOLS.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[
                    styles.protocolButton,
                    protocol === p.value && styles.protocolButtonActive,
                  ]}
                  onPress={() => setProtocol(p.value)}
                >
                  <Text
                    style={[
                      styles.protocolText,
                      protocol === p.value && styles.protocolTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conexão</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 2 }]}>
              <Text style={styles.label}>Endereço IP *</Text>
              <TextInput
                style={[styles.input, ipError ? styles.inputError : null]}
                value={ip}
                onChangeText={(v) => { setIp(v); setIpError(''); }}
                placeholder="192.168.1.100"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
              {ipError ? <Text style={styles.errorText}>{ipError}</Text> : null}
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: spacing.md }]}>
              <Text style={styles.label}>Porta *</Text>
              <TextInput
                style={styles.input}
                value={port}
                onChangeText={setPort}
                placeholder="554"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Stream URL</Text>
            <TextInput
              style={styles.input}
              value={streamUrl}
              onChangeText={setStreamUrl}
              placeholder="rtsp://ip:port/stream (opcional)"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Autenticação</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Usuário</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="admin (opcional)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Senha</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="•••••••• (opcional)"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.ptzToggle}
            onPress={() => setHasPTZ(!hasPTZ)}
          >
            <View style={styles.ptzInfo}>
              <Icon name="video" size={24} color={colors.text} />
              <View style={styles.ptzText}>
                <Text style={styles.ptzLabel}>Câmera PTZ</Text>
                <Text style={styles.ptzDescription}>
                  Ativar controles de movimento
                </Text>
              </View>
            </View>
            <View style={[styles.toggle, hasPTZ && styles.toggleActive]}>
              <View style={[styles.toggleDot, hasPTZ && styles.toggleDotActive]} />
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, !isFormValid && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!isFormValid}
        >
          <Text style={styles.saveButtonText}>Adicionar Câmera</Text>
        </TouchableOpacity>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  placeholder: {
    width: 32,
  },
  form: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
  },
  protocolContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  protocolButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  protocolButtonActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  protocolText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  protocolTextActive: {
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  ptzToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
  },
  ptzInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ptzText: {
    marginLeft: spacing.md,
  },
  ptzLabel: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  ptzDescription: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    padding: 2,
  },
  toggleActive: {
    backgroundColor: colors.secondary,
  },
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.textMuted,
  },
  toggleDotActive: {
    backgroundColor: colors.text,
    marginLeft: 22,
  },
  saveButton: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  saveButtonDisabled: {
    backgroundColor: colors.border,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  saveButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
});

export default AddCameraScreen;