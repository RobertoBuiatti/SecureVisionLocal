import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@app/theme';
import { Automation } from '@shared/types/automation';
import { Icon } from '@shared/components/Icon';

export function AutomationScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [automations, setAutomations] = useState<Automation[]>([
    {
      id: '1',
      name: 'Detecção na Entrada',
      description: 'Notificar quando detectar movimento na entrada',
      enabled: true,
      trigger: { type: 'motion_detected', cameraId: '1' },
      actions: [
        { type: 'send_notification' },
        { type: 'record_clip', params: { duration: 30 } },
      ],
      triggerCount: 156,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '2',
      name: 'Pessoa no Jardim',
      description: 'Enviar alerta ao detectar pessoa no jardim',
      enabled: true,
      trigger: { type: 'person_detected', cameraId: '2' },
      actions: [{ type: 'send_notification' }, { type: 'play_sound' }],
      triggerCount: 42,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '3',
      name: 'Portão Aberto',
      description: 'Acionar sirene quando o portão abrir',
      enabled: false,
      trigger: { type: 'sensor_triggered', sensorId: 'door_1' },
      actions: [{ type: 'activate_siren' }, { type: 'send_notification' }],
      triggerCount: 8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]);

  const toggleAutomation = (id: string) => {
    setAutomations(prev =>
      prev.map(auto =>
        auto.id === id ? { ...auto, enabled: !auto.enabled } : auto
      )
    );
  };

  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case 'motion_detected':
        return 'video';
      case 'person_detected':
        return 'user';
      case 'vehicle_detected':
        return 'video';
      case 'schedule':
        return 'clock';
      case 'sensor_triggered':
        return 'warning';
      default:
        return 'bell';
    }
  };

  const renderAutomation = ({ item }: { item: Automation }) => (
    <View style={styles.automationCard}>
      <View style={styles.automationHeader}>
        <View style={styles.triggerIcon}>
          <Icon
            name={getTriggerIcon(item.trigger.type)}
            size={20}
            color={colors.secondary}
          />
        </View>
        <View style={styles.automationInfo}>
          <Text style={styles.automationName}>{item.name}</Text>
          <Text style={styles.automationDescription}>{item.description}</Text>
        </View>
        <Switch
          value={item.enabled}
          onValueChange={() => toggleAutomation(item.id)}
          trackColor={{ false: colors.border, true: colors.secondary }}
          thumbColor={colors.text}
        />
      </View>
      <View style={styles.automationFooter}>
        <Text style={styles.triggerCount}>
          Disparado {item.triggerCount} vezes
        </Text>
        <TouchableOpacity style={styles.editButton}>
          <Icon name="edit" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Automação</Text>
        <TouchableOpacity style={styles.addButton}>
          <Icon name="plus-circle" size={28} color={colors.secondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {automations.filter(a => a.enabled).length}
          </Text>
          <Text style={styles.statLabel}>Ativas</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {automations.filter(a => !a.enabled).length}
          </Text>
          <Text style={styles.statLabel}>Inativas</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {automations.reduce((acc, a) => acc + a.triggerCount, 0)}
          </Text>
          <Text style={styles.statLabel}>Disparos</Text>
        </View>
      </View>

      <FlatList
        data={automations}
        keyExtractor={item => item.id}
        renderItem={renderAutomation}
        contentContainerStyle={styles.list}
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
  list: {
    padding: spacing.screenPadding,
  },
  automationCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  automationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  triggerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  automationInfo: {
    flex: 1,
  },
  automationName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  automationDescription: {
    fontSize: 12,
    color: colors.textMuted,
  },
  automationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  triggerCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  editButton: {
    padding: spacing.xs,
  },
});