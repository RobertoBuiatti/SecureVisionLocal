// Tipos de domínio do SecureVision Local Desktop.
// Reaproveitados do app mobile e ampliados para o software Windows.

export type CameraProtocol = 'rtsp' | 'onvif' | 'http' | 'mjpeg' | 'rtmp' | 'hls';
export type CameraStatus = 'online' | 'offline' | 'error' | 'connecting';
export type CameraType = 'ptz' | 'dome' | 'bullet' | 'cube' | 'fisheye';
export type StreamQuality = 'low' | 'medium' | 'high';

export interface Camera {
  id: string;
  name: string;
  ip: string;
  port: number;
  protocol: CameraProtocol;
  type: CameraType;
  manufacturer?: string;
  username?: string;
  password?: string;
  streamUrl: string; // mainstream RTSP
  subStreamUrl?: string; // substream (grade)
  onvifProfile?: string;
  onvifPort?: number; // porta do serviço ONVIF (ex.: 8899 em Xiongmai) p/ PTZ
  status: CameraStatus;
  hasPTZ: boolean;
  hasAudio: boolean;
  hasOnboardTracking: boolean; // a câmera segue objetos sozinha (auto-track no firmware)
  presetCount: number;
  recordContinuous: boolean;
  createdAt: number;
  updatedAt: number;
}

// DTO para criar uma câmera (o id/status/timestamps são gerados no núcleo).
export interface CreateCameraDTO {
  name: string;
  ip: string;
  port: number;
  protocol: CameraProtocol;
  type?: CameraType;
  manufacturer?: string;
  username?: string;
  password?: string;
  streamUrl: string;
  subStreamUrl?: string;
  onvifPort?: number;
  hasPTZ?: boolean;
  hasAudio?: boolean;
  hasOnboardTracking?: boolean;
  recordContinuous?: boolean;
}

// ---- Resolução do encoder (ONVIF) ----

export interface VideoResolution {
  width: number;
  height: number;
}

export interface VideoEncoderInfo {
  supported: boolean; // a câmera respondeu com resoluções disponíveis
  current: VideoResolution | null; // resolução atual do stream principal
  resolutions: VideoResolution[]; // resoluções aceitas (maior → menor)
}

// Dados obtidos via ONVIF (com credenciais): identificação + URLs de stream reais.
export interface OnvifProbeResult {
  manufacturer?: string;
  model?: string;
  firmware?: string;
  hasPTZ: boolean;
  streamUri?: string;
  subStreamUri?: string;
  onvifPort?: number;
}

// Câmera encontrada pela descoberta na rede (ainda não cadastrada).
export interface DiscoveredCamera {
  ip: string;
  port: number;
  name?: string;
  manufacturer?: string;
  model?: string;
  onvifUrl?: string;
  rtspUrls?: string[];
  source: 'onvif' | 'mdns' | 'ssdp' | 'scan';
}

export type RecordingType = 'continuous' | 'motion' | 'event' | 'manual';
export type RecordingStatus = 'recording' | 'completed' | 'corrupted' | 'stopped' | 'error';

export interface Recording {
  id: string;
  cameraId: string;
  cameraName?: string;
  type: RecordingType;
  status: RecordingStatus;
  startTime: number;
  endTime: number | null;
  duration: number;
  fileSize: number;
  filePath: string;
  thumbnailPath?: string;
  hasMotion: boolean;
}

export interface StreamInfo {
  cameraId: string;
  wsPort: number; // porta do WebSocket onde o vídeo (MPEG-TS) é transmitido
  status: 'starting' | 'running' | 'error' | 'stopped';
  error?: string;
}

export interface SystemStatus {
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  storageUsedGB: number;
  storageTotalGB: number;
  recordingCount: number;
  camerasTotal: number;
  camerasOnline: number;
  camerasOffline: number;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  language: string;
  recordingsPath: string;
  retentionDays: number; // 0 = sem limite por idade
  maxStorageGB: number; // 0 = sem limite por espaço
  continuousSegmentMinutes: number; // duração de cada arquivo da gravação 24/7
  autoRecycle: boolean; // reciclagem: apaga as gravações mais antigas ao atingir o limite
  hardwareAcceleration: 'auto' | 'nvenc' | 'qsv' | 'none';
  startWithWindows: boolean;
  gridLayout: number; // 1, 4, 9, 16...
  serverEnabled: boolean; // servidor local (app mobile / navegador na LAN)
  serverPort: number;
  serverToken: string; // token de acesso (gerado na 1ª execução)
  notificationsEnabled: boolean; // notificações nativas do Windows em detecções
  webhookUrl: string; // URL opcional p/ POST de alerta em cada detecção (vazio = desativado)
  overlayDetectionMarks: boolean; // queima traços finos das detecções no vídeo (clipes por evento)
}

// ---- Agendamento de gravação ----

export interface RecordingSchedule {
  id: string;
  cameraId: string;
  enabled: boolean;
  startTime: string; // 'HH:MM' (início da janela de gravação)
  endTime: string; // 'HH:MM' (fim; se < início, cruza a meia-noite)
  daysOfWeek: number[]; // 0=domingo … 6=sábado
  createdAt: number;
}

export interface ServerInfo {
  enabled: boolean;
  running: boolean;
  port: number;
  token: string;
  urls: string[]; // URLs de acesso na LAN (ex.: http://192.168.0.10:8080)
}

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  recordingCount: number;
  oldestRecordingTime: number | null;
}

// ---- Detecção (movimento / objetos) ----

export type DetectionType = 'motion' | 'person' | 'vehicle' | 'animal';

export interface DetectionConfig {
  cameraId: string;
  motionEnabled: boolean; // liga a análise de movimento (diferença de pixels)
  aiEnabled: boolean; // liga a detecção por IA (pessoa / animal / veículo)
  sensitivity: number; // 1-100 (maior = mais sensível)
  recordMotion: boolean; // gravar quando detectar movimento
  recordPerson: boolean; // gravar quando detectar pessoa (IA)
  recordVehicle: boolean; // gravar quando detectar veículo (IA)
  recordAnimal: boolean; // gravar quando detectar animal (IA)
  trackEnabled: boolean; // acompanhar (PTZ) o objeto detectado
  trackSeconds: number; // por quanto tempo seguir após a última detecção
}

export interface AiStatus {
  available: boolean; // runtime de IA carregado
  objectModel: boolean; // modelo de objetos (pessoa/animal/veículo) pronto
  downloading: boolean; // baixando o modelo
  modelsDir: string; // pasta onde colocar modelos manualmente
  message?: string;
}

export interface DetectionEvent {
  id: string;
  cameraId: string;
  cameraName?: string;
  type: DetectionType;
  timestamp: number;
  score?: number; // intensidade (movimento) ou confiança (objeto)
}

export type PTZDirection =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'up-left'
  | 'up-right'
  | 'down-left'
  | 'down-right';

export interface PTZCommand {
  action: 'move' | 'stop' | 'zoom-in' | 'zoom-out' | 'goto-preset';
  direction?: PTZDirection;
  speed?: number; // 0-100
  presetToken?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  latency: number | null;
  error: string | null;
  timestamp: number;
}

// ---- PTZ: presets e rotas (tours/patrulha) ----

export interface PTZPreset {
  id: string;
  cameraId: string;
  name: string;
  token: string; // token do preset na câmera (ONVIF)
  createdAt: number;
  snapshotPath?: string; // imagem de referência da posição
  lastCheckAt?: number; // última verificação automática de posição
  lastCheckOk?: boolean; // posição estava correta?
  lastCheckScore?: number; // diferença medida (menor = mais parecido)
}

export interface PositionCheckResult {
  presetId: string;
  presetName: string;
  ok: boolean;
  score: number;
  checkedAt: number;
  corrected?: boolean; // a câmera estava errada e foi reposicionada com sucesso
}

export interface PTZTourStep {
  presetToken: string;
  presetName: string;
  dwellSeconds: number; // tempo de permanência na posição
}

export interface PTZTour {
  id: string;
  cameraId: string;
  name: string;
  steps: PTZTourStep[];
  createdAt: number;
}

export interface PTZTourStatus {
  cameraId: string;
  running: boolean;
  tourId: string | null;
  stepIndex: number;
}
