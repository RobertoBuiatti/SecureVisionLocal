import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../../app/theme';
import { useSettingsStore } from '../../../stores/settingsStore';
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

export function SettingsScreen({ }: Props) {
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);

  const isDark = isDarkMode || theme === 'dark';

  const handleToggle = (value: string) => {
    if (value === 'theme') {
      setTheme(theme === 'dark' ? 'light' : 'dark');
    }
  };

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md },
      ]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>
        Configurações
      </Text>

      {settingSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            {section.title}
          </Text>
          <View style={[styles.sectionContent, isDark && styles.sectionContentDark]}>
            {section.items.map((item, index) => (
              <TouchableOpacity
                key={item.label}
                style={[
                  styles.settingItem,
                  index < section.items.length - 1 && styles.settingItemBorder,
                ]}
                disabled={item.type === 'toggle'}
                onPress={() => {}}>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingLabel, isDark && styles.settingLabelDark]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.settingDescription, isDark && styles.settingDescriptionDark]}>
                    {item.description}
                  </Text>
                </View>
                {item.type === 'toggle' && (
                  <Switch
                    value={item.value === 'theme' ? isDark : false}
                    onValueChange={() => item.value && handleToggle(item.value)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                )}
                {item.type === 'navigation' && (
                  <Text style={styles.chevron}>›</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={[styles.footerText, isDark && styles.footerTextDark]}>
          SecureVision Local v0.0.1
        </Text>
        <Text style={[styles.footerSubtext, isDark && styles.footerSubtextDark]}>
          Monitoramento 100% offline
        </Text>
      </View>
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
    marginBottom: spacing.lg,
  },
  titleDark: {
    color: colors.textDark,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  sectionTitleDark: {
    color: colors.textSecondaryDark,
  },
  sectionContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  sectionContentDark: {
    backgroundColor: colors.surfaceDark,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    minHeight: 56,
  },
  settingItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  settingLabelDark: {
    color: colors.textDark,
  },
  settingDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  settingDescriptionDark: {
    color: colors.textSecondaryDark,
  },
  chevron: {
    fontSize: 24,
    color: colors.textSecondary,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  footerText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  footerTextDark: {
    color: colors.textSecondaryDark,
  },
  footerSubtext: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  footerSubtextDark: {
    color: colors.textSecondaryDark,
  },
});

export default SettingsScreen;