import React, { useState, ReactElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@app/theme';
import { Icon } from '@shared/components/Icon';

interface SettingItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  type: 'toggle' | 'navigation' | 'action';
  value?: boolean;
}

export function SettingsScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState(true);
  const [autoRecord, setAutoRecord] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  const [settings] = useState<SettingItem[]>([
    {
      id: '1',
      title: 'Câmeras',
      subtitle: '4 câmaras configuradas',
      icon: 'video',
      type: 'navigation',
    },
    {
      id: '2',
      title: 'Armazenamento',
      subtitle: '45.2 GB usado de 100 GB',
      icon: 'folder',
      type: 'navigation',
    },
    {
      id: '3',
      title: 'Notificações',
      subtitle: 'Alertas em tempo real',
      icon: 'bell',
      type: 'toggle',
      value: notifications,
    },
    {
      id: '4',
      title: 'Gravação Automática',
      subtitle: 'Iniciar ao detectar movimento',
      icon: 'record-circle',
      type: 'toggle',
      value: autoRecord,
    },
    {
      id: '5',
      title: 'Rede Local',
      subtitle: 'Configurações de conexão',
      icon: 'wifi',
      type: 'navigation',
    },
    {
      id: '6',
      title: 'Usuários',
      subtitle: 'Gerenciar acessos',
      icon: 'user-group',
      type: 'navigation',
    },
    {
      id: '7',
      title: 'Backup',
      subtitle: 'Exportar configurações',
      icon: 'download',
      type: 'action',
    },
    {
      id: '8',
      title: 'Sobre',
      subtitle: 'Versão 1.0.0',
      icon: 'info',
      type: 'navigation',
    },
  ]);

  const renderItem = (item: SettingItem) => {
    const content = (
      <View style={styles.settingItem}>
        <View style={styles.settingIcon}>
          <Icon name={item.icon} size={20} color={colors.secondary} />
        </View>
        <View style={styles.settingInfo}>
          <Text style={styles.settingTitle}>{item.title}</Text>
          {item.subtitle && (
            <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
          )}
        </View>
        {item.type === 'toggle' && (
          <Switch
            value={item.value}
            onValueChange={() => {
              if (item.id === '3') setNotifications(!notifications);
              if (item.id === '4') setAutoRecord(!autoRecord);
            }}
            trackColor={{ false: colors.border, true: colors.secondary }}
            thumbColor={colors.text}
          />
        )}
        {item.type === 'navigation' && (
          <Icon name="chevron-right" size={20} color={colors.textMuted} />
        )}
        {item.type === 'action' && (
          <Icon name="chevron-right" size={20} color={colors.textMuted} />
        )}
      </View>
    );

    if (item.type === 'toggle') {
      return (
        <TouchableOpacity key={item.id} activeOpacity={0.7}>
          {content}
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity key={item.id} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Configurações</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GERAL</Text>
          {settings.slice(0, 4).map(renderItem)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SISTEMA</Text>
          {settings.slice(4).map(renderItem)}
        </View>

        <View style={styles.systemInfo}>
          <Text style={styles.systemText}>SecureVision Local v1.0.0</Text>
          <Text style={styles.systemText}>100% Offline • Sem Nuvem</Text>
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
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  content: {
    padding: spacing.screenPadding,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  settingSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  systemInfo: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  systemText: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
});