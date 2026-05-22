import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, spacing } from '@app/theme';
import type { Automation } from '@shared/types/automation';
import { Icon } from '@shared/components/Icon';
import { databaseService } from '@services/database';

const SEED_AUTOMATIONS: Automation[] = [
  {
    id: 'seed_1',
    name: 'Detecção na Entrada',
    description: 'Notificar quando detectar movimento na entrada',
    enabled: true,
    trigger: { type: 'motion_detected', cameraId: '1' },
    actions: [
      { type: 'send_notification' },
      { type: 'record_clip', params: { duration: 30 } },
    ],
    triggerCount: 156,
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'seed_2',
    name: 'Pessoa no Jardim',
    description: 'Enviar alerta ao detectar pessoa no jardim',
    enabled: true,
    trigger: { type: 'person_detected', cameraId: '2' },
    actions: [{ type: 'send_notification' }, { type: 'play_sound' }],
    triggerCount: 42,
    createdAt: Date.now() - 86400000 * 20,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'seed_3',
    name: 'Portão Aberto',
    description: 'Acionar sirene quando o portão abrir',
    enabled: false,
    trigger: { type: 'sensor_triggered', sensorId: 'door_1' },
    actions: [{ type: 'activate_siren' }, { type: 'send_notification' }],
    triggerCount: 8,
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000 * 3,
  },
];

function getTriggerIcon(triggerType: string): string {
  switch (triggerType) {
    case 'motion_detected': return 'video';
    case 'person_detected': return 'user';
    case 'vehicle_detected': return 'video';
    case 'schedule': return 'clock';
    case 'sensor_triggered': return 'warning';
    default: return 'bell';
  }
}

export function AutomationScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAutomations = useCallback(async () => {
    const result = await databaseService.getAllAutomations();
    let data = result.data || [];
    if (data.length === 0) {
      await databaseService.saveAutomations(SEED_AUTOMATIONS);
      data = SEED_AUTOMATIONS;
    }
    setAutomations(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAutomations();
  }, [loadAutomations]);

  const toggleAutomation = async (id: string) => {
    const target = automations.find(a => a.id === id);
    if (!target) return;
    const updated = await databaseService.updateAutomation(id, { enabled: !target.enabled });
    if (updated.success) {
      setAutomations(prev =>
        prev.map(a => a.id === id ? { ...a, enabled: !a.enabled, updatedAt: Date.now() } : a)
      );
    }
  };

  const activeCount = automations.filter(a => a.enabled).length;
  const inactiveCount = automations.filter(a => !a.enabled).length;
  const totalTriggers = automations.reduce((acc, a) => acc + a.triggerCount, 0);

  const renderAutomation = ({ item }: { item: Automation }) => (
    <View style={[styles.automationCard, { backgroundColor: colors.surface }]}>
      <View style={styles.automationHeader}>
        <View style={[styles.triggerIcon, { backgroundColor: colors.backgroundLight }]}>
          <Icon name={getTriggerIcon(item.trigger.type)} size={20} color={colors.secondary} />
        </View>
        <View style={styles.automationInfo}>
          <Text style={[styles.automationName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.automationDescription, { color: colors.textMuted }]}>{item.description}</Text>
        </View>
        <Switch
          value={item.enabled}
          onValueChange={() => toggleAutomation(item.id)}
          trackColor={{ false: colors.border, true: colors.secondary }}
          thumbColor={colors.text}
        />
      </View>
      <View style={[styles.automationFooter, { borderTopColor: colors.border }]}>
        <Text style={[styles.triggerCount, { color: colors.textMuted }]}>
          Disparado {item.triggerCount} vezes
        </Text>
        <TouchableOpacity style={styles.editButton}>
          <Icon name="edit" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Automação</Text>
        <TouchableOpacity style={styles.addButton}>
          <Icon name="plus-circle" size={28} color={colors.secondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <View style={[styles.stats, { backgroundColor: colors.surface }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.secondary }]}>{activeCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Ativas</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.secondary }]}>{inactiveCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Inativas</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.secondary }]}>{totalTriggers}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Disparos</Text>
            </View>
          </View>

          <FlatList
            data={automations}
            keyExtractor={item => item.id}
            renderItem={renderAutomation}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  addButton: { padding: 4 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold' },
  statLabel: { fontSize: 12, marginTop: 4 },
  list: { padding: 16 },
  automationCard: { borderRadius: 12, padding: 16, marginBottom: 16 },
  automationHeader: { flexDirection: 'row', alignItems: 'center' },
  triggerIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  automationInfo: { flex: 1 },
  automationName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  automationDescription: { fontSize: 12 },
  automationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  triggerCount: { fontSize: 12 },
  editButton: { padding: 4 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
