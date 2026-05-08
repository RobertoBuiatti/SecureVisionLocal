export type TriggerType =
  | 'motion_detected'
  | 'person_detected'
  | 'vehicle_detected'
  | 'animal_detected'
  | 'sound_detected'
  | 'schedule'
  | 'sensor_triggered'
  | 'manual';

export type AutomationAction =
  | 'send_notification'
  | 'play_sound'
  | 'record_clip'
  | 'activate_siren'
  | 'turn_on_light'
  | 'turn_off_light'
  | 'lock_door'
  | 'unlock_door'
  | 'execute_script'
  | 'send_email'
  | 'send_sms';

export interface AutomationTrigger {
  type: TriggerType;
  cameraId?: string;
  zoneId?: string;
  sensorId?: string;
  schedule?: AutomationSchedule;
}

export interface AutomationSchedule {
  enabled: boolean;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
}

export interface AutomationActionConfig {
  type: AutomationAction;
  params?: Record<string, unknown>;
}

export interface Automation {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationActionConfig[];
  lastTriggered?: number;
  triggerCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationHistory {
  id: string;
  automationId: string;
  triggerTime: number;
  triggerSource: string;
  actionsExecuted: number;
  success: boolean;
  error?: string;
}

export interface IoTDevice {
  id: string;
  name: string;
  type: 'sensor' | 'switch' | 'lock' | 'camera' | 'light';
  protocol: 'zigbee' | 'zwave' | 'wifi' | 'bluetooth';
  status: 'online' | 'offline';
  state: Record<string, unknown>;
  lastSeen: number;
}

export interface IoTSensor extends IoTDevice {
  type: 'sensor';
  sensorType: 'door' | 'window' | 'motion' | 'temperature' | 'humidity' | 'smoke' | 'glass';
  triggered: boolean;
  triggerTime?: number;
}