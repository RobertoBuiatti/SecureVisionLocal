# Arquitetura - SecureVision Local

> Documentação técnica da arquitetura atual do projeto

## Visão Geral

SecureVision Local é um aplicativo React Native (CLI) para monitoramento de câmeras de segurança, utilizando arquitetura baseada em **features** com stores Zustand para gerenciamento de estado.

```
┌─────────────────────────────────────────────────────────────────┐
│                        App Móvel                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Camada de UI                         │  │
│  │  (Screens, Componentes, Navegação)                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │               Camada de Estado (Zustand)                   │  │
│  │  cameraStore • recordingStore • ptzStore • settingsStore │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │               Camada de Dados/Interfaces                   │  │
│  │  (Tipos, APIs, Storage)                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Estrutura de Diretórios

```
src/
├── app/                    # Entry point principal
│   └── App.tsx             # Componente raiz
│   
├── shared/                 # Código compartilhado
│   ├── types/              # Definições de tipos TypeScript
│   │   ├── index.ts        # Exports principais
│   │   ├── camera.ts       # Tipos de câmera
│   │   ├── recording.ts    # Tipos de gravação
│   │   ├── automation.ts   # Tipos de automação
│   │   └── index.ts        # Barrel exports
│   │
│   ├── components/         # Componentes genéricos reutilizáveis
│   │   └── Icon.tsx        # Componente de ícone
│   │
│   ├── hooks/             # Hooks customizados genéricos
│   │   ├── index.ts       # Exports principais
│   │   ├── useAsync.ts    # Hook para operações assíncronas
│   │   ├── useDebounce.ts # Hook para debounce
│   │   ├── useNetwork.ts # Hook para estado de rede
│   │   └── useStorage.ts # Hook para storage local
│   │
│   ├── utils/            # Funções utilitárias
│   │   ├── index.ts      # Exports principais
│   │   ├── formatters.ts # Funções de formatação
│   │   └── validators.ts # Funções de validação
│   │
│   └── constants/        # Constantes globais
│       └── index.ts     # Constantes da aplicação
│
├── features/              # Funcionalidades por domínio
│   │                   # (Pré-definido na documentação)
│   │
├── services/            # Serviços de infraestrutura
│   ├── api/           # Cliente HTTP/Axios
│   │   ├── client.ts  # Cliente Axios
│   │   ├── endpoints.ts # Endpoints da API
│   │   └── index.ts   # Exports
│   │
│   ├── database/      # Banco de dados local (AsyncStorage)
│   │   ├── databaseService.ts # Serviço de banco
│   │   └── index.ts  # Exports
│   │
│   ├── storage/       # Armazenamento local
│   │   ├── storageService.ts
│   │   └── index.ts
│   │
│   ├── notifications/ # Sistema de notificações
│   │   ├── notificationService.ts
│   │   └── index.ts
│   │
│   ├── streaming/     # Streaming de vídeo
│   ├── recording/     # Gravação
│   └── motionDetection/ # Detecção de movimento
│
└── stores/            # Stores Zustand (Estado global)
    ├── index.ts       # Exports principais
    ├── cameraStore.ts # Estado das câmeras
    ├── recordingStore.ts # Estado de gravação
    ├── ptzStore.ts    # Estado PTZ
    ├── settingsStore.ts # Configurações do app
    └── index.ts       # Barrel exports
```

## Stack Tecnológica

### Dependencies Principais

| Biblioteca | Versão | Função |
|------------|--------|-------|
| react-native | 0.85.3 | Framework principal |
| react | 19.2.3 | React core |
| @react-navigation/native | 7.2.3 | Navegação |
| @react-navigation/native-stack | 7.14.13 | Stack navigator |
| @react-navigation/bottom-tabs | 7.15.12 | Bottom tabs |
| zustand | 5.0.13 | Gerenciamento de estado |
| axios | 1.16.0 | HTTP client |
| @react-native-async-storage/async-storage | 3.0.2 | Armazenamento key-value |
| react-native-fs | 2.20.0 | Sistema de arquivos |
| react-native-gesture-handler | 2.31.2 | Handling de gestos |
| react-native-reanimated | 4.3.1 | Animações |
| react-native-worklets | 0.8.3 | Worklets para reanimated |
| react-native-safe-area-context | 5.7.0 | Safe area |
| react-native-screens | 4.24.0 | Native screens |
| react-native-vector-icons | 10.3.0 | Ícones |

### DevDependencies

| Biblioteca | Versão | Função |
|------------|--------|-------|
| typescript | 5.8.3 | Type safety |
| eslint | 8.19.0 | Linting |
| jest | 29.6.3 | Testes |
| prettier | 2.8.8 | Formatação |

## Arquitetura de Dados

### Stores (Zustand)

O projeto utiliza **Zustand** para gerenciamento de estado devido à sua simplicidade e performance.

#### cameraStore

```typescript
interface CameraState {
  cameras: Camera[];
  selectedCameraId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setCameras: (cameras: Camera[]) => void;
  addCamera: (camera: Camera) => void;
  updateCamera: (id: string, updates: Partial<Camera>) => void;
  removeCamera: (id: string) => void;
  selectCamera: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}
```

#### recordingStore

```typescript
interface RecordingState {
  recordings: Recording[];
  isRecording: boolean;
  currentRecording: Recording | null;
  // ...
}
```

#### ptzStore

```typescript
interface PTZState {
  presets: PTZPreset[];
  tours: PTZTour[];
  activeTourId: string | null;
  currentPosition: { x: number; y: number; zoom: number };
  // ...
}
```

#### settingsStore

```typescript
interface SettingsState {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
  autoRecord: boolean;
  storageLimit: number;
  // ...
}
```

### Tipos

Os tipos são definidos em `src/shared/types/`:

```typescript
// camera.ts
export type CameraProtocol = 'rtsp' | 'onvif' | 'http' | 'mjpeg';
export type CameraStatus = 'online' | 'offline' | 'error' | 'connecting';
export type CameraType = 'ptz' | 'dome' | 'bullet' | 'cube' | 'fisheye';

export interface Camera {
  id: string;
  name: string;
  ip: string;
  port: number;
  protocol: CameraProtocol;
  type: CameraType;
  username?: string;
  password?: string;
  streamUrl: string;
  status: CameraStatus;
  thumbnail?: string;
  isRecording: boolean;
  hasPTZ: boolean;
  presetCount: number;
  createdAt: number;
  updatedAt: number;
}
```

## Padrões de Código

### Estrutura de Arquivos

| Tipo de Arquivo | Limite Máximo de Linhas |
|----------------|----------------------|
| Componente React | 100-200 |
| Hook | 50-150 |
| Service | 100-250 |
| Screen | 150-300 |
| Util | 20-50 |
| Tipo/Interface | 50-100 |

### Convenções de Nomenclatura

| Tipo | Padrão | Exemplo |
|------|-------|---------|
| Componente | PascalCase | `CameraGrid.tsx` |
| Hook | camelCase com prefixo `use` | `useCameraStream.ts` |
| Service | camelCase | `cameraService.ts` |
| Tipo | PascalCase | `CameraProtocol` |
| Store | camelCase com sufixo `Store` | `cameraStore.ts` |
| Constante | UPPER_SNAKE_CASE | `MAX_CAMERAS` |
| Enum | PascalCase | `CameraStatus` |

### Padrão de Store (Zustand)

```typescript
import { create } from 'zustand';
import type { Camera } from '@shared/types';

interface CameraState {
  cameras: Camera[];
  isLoading: boolean;
  
  setCameras: (cameras: Camera[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  cameras: [],
  isLoading: false,
  
  setCameras: (cameras) => set({ cameras }),
  setLoading: (isLoading) => set({ isLoading }),
})));
```

### Padrão de Barrel Export

```typescript
// src/shared/types/index.ts
export * from './camera';
export * from './recording';
export * from './automation';
export * from './index';
```

## Navegação

O projeto utiliza **React Navigation v7** com:

- `Native Stack Navigator` para transições nativas
- `Bottom Tabs` para navegação inferior

Configuração típica:

```typescript
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AppNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Cameras" component={CameraStack} />
      <Tab.Screen name="Recordings" component={RecordingStack} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
```

## Estados de build

O projeto tem duas configurações padrão:

### Debug
- Hot Module Reload (HMR) ativado
- Fonte flexível
- Logging completo

### Release (Produção)
- Minificação
- Otimização de bundle
- Tree shaking

## Integração Nativa

### Android

- Gradle 8.x
- Kotlin 1.9.x
- Build Tools 35.0.0
- Target SDK 35

### iOS

- Xcode 15+
- CocoaPods
- Deployment target: iOS 13+

## Limites e Restrições

| Recurso | Limite | Justificativa |
|--------|-------|--------------|
| Linhas por arquivo | 500 máx | Manutenibilidade |
| Profundidade de navegação | 3 níveis | UX |
| Stores globais | 4-6 | Simplicidade |

## Próximas Implementações

Baseado na documentação de planejamento:

1. **Fase 1**: Fundação - Streaming básico
2. **Fase 2**: Monitoramento - Visualização + Gravação
3. **Fase 3**: Inteligência - ML local
4. **Fase 4**: Automação - Regras e IoT

## Documentação

O projeto possui a seguinte documentação:

| Documento | Descrição |
|-----------|-----------|
| [README.md](../README.md) | Visão geral do projeto |
| [INSTALL.md](../INSTALL.md) | Guia de instalação |
| [API.md](../API.md) | Referência da API REST |
| [CHANGELOG.md](../CHANGELOG.md) | Histórico de mudanças |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Guia de contribuição |

## Referências

- [React Navigation](https://reactnavigation.org)
- [Zustand](https://github.com/pmndrs/zustand)
- [React Native](https://reactnative.dev)
- [Typescript](https://www.typescriptlang.org)