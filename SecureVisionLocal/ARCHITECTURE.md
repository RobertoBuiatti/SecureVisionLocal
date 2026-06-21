# Arquitetura - SecureVision Local

> Documentação técnica da arquitetura do **software Windows** (principal) e do **app mobile companheiro** (Fase B).

## Visão Geral

SecureVision Local é, primariamente, um **software desktop para Windows** construído com **Electron + React + TypeScript**. Ele atua como um VMS/NVR por software: descobre câmeras WiFi/IP, exibe múltiplas streams ao vivo, grava em disco local 24/7, aplica detecção inteligente e expõe um servidor local consumido pelo app mobile e por integrações.

A arquitetura separa claramente:

- **Renderer (UI):** React + TypeScript, gerência de estado com Zustand.
- **Main process (núcleo):** Node.js, onde rodam descoberta de câmeras, FFmpeg, gravação, ML, automação, banco SQLite e o servidor local.
- **Ponte IPC:** comunicação tipada entre UI e núcleo.

```
┌─────────────────────────────────────────────────────────────────┐
│                  Software Windows (Electron)                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              RENDERER — Camada de UI (React)              │  │
│  │  Grade multi-câmera • PTZ • Timeline • Dashboard • Config │  │
│  │  Estado: Zustand (cameraStore, recordingStore, ...)      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                         ▲  IPC (tipado)                          │
│                         ▼                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │            MAIN PROCESS — Núcleo (Node.js)               │  │
│  │  Discovery • Streaming (FFmpeg) • Recording • ML •       │  │
│  │  Automation • Storage • Server (REST/WebRTC) • SQLite    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                         │                                       │
│         ┌───────────────┼───────────────┐                      │
│         ▼               ▼               ▼                      │
│   Câmeras WiFi/IP   Discos/NAS     App Mobile (cliente)        │
└─────────────────────────────────────────────────────────────────┘
```

## Estrutura de Diretórios (Monorepo)

```
SecureVisionLocal/
├── desktop/                  # Software Windows (produto principal)
│   ├── electron/             # MAIN PROCESS (Node.js)
│   │   ├── main.ts           # Entry point do Electron
│   │   ├── preload.ts        # Bridge segura (contextBridge)
│   │   ├── ipc/              # Handlers de IPC por domínio
│   │   ├── discovery/        # ONVIF WS-Discovery, mDNS, SSDP, scan de rede
│   │   ├── streaming/        # Pipelines FFmpeg, RTSP, transcodificação
│   │   ├── recording/        # Gravação 24/7, buffers, retenção
│   │   ├── ml/               # Detecção (ONNX Runtime / TFJS)
│   │   ├── automation/       # Motor de regras e ações
│   │   ├── storage/          # Gerência de discos e arquivos de vídeo
│   │   ├── server/           # API REST + WebRTC/HLS (app mobile)
│   │   └── db/               # SQLite: schema, migrações, repositórios
│   │
│   ├── src/                  # RENDERER (UI React + TypeScript)
│   │   ├── app/              # App, layout de janelas, roteamento
│   │   │   ├── App.tsx
│   │   │   ├── routing/      # Navegação entre painéis/telas
│   │   │   └── theme/        # Tema e estilos globais
│   │   ├── features/         # Domínios da UI
│   │   │   ├── cameras/      # Grade, detalhe, adição (componentes/hooks)
│   │   │   ├── recording/    # Timeline e revisão
│   │   │   ├── ptz/          # Controles PTZ, presets, tours
│   │   │   ├── automation/   # Editor de regras
│   │   │   ├── ai/           # Configuração de detecção
│   │   │   ├── dashboard/    # Métricas e saúde do sistema
│   │   │   └── settings/     # Configurações
│   │   ├── shared/           # components, hooks, utils, types, constants
│   │   └── stores/           # Zustand (estado global da UI)
│   │
│   ├── package.json
│   └── electron-builder.yml  # Configuração de empacotamento .exe/.msi
│
├── mobile/                   # App React Native (cliente — Fase B)
│   ├── src/                  # Telas, navegação, stores (cliente do servidor local)
│   ├── android/
│   └── ios/
│
└── shared-types/             # Tipos TypeScript compartilhados (camera, recording, ...)
```

> **Migração:** o `src/` React Native atual é reaproveitado/adaptado para o renderer do desktop (`desktop/src/`) e, na Fase B, para o cliente mobile (`mobile/src/`). Os **tipos** e a **API local** são a fronteira comum.

## Stack Tecnológica

### Software Windows (principal)

| Categoria | Biblioteca/Tecnologia | Função |
|-----------|-----------------------|--------|
| Shell | electron | Empacota app desktop Windows com Node.js |
| Empacotamento | electron-builder | Instalador .exe/.msi + auto-update |
| UI | react 19, typescript | Interface do renderer |
| Estado | zustand | Estado global da UI |
| Vídeo | ffmpeg-static, fluent-ffmpeg | Decodificar/gravar/transcodificar RTSP |
| Exibição de stream | jsmpeg / mpegts.js / WebRTC | Render do vídeo na UI |
| Descoberta | onvif, node-ssdp, bonjour-service | WS-Discovery, SSDP, mDNS |
| ONVIF/PTZ | node-onvif / onvif | Perfis, URLs de stream, PTZ |
| Banco | better-sqlite3 | Persistência local (SQLite) |
| ML local | onnxruntime-node, @tensorflow/tfjs-node | Detecção de objetos sem nuvem |
| Servidor | fastify/express, ws | API REST + WebSocket/streaming |
| HTTP | axios | Requisições a câmeras/serviços |

### App Mobile (Fase B)

| Categoria | Biblioteca | Função |
|-----------|------------|--------|
| Framework | react-native 0.85.x | App Android/iOS |
| Vídeo | react-native-video / react-native-webrtc | Playback remoto |
| Navegação | @react-navigation/* v7 | Navegação |
| Estado | zustand | Estado (compartilha tipos com desktop) |
| HTTP | axios | Cliente da API local do software |

## Comunicação Renderer ↔ Main (IPC)

A UI nunca acessa câmeras ou disco diretamente. Toda operação sensível passa pelo **main process** via IPC tipado, exposto por um `preload.ts` seguro (`contextBridge`).

```typescript
// preload.ts — superfície exposta à UI
contextBridge.exposeInMainWorld('svl', {
  cameras: {
    discover: () => ipcRenderer.invoke('cameras:discover'),
    add: (data: CreateCameraDTO) => ipcRenderer.invoke('cameras:add', data),
    list: () => ipcRenderer.invoke('cameras:list'),
  },
  streaming: {
    start: (id: string) => ipcRenderer.invoke('stream:start', id),
    stop: (id: string) => ipcRenderer.invoke('stream:stop', id),
  },
  ptz: {
    move: (id: string, cmd: PTZCommand) => ipcRenderer.invoke('ptz:move', id, cmd),
  },
  // recording, automation, settings, system...
});
```

## Arquitetura de Dados

### Banco de Dados (SQLite)

Diferente do app mobile (AsyncStorage), o software Windows usa **SQLite** (`better-sqlite3`) para persistência robusta de grandes volumes (eventos, índice de gravações). Tabelas principais:

| Tabela | Conteúdo |
|--------|----------|
| `cameras` | Câmeras cadastradas (IP, protocolo, credenciais, PTZ) |
| `recordings` | Índice de arquivos de vídeo gravados (câmera, início/fim, tipo, caminho) |
| `events` | Eventos de detecção (movimento, pessoa, veículo, timestamp, câmera) |
| `automations` | Regras (trigger → ações) |
| `presets` / `tours` | Posições e tours PTZ |
| `users` | Usuários locais, papéis e permissões |
| `settings` | Configurações do sistema |

### Stores (Zustand — Renderer)

O estado da UI segue em **Zustand**. Os stores consomem o núcleo via IPC e refletem o estado para os componentes.

#### cameraStore

```typescript
interface CameraState {
  cameras: Camera[];
  discovered: DiscoveredCamera[];   // resultado da descoberta na rede
  selectedCameraId: string | null;
  isLoading: boolean;
  error: string | null;

  discover: () => Promise<void>;     // chama svl.cameras.discover()
  addCamera: (camera: CreateCameraDTO) => Promise<void>;
  updateCamera: (id: string, updates: Partial<Camera>) => void;
  removeCamera: (id: string) => void;
  selectCamera: (id: string | null) => void;
}
```

#### recordingStore

```typescript
interface RecordingState {
  recordings: Recording[];
  isRecording: boolean;
  timelineRange: { start: number; end: number };
  // ...
}
```

#### ptzStore

```typescript
interface PTZState {
  presets: PTZPreset[];
  tours: PTZTour[];
  activeTourId: string | null;
  currentPosition: { pan: number; tilt: number; zoom: number };
  // ...
}
```

#### settingsStore

```typescript
interface SettingsState {
  theme: 'light' | 'dark';
  language: string;
  layout: GridLayout;          // 2x2, 3x3, 8x8, custom...
  storage: { disks: DiskConfig[]; retentionDays: number };
  hardwareAcceleration: 'auto' | 'nvenc' | 'qsv' | 'none';
  startWithWindows: boolean;
  // ...
}
```

### Tipos

Definidos em `shared-types/` (e reaproveitados em `desktop/src/shared/types/`):

```typescript
// camera.ts
export type CameraProtocol = 'rtsp' | 'onvif' | 'http' | 'mjpeg' | 'rtmp' | 'hls';
export type CameraStatus = 'online' | 'offline' | 'error' | 'connecting';
export type CameraType = 'ptz' | 'dome' | 'bullet' | 'cube' | 'fisheye';

export interface Camera {
  id: string;
  name: string;
  ip: string;
  port: number;
  protocol: CameraProtocol;
  type: CameraType;
  manufacturer?: string;
  username?: string;
  password?: string;          // armazenado criptografado
  streamUrl: string;          // mainstream
  subStreamUrl?: string;      // substream (grade)
  onvifProfile?: string;
  status: CameraStatus;
  hasPTZ: boolean;
  hasAudio: boolean;
  presetCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DiscoveredCamera {
  ip: string;
  port: number;
  manufacturer?: string;
  model?: string;
  onvifUrl?: string;
  rtspUrls?: string[];
  source: 'onvif' | 'mdns' | 'ssdp' | 'scan';
}
```

## Padrões de Código

### Limites de Arquivo

| Tipo de Arquivo | Limite Máximo de Linhas |
|-----------------|-------------------------|
| Componente React | 100–200 |
| Hook | 50–150 |
| Service / módulo do main | 100–250 |
| Tela/Painel | 150–300 |
| Util | 20–50 |
| Tipo/Interface | 50–100 |

### Convenções de Nomenclatura

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Componente | PascalCase | `CameraGrid.tsx` |
| Hook | camelCase com `use` | `useCameraStream.ts` |
| Módulo do main | camelCase | `discoveryService.ts` |
| Tipo | PascalCase | `CameraProtocol` |
| Store | camelCase com `Store` | `cameraStore.ts` |
| Constante | UPPER_SNAKE_CASE | `MAX_CAMERAS` |
| Handler IPC | `domínio:ação` | `cameras:discover` |

### Padrão de Store (Zustand)

```typescript
import { create } from 'zustand';
import type { Camera, CreateCameraDTO } from '@shared/types';

interface CameraState {
  cameras: Camera[];
  isLoading: boolean;
  discover: () => Promise<void>;
  addCamera: (data: CreateCameraDTO) => Promise<void>;
}

export const useCameraStore = create<CameraState>((set, get) => ({
  cameras: [],
  isLoading: false,
  discover: async () => {
    set({ isLoading: true });
    const found = await window.svl.cameras.discover();
    set({ isLoading: false /* ...merge found */ });
  },
  addCamera: async (data) => {
    const camera = await window.svl.cameras.add(data);
    set({ cameras: [...get().cameras, camera] });
  },
}));
```

## Empacotamento e Distribuição (Windows)

| Item | Configuração |
|------|--------------|
| Empacotador | electron-builder |
| Alvos | `nsis` (.exe) e `msi` |
| Assinatura | Code signing (certificado Windows) |
| Auto-update | electron-updater (servidor de updates local/próprio) |
| Aceleração | FFmpeg com NVDEC / Intel QSV / AMD |
| Execução | App + bandeja; opcional **serviço do Windows** para gravação 24/7 |

## Estados de Build

### Desenvolvimento
- Hot reload do renderer (Vite/Metro)
- DevTools do Electron habilitado
- Logging completo

### Produção (Release)
- Renderer minificado e otimizado
- Main empacotado (asar), nativos rebuildados (better-sqlite3, onnxruntime)
- Instalador assinado

## Limites e Restrições

| Recurso | Limite | Justificativa |
|---------|--------|---------------|
| Linhas por arquivo | 500 máx | Manutenibilidade |
| Separação UI × núcleo | Obrigatória (IPC) | Segurança e testabilidade |
| Acesso a disco/câmera pela UI | Proibido (só via main) | Segurança (contextIsolation) |

## Próximas Implementações

Baseado no plano de desenvolvimento ([documentação/inicial.md](../../documentação/inicial.md)):

1. **Etapa A1** — Fundação desktop (Electron + UI migrada + SQLite + IPC)
2. **Etapa A2** — Descoberta e streaming de câmeras WiFi
3. **Etapa A3** — Gravação local 24/7
4. **Etapa A4** — Inteligência local (detecção)
5. **Etapa A5** — PTZ, automação e acesso
6. **Etapa A6** — Servidor local + integração Windows
7. **Fase B** — Concluir o app mobile companheiro

## Referências

- [Electron](https://www.electronjs.org)
- [electron-builder](https://www.electron.build)
- [FFmpeg](https://ffmpeg.org)
- [ONVIF](https://www.onvif.org)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [ONNX Runtime](https://onnxruntime.ai)
- [Zustand](https://github.com/pmndrs/zustand)
- [React Native](https://reactnative.dev) (app mobile — Fase B)
