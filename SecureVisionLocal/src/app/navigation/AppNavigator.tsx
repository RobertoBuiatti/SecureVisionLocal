import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabs } from './MainTabs';
import { PTZControlScreen } from '@features/ptz/screens/PTZControlScreen';
import { CameraDetailScreen } from '@features/cameras/screens/CameraDetailScreen';
import { CameraViewScreen } from '@features/cameras/screens/CameraViewScreen';
import { CameraSettingsScreen } from '@features/cameras/screens/CameraSettingsScreen';
import { AddCameraScreen } from '@features/cameras/screens/AddCameraScreen';
import { useColors } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator(): React.ReactElement {
  const colors = useColors();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="CameraView" component={CameraViewScreen} />
        <Stack.Screen name="CameraDetail" component={CameraDetailScreen} />
        <Stack.Screen name="CameraSettings" component={CameraSettingsScreen} />
        <Stack.Screen name="AddCamera" component={AddCameraScreen} />
        <Stack.Screen
          name="PTZControl"
          component={PTZControlScreen}
          options={{
            animation: 'slide_from_bottom',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}