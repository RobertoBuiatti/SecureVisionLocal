import { Platform } from 'react-native';

export interface NotificationPayload {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
  sound?: string;
}

class NotificationService {
  private static instance: NotificationService;
  private permissionGranted = false;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      return true;
    }

    if (Platform.OS === 'android') {
      return true;
    }

    return false;
  }

  public async checkPermission(): Promise<boolean> {
    return this.permissionGranted;
  }

  public async sendLocalNotification(
    payload: NotificationPayload
  ): Promise<void> {
    if (!this.permissionGranted) {
      await this.requestPermission();
    }

    console.log('Sending notification:', payload.title, payload.body);
  }

  public async scheduleNotification(
    payload: NotificationPayload,
    triggerTime: number
  ): Promise<string> {
    console.log(
      `Scheduled notification for ${new Date(triggerTime).toISOString()}`
    );
    return `notification_${payload.id}`;
  }

  public async cancelNotification(notificationId: string): Promise<void> {
    console.log(`Cancelled notification: ${notificationId}`);
  }

  public async cancelAllNotifications(): Promise<void> {
    console.log('Cancelled all notifications');
  }

  public async getDeliveredNotifications(): Promise<NotificationPayload[]> {
    return [];
  }

  public async setApplicationBadgeNumber(count: number): Promise<void> {
    console.log(`Setting badge number: ${count}`);
  }
}

export const notificationService = NotificationService.getInstance();