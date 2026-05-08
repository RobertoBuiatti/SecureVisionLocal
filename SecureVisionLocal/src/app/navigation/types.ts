import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

export type RootStackParamList = {
  Main: undefined;
  CameraDetail: { cameraId: string };
  CameraSettings: { cameraId: string };
  PTZControl: { cameraId: string };
  RecordingPlayer: { recordingId: string };
  RecordingSettings: { cameraId: string };
  AutomationEditor: { automationId?: string };
  AddCamera: undefined;
  AddPreset: { cameraId: string };
  AddTour: { cameraId: string };
  Settings: undefined;
  About: undefined;
};

export type MainTabParamList = {
  Live: undefined;
  Recordings: undefined;
  Automation: undefined;
  Settings: undefined;
};

export type LiveStackParamList = {
  LiveGrid: undefined;
  CameraView: { cameraId: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}