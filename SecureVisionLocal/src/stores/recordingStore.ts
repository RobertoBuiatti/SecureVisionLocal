import { create } from 'zustand';

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
}

interface RecordingState {
  recordings: Recording[];
  isRecording: boolean;
  activeRecordingId: string | null;
  totalSize: number;

  addRecording: (recording: Recording) => void;
  updateRecording: (id: string, updates: Partial<Recording>) => void;
  deleteRecording: (id: string) => void;
  startRecording: (cameraId: string) => void;
  stopRecording: (id: string) => void;
  setTotalSize: (size: number) => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  recordings: [],
  isRecording: false,
  activeRecordingId: null,
  totalSize: 0,

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
    })),

  startRecording: (cameraId) =>
    set((state) => ({
      isRecording: true,
      activeRecordingId: cameraId,
    })),

  stopRecording: (id) =>
    set((state) => ({
      isRecording: false,
      activeRecordingId: null,
    })),

  setTotalSize: (size) => set({ totalSize: size }),
}));

const mockRecordings: Recording[] = [
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
  },
];

useRecordingStore.getState().addRecording(mockRecordings[0]);
useRecordingStore.getState().addRecording(mockRecordings[1]);
useRecordingStore.getState().addRecording(mockRecordings[2]);