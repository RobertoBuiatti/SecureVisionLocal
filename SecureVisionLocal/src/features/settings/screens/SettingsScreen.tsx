import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, spacing, borderRadius, fontSize, fontWeight } from '../../../app/theme';
import { useSettingsStore } from '../../../stores';
import type { MainTabScreenProps } from '../../../app/navigation/types';

type Props = MainTabScreenProps<'Settings'>;

interface SettingItem {
  label: string;
  description?: string;
  type: 'toggle' | 'navigation' | 'button';
  value?: string;
}

const settingSections = [
  {
    title: 'Geral',
    items: [
      { label: 'Modo Escuro', description: 'Ativar tema escuro', type: 'toggle' as const, value: 'theme' },
      { label: 'Notificações', description: 'Receber alertas de movimento', type: 'toggle' as const, value: 'notifications' },
      { label: 'Auto-gravação', description: 'Gravar automaticamente ao detectar movimento', type: 'toggle' as const, value: 'autoRecord' },
    ],
  },
  {
    title: 'Armazenamento',
    items: [
      { label: 'Limite de Armazenamento', description: '500 GB', type: 'navigation' as const },
      { label: 'Política de Retenção', description: '30 dias', type: 'navigation' as const },
      { label: 'Qualidade de Gravação', description: 'Alta', type: 'navigation' as const },
    ],
  },
  {
    title: 'Rede',
    items: [
      { label: 'Porta do Servidor', description: '8080', type: 'navigation' as const },
      { label: 'Qualidade de Stream', description: 'Automático', type: 'navigation' as const },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { label: 'Sobre', description: 'v0.0.1', type: 'navigation' as const },
      { label: 'Backup', description: 'Fazer backup das configurações', type: 'button' as const },
      { label: 'Restaurar', description: 'Restaurar de um backup', type: 'button' as const },
    ],
  },
];

export function SettingsScreen({ }: Props): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const notifications = useSettingsStore((state) => state.notifications);
  const toggleNotifications = useSettingsStore((state) => state.toggleNotifications);
  const autoRecord = useSettingsStore((state) => state.autoRecord);
  const toggleAutoRecord = useSettingsStore((state) => state.toggleAutoRecord);

  const handleToggle = (value: string) => {
    switch (value) {
      case 'theme':
        setTheme(theme === 'dark' ? 'light' : 'dark');
        break;
      case 'notifications':
        toggleNotifications();
        break;
      case 'autoRecord':
        toggleAutoRecord();
        break;
    }
  };

  const getToggleValue = (value: string): boolean => {
    switch (value) {
      case 'theme': return theme === 'dark';
      case 'notifications': return notifications;
      case 'autoRecord': return autoRecord;
      default: return false;
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        Configurações
      </Text>

      {settingSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {section.title}
          </Text>
          <View style={[styles.sectionContent, { backgroundColor: colors.surface }]}>
            {section.items.map((item, index) => (
              <TouchableOpacity
                key={item.label}
                style={[
                  styles.settingItem,
                  index < section.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
                disabled={item.type === 'toggle'}
                onPress={() => {}}
              >
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.settingDescription, { color: colors.textMuted }]}>
                    {item.description}
                  </Text>
                </View>
                {item.type === 'toggle' && item.value && (
                  <Switch
                    value={getToggleValue(item.value)}
                    onValueChange={() => handleToggle(item.value)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                )}
                {item.type === 'navigation' && (
                  <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          SecureVision Local v0.0.1
        </Text>
        <Text style={[styles.footerSubtext, { color: colors.textMuted }]}>
          Monitoramento 100% offline
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sectionContent: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    minHeight: 56,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 14,
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '500',
  },
  footerSubtext: {
    fontSize: 14,
    marginTop: 4,
  },
});