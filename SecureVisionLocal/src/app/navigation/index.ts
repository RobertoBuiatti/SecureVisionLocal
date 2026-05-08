import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {colors} from '../theme';
import type {HomeScreen} from '../../features/home/screens';
import type {CamerasScreen} from '../../features/cameras/screens';
import type {CameraViewScreen} from '../../features/cameras/screens';
import type {RecordingsScreen} from '../../features/recordings/screens';
import type {SettingsScreen} from '../../features/settings/screens';

export type RootStackParamList = {
  Main: undefined;
  CameraView: { cameraId: string };
};

export type MainTabParamList = {
  Home: undefined;
  Cameras: undefined;
  Recordings: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Cameras"
        component={CamerasScreen}
        options={{
          title: 'Câmeras',
          tabBarLabel: 'Câmeras',
        }}
      />
      <Tab.Screen
        name="Recordings"
        component={RecordingsScreen}
        options={{
          title: 'Gravações',
          tabBarLabel: 'Gravações',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Configurações',
          tabBarLabel: 'Configurações',
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}>
      <Stack.Screen
        name="Main"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CameraView"
        component={CameraViewScreen}
        options={({ route }) => ({
          title: 'Visualização',
          headerBackTitle: 'Voltar',
        })}
      />
    </Stack.Navigator>
  );
}