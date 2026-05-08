import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme';
import { MainTabParamList } from './types';
import { LiveScreen } from '../../features/cameras/screens/LiveScreen';
import { RecordingsScreen } from '../../features/recording/screens/RecordingsScreen';
import { AutomationScreen } from '../../features/automation/screens/AutomationScreen';
import { SettingsScreen } from '../../features/settings/screens/SettingsScreen';
import { Icon } from '../../shared/components/Icon';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs(): React.ReactElement {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Live"
        component={LiveScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="video" size={size} color={color} />
          ),
          tabBarLabel: 'Ao Vivo',
        }}
      />
      <Tab.Screen
        name="Recordings"
        component={RecordingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="record-circle" size={size} color={color} />
          ),
          tabBarLabel: 'Gravações',
        }}
      />
      <Tab.Screen
        name="Automation"
        component={AutomationScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="settings-outline" size={size} color={color} />
          ),
          tabBarLabel: 'Automação',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="cog-outline" size={size} color={color} />
          ),
          tabBarLabel: 'Config',
        }}
      />
    </Tab.Navigator>
  );
}