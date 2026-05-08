import { PTZPreset, PTZTour, PTZControlState, PTZSpeed, PTZTourRun, PTZCommand, DEFAULT_PTZ_LIMITS } from '../types';

export type PTZEventCallback = (event: PTZEvent) => void;

export interface PTZEvent {
  type: 'COMMAND' | 'PRESET_REACHED' | 'TOUR_START' | 'TOUR_STOP' | 'TOUR_COMPLETE' | 'TOUR_PAUSE' | 'TOUR_RESUME' | 'ERROR';
  cameraId: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

class PTZService {
  private static instance: PTZService;
  private presets: Map<string, PTZPreset[]> = new Map();
  private tours: Map<string, PTZTour[]> = new Map();
  private controlStates: Map<string, PTZControlState> = new Map();
  private listeners: Set<PTZEventCallback> = new Set();
  private tourIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  private constructor() {}

  public static getInstance(): PTZService {
    if (!PTZService.instance) {
      PTZService.instance = new PTZService();
    }
    return PTZService.instance;
  }

  public addListener(callback: PTZEventCallback): void {
    this.listeners.add(callback);
  }

  public removeListener(callback: PTZEventCallback): void {
    this.listeners.delete(callback);
  }

  private emitEvent(event: PTZEvent): void {
    this.listeners.forEach(callback => callback(event));
  }

  public setPresets(cameraId: string, presets: PTZPreset[]): void {
    this.presets.set(cameraId, presets);
  }

  public getPresets(cameraId: string): PTZPreset[] {
    return this.presets.get(cameraId) || [];
  }

  public addPreset(cameraId: string, preset: PTZPreset): void {
    const presets = this.getPresets(cameraId);
    presets.push(preset);
    this.presets.set(cameraId, presets);
    this.emitEvent({
      type: 'PRESET_REACHED',
      cameraId,
      data: { preset },
      timestamp: Date.now(),
    });
  }

  public updatePreset(cameraId: string, presetId: string, updates: Partial<PTZPreset>): void {
    const presets = this.getPresets(cameraId);
    const index = presets.findIndex(p => p.id === presetId);
    if (index !== -1) {
      presets[index] = { ...presets[index], ...updates, updatedAt: Date.now() };
      this.presets.set(cameraId, presets);
    }
  }

  public deletePreset(cameraId: string, presetId: string): void {
    const presets = this.getPresets(cameraId).filter(p => p.id !== presetId);
    this.presets.set(cameraId, presets);
  }

  public setTours(cameraId: string, tours: PTZTour[]): void {
    this.tours.set(cameraId, tours);
  }

  public getTours(cameraId: string): PTZTour[] {
    return this.tours.get(cameraId) || [];
  }

  public addTour(cameraId: string, tour: PTZTour): void {
    const tours = this.getTours(cameraId);
    tours.push(tour);
    this.tours.set(cameraId, tours);
  }

  public updateTour(cameraId: string, tourId: string, updates: Partial<PTZTour>): void {
    const tours = this.getTours(cameraId);
    const index = tours.findIndex(t => t.id === tourId);
    if (index !== -1) {
      tours[index] = { ...tours[index], ...updates, updatedAt: Date.now() };
      this.tours.set(cameraId, tours);
    }
  }

  public deleteTour(cameraId: string, tourId: string): void {
    const tours = this.getTours(cameraId).filter(t => t.id !== tourId);
    this.tours.set(cameraId, tours);
  }

  public getControlState(cameraId: string): PTZControlState {
    if (!this.controlStates.has(cameraId)) {
      this.controlStates.set(cameraId, {
        cameraId,
        operationMode: 'IDLE',
        isMoving: false,
        lastCommandTime: Date.now(),
      });
    }
    return this.controlStates.get(cameraId)!;
  }

  public async sendCommand(cameraId: string, command: PTZCommand, speed: PTZSpeed = 'medium'): Promise<void> {
    const state = this.getControlState(cameraId);
    state.isMoving = true;
    state.lastCommand = command;
    state.lastCommandTime = Date.now();
    state.operationMode = 'MANUAL';

    this.emitEvent({
      type: 'COMMAND',
      cameraId,
      data: { command, speed },
      timestamp: Date.now(),
    });

    console.log(`[PTZ] Sending command ${command} to camera ${cameraId} at speed ${speed}`);

    if (command === 'STOP') {
      state.isMoving = false;
    }
  }

  public async goToPreset(cameraId: string, presetId: string): Promise<void> {
    const presets = this.getPresets(cameraId);
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
      this.emitEvent({
        type: 'ERROR',
        cameraId,
        data: { error: 'Preset not found' },
        timestamp: Date.now(),
      });
      return;
    }

    const state = this.getControlState(cameraId);
    state.currentPreset = preset;
    state.operationMode = 'MANUAL';
    state.isMoving = true;

    console.log(`[PTZ] Going to preset ${preset.name} on camera ${cameraId}`);

    this.emitEvent({
      type: 'PRESET_REACHED',
      cameraId,
      data: { preset },
      timestamp: Date.now(),
    });

    setTimeout(() => {
      state.isMoving = false;
    }, 1000);
  }

  public async startTour(cameraId: string, tourId: string): Promise<void> {
    const tours = this.getTours(cameraId);
    const tour = tours.find(t => t.id === tourId);

    if (!tour || !tour.enabled) {
      this.emitEvent({
        type: 'ERROR',
        cameraId,
        data: { error: 'Tour not found or disabled' },
        timestamp: Date.now(),
      });
      return;
    }

    const state = this.getControlState(cameraId);
    state.operationMode = 'AUTO_TOUR';
    state.activeTourId = tourId;

    const tourRun: PTZTourRun = {
      tourId,
      currentPresetIndex: 0,
      startedAt: Date.now(),
      isPaused: false,
      isRunning: true,
    };
    state.tourRun = tourRun;

    this.emitEvent({
      type: 'TOUR_START',
      cameraId,
      data: { tour },
      timestamp: Date.now(),
    });

    console.log(`[PTZ] Starting tour ${tour.name} on camera ${cameraId}`);

    const runNextPreset = () => {
      if (!state.tourRun?.isRunning || state.tourRun.isPaused) {
        return;
      }

      const currentPreset = tour.presets[state.tourRun.currentPresetIndex];
      if (!currentPreset) {
        if (tour.loop) {
          state.tourRun.currentPresetIndex = 0;
          runNextPreset();
        } else {
          this.stopTour(cameraId);
          this.emitEvent({
            type: 'TOUR_COMPLETE',
            cameraId,
            data: { tour },
            timestamp: Date.now(),
          });
        }
        return;
      }

      const presets = this.getPresets(cameraId);
      const preset = presets.find(p => p.id === currentPreset.presetId);
      if (preset) {
        state.currentPreset = preset;
        this.emitEvent({
          type: 'PRESET_REACHED',
          cameraId,
          data: { preset, index: state.tourRun.currentPresetIndex },
          timestamp: Date.now(),
        });
      }

      state.tourRun.currentPresetIndex++;

      if (state.tourRun.isRunning && !state.tourRun.isPaused) {
        const intervalId = setTimeout(runNextPreset, currentPreset.duration * 1000);
        this.tourIntervals.set(`${cameraId}_${tourId}`, intervalId);
      }
    };

    runNextPreset();
  }

  public async stopTour(cameraId: string): Promise<void> {
    const state = this.getControlState(cameraId);
    const tourId = state.activeTourId;

    if (tourId) {
      const intervalId = this.tourIntervals.get(`${cameraId}_${tourId}`);
      if (intervalId) {
        clearTimeout(intervalId);
        this.tourIntervals.delete(`${cameraId}_${tourId}`);
      }
    }

    state.operationMode = 'IDLE';
    state.activeTourId = undefined;
    state.tourRun = undefined;
    state.isMoving = false;

    this.emitEvent({
      type: 'TOUR_STOP',
      cameraId,
      data: { tourId },
      timestamp: Date.now(),
    });

    console.log(`[PTZ] Stopped tour on camera ${cameraId}`);
  }

  public async pauseTour(cameraId: string): Promise<void> {
    const state = this.getControlState(cameraId);
    if (state.tourRun) {
      state.tourRun.isPaused = true;
      this.emitEvent({
        type: 'TOUR_PAUSE',
        cameraId,
        data: { tourId: state.activeTourId },
        timestamp: Date.now(),
      });
    }
  }

  public async resumeTour(cameraId: string): Promise<void> {
    const state = this.getControlState(cameraId);
    if (state.tourRun) {
      state.tourRun.isPaused = false;
      this.emitEvent({
        type: 'TOUR_RESUME',
        cameraId,
        data: { tourId: state.activeTourId },
        timestamp: Date.now(),
      });
    }
  }

  public getSpeedValue(speed: PTZSpeed): number {
    switch (speed) {
      case 'slow':
        return 1;
      case 'medium':
        return 5;
      case 'fast':
        return 10;
      default:
        return 5;
    }
  }

  public getCurrentTourProgress(cameraId: string): number | null {
    const state = this.getControlState(cameraId);
    if (!state.tourRun) return null;

    const tours = this.getTours(cameraId);
    const tour = tours.find(t => t.id === state.activeTourId);
    if (!tour || tour.presets.length === 0) return null;

    return (state.tourRun.currentPresetIndex / tour.presets.length) * 100;
  }
}

export const ptzService = PTZService.getInstance();