import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PTZPreset, PTZTour, PTZTourRun } from '@features/ptz/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PTZState {
  presets: Record<string, PTZPreset[]>;
  tours: Record<string, PTZTour[]>;
  activeTourRun: PTZTourRun | null;
  isTourRunning: boolean;
  isTourPaused: boolean;
  currentPresetIndex: number;

  setPresets: (cameraId: string, presets: PTZPreset[]) => void;
  addPreset: (cameraId: string, preset: PTZPreset) => void;
  removePreset: (cameraId: string, presetId: string) => void;
  setTours: (cameraId: string, tours: PTZTour[]) => void;
  addTour: (cameraId: string, tour: PTZTour) => void;
  removeTour: (cameraId: string, tourId: string) => void;
  startTourRun: (run: PTZTourRun) => void;
  stopTourRun: () => void;
  pauseTourRun: () => void;
  resumeTourRun: () => void;
  setCurrentPresetIndex: (index: number) => void;
}

export const usePTZStore = create<PTZState>()(
  persist(
    (set) => ({
      presets: {},
      tours: {},
      activeTourRun: null,
      isTourRunning: false,
      isTourPaused: false,
      currentPresetIndex: 0,

      setPresets: (cameraId, presets) =>
        set((state) => ({
          presets: { ...state.presets, [cameraId]: presets },
        })),

      addPreset: (cameraId, preset) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [cameraId]: [...(state.presets[cameraId] || []), preset],
          },
        })),

      removePreset: (cameraId, presetId) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [cameraId]: (state.presets[cameraId] || []).filter(
              (p) => p.id !== presetId
            ),
          },
        })),

      setTours: (cameraId, tours) =>
        set((state) => ({
          tours: { ...state.tours, [cameraId]: tours },
        })),

      addTour: (cameraId, tour) =>
        set((state) => ({
          tours: {
            ...state.tours,
            [cameraId]: [...(state.tours[cameraId] || []), tour],
          },
        })),

      removeTour: (cameraId, tourId) =>
        set((state) => ({
          tours: {
            ...state.tours,
            [cameraId]: (state.tours[cameraId] || []).filter(
              (t) => t.id !== tourId
            ),
          },
        })),

      startTourRun: (run) =>
        set({
          activeTourRun: run,
          isTourRunning: true,
          isTourPaused: false,
          currentPresetIndex: 0,
        }),

      stopTourRun: () =>
        set({
          activeTourRun: null,
          isTourRunning: false,
          isTourPaused: false,
          currentPresetIndex: 0,
        }),

      pauseTourRun: () => set({ isTourPaused: true }),

      resumeTourRun: () => set({ isTourPaused: false }),

      setCurrentPresetIndex: (index) => set({ currentPresetIndex: index }),
    }),
    {
      name: 'ptz-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        presets: state.presets,
        tours: state.tours,
      }),
    }
  )
);