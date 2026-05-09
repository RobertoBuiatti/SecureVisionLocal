import { create } from 'zustand';
import type { Camera } from '@shared/types';

export interface Recording {
  id: string;
  cameraId: string;
  cameraName: string;
  startTime: number;
  endTime: number | null;
  duration: number;
  fileSize: number;
  filePath: string;
  thumbnail?: string;
  hasMotion: boolean;
  hasPerson: boolean;
  hasVehicle: boolean;
  status: 'recording' | 'completed' | 'corrupted';
  type: 'continuous' | 'motion' | 'manual';
}

interface RecordingState {
  recordings: Recording[];
  isRecording: boolean;
  activeRecordingId: string | null;
  totalSize: number;
  isInitialized: boolean;

  setRecordings: (recordings: Recording[]) => void;
  addRecording: (recording: Recording) => void;
  updateRecording: (id: string, updates: Partial<Recording>) => void;
  deleteRecording: (id: string) => void;
  startRecording: (cameraId: string, cameraName: string, type?: Recording['type']) => void;
  stopRecording: (id: string) => void;
  setTotalSize: (size: number) => void;
  initialize: () => void;
  calculateTotalSize: () => number;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  recordings: [],
  isRecording: false,
  activeRecordingId: null,
  totalSize: 0,
  isInitialized: false,

  setRecordings: (recordings) => set({ recordings }),

  addRecording: (recording) =>
    set((state) => ({
      recordings: [recording, ...state.recordings],
    })),

  updateRecording: (id, updates) =>
    set((state) => ({
      recordings: state.recordings.map((rec) =>
        rec.id === id ? { ...rec, ...updates } : rec
      ),
    })),

  deleteRecording: (id) =>
    set((state) => ({
      recordings: state.recordings.filter((rec) => rec.id !== id),
      totalSize: state.totalSize - (state.recordings.find(r => r.id === id)?.fileSize || 0),
    })),

  startRecording: (cameraId, cameraName, type = 'manual') => {
    const newRecording: Recording = {
      id: `rec_${Date.now()}`,
      cameraId,
      cameraName,
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      fileSize: 0,
      filePath: `/recordings/${cameraId}_${Date.now()}.mp4`,
      hasMotion: false,
      hasPerson: false,
      hasVehicle: false,
      status: 'recording',
      type,
    };
    
    set((state) => ({
      isRecording: true,
      activeRecordingId: newRecording.id,
      recordings: [newRecording, ...state.recordings],
    }));
  },

  stopRecording: (id) => {
    const now = Date.now();
    const recording = get().recordings.find(r => r.id === id);
    if (!recording) return;

    const duration = Math.floor((now - recording.startTime) / 1000);
    
    set((state) => ({
      isRecording: false,
      activeRecordingId: null,
      recordings: state.recordings.map((rec) =>
        rec.id === id
          ? {
              ...rec,
              endTime: now,
              duration,
              status: 'completed' as const,
              fileSize: duration * 1024 * 100,
            }
          : rec
      ),
      totalSize: get().calculateTotalSize(),
    }));
  },

  setTotalSize: (size) => set({ totalSize: size }),

  initialize: () => {
    if (get().isInitialized) return;
    
    const mockRecordings = getDefaultRecordings();
    set({ 
      recordings: mockRecordings, 
      totalSize: mockRecordings.reduce((sum, r) => sum + r.fileSize, 0),
      isInitialized: true 
    });
  },

  calculateTotalSize: () => {
    return get().recordings.reduce((sum, rec) => sum + rec.fileSize, 0);
  },
}));

function getDefaultRecordings(): Recording[] {
  return [
    {
      id: 'rec1',
      cameraId: '1',
      cameraName: 'Entrada Principal',
      startTime: Date.now() - 3600000,
      endTime: Date.now() - 1800000,
      duration: 1800,
      fileSize: 256000000,
      filePath: '/recordings/rec1.mp4',
      thumbnail: 'https://via.placeholder.com/320x180',
      hasMotion: true,
      hasPerson: false,
      hasVehicle: true,
      status: 'completed',
      type: 'motion',
    },
    {
      id: 'rec2',
      cameraId: '4',
      cameraName: 'Portão',
      startTime: Date.now() - 7200000,
      endTime: Date.now() - 5400000,
      duration: 1800,
      fileSize: 189000000,
      filePath: '/recordings/rec2.mp4',
      thumbnail: 'https://via.placeholder.com/320x180',
      hasMotion: true,
      hasPerson: true,
      hasVehicle: false,
      status: 'completed',
      type: 'continuous',
    },
    {
      id: 'rec3',
      cameraId: '2',
      cameraName: 'Garagem',
      startTime: Date.now() - 10800000,
      endTime: Date.now() - 9000000,
      duration: 1800,
      fileSize: 212000000,
      filePath: '/recordings/rec3.mp4',
      thumbnail: 'https://via.placeholder.com/320x180',
      hasMotion: false,
      hasPerson: false,
      hasVehicle: false,
      status: 'completed',
      type: 'manual',
    },
  ];
}