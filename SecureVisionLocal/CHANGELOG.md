# Changelog - SecureVision Local

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Reorientação para Software Windows

### Changed
- **Mudança de direção do produto:** SecureVision Local passa a ser, primariamente, um
  **software desktop para Windows** (VMS/NVR por software) com o máximo de funcionalidades
  para câmeras WiFi/IP. O app mobile React Native passa a ser um **cliente companheiro**,
  a ser concluído na fase seguinte (Fase B).
- Stack do produto principal definida: **Electron + React + TypeScript**, **SQLite**
  (better-sqlite3), **FFmpeg** para vídeo, **ONVIF/mDNS/SSDP** para descoberta de câmeras,
  **ONNX Runtime/TFJS** para detecção local e servidor local **REST + WebRTC**.
- Documentação reescrita: `documentação/inicial.md` (v2.0), `README.md`, `ARCHITECTURE.md`
  e `INSTALL.md` reorientados para o software Windows; estrutura proposta em monorepo
  (`desktop/`, `mobile/`, `shared-types/`).

### Fixed
- **Vídeo ao vivo não exibia** (WebSocket recusado): removido o `React.StrictMode` (duplo-mount
  em dev derrubava/realocava os WebSockets de vídeo) e o `streaming.start` agora aguarda o servidor
  WS estar ouvindo antes de devolver a porta. Adicionados timeouts/baixa latência no FFmpeg.
- Falha do FFmpeg ao iniciar não derruba mais o app (handlers de `error` em todos os processos).

### Added
- **Rota PTZ (patrulha em ciclo)**: salvar posições (presets ONVIF), montar uma rota ordenada com
  tempo de permanência por posição e executá-la em **ciclo contínuo** na câmera. Botão "Rota" no
  bloco da câmera (Play/Pause do ciclo, indicador da posição atual).
- **MVP do software Windows (`desktop/`)**: Electron + React + TypeScript com descoberta de
  câmeras WiFi (ONVIF + scan), visualização ao vivo multi-câmera (FFmpeg→WebSocket→jsmpeg),
  gravação local, PTZ via ONVIF, banco SQLite e bandeja do Windows.
- **Gravação contínua 24/7** por câmera, em arquivos segmentados, com watchdog de reinício.
- **Retenção e reciclagem automática**: limite por dias e por GB; ao encher, as gravações
  **mais antigas são apagadas primeiro** (FIFO). Inclui reciclagem manual e barra de uso de disco.
- **Servidor local (REST + HLS)**: API autenticada por token (HTTP nativo), live via HLS sob
  demanda e streaming/download das gravações com suporte a Range — base para o app mobile (Fase B)
  e acesso via navegador na LAN. Painel de "Acesso remoto" nas configurações com URLs e token.
- Plano de implementação em duas fases: **Fase A** (software Windows, etapas A1–A6) e
  **Fase B** (conclusão do app mobile, etapas B1–B2).
- Especificação de funcionalidades de câmeras WiFi: descoberta automática na rede,
  gravação local 24/7, grade multi-câmera, PTZ, detecção inteligente, integração com o
  Windows (bandeja, autostart, modo serviço, aceleração por hardware).

## [0.0.1] - 2026-05-07

### Added
- Projeto base React Native 0.85.3
- Estrutura de tipos TypeScript:
  - `camera.ts` - Tipos para câmeras (CameraProtocol, CameraStatus, CameraType, Camera, CameraStream, PTZPreset, PTZTour, etc.)
  - `recording.ts` - Tipos para gravação (RecordingType, RecordingStatus, Recording, MotionZone, RecordingSchedule, etc.)
  - `automation.ts` - Tipos para automação (TriggerType, AutomationAction, Automation, IoTDevice, etc.)
- Stores Zustand:
  - `cameraStore.ts` - Gerenciamento de estado das câmeras
  - `recordingStore.ts` - Estado de gravação
  - `ptzStore.ts` - Estado PTZ
  - `settingsStore.ts` - Configurações do app
- Navegação React Navigation v7 configurada
- Integração com AsyncStorage e react-native-fs
- Configuração inicial com Vector Icons
- Theme support com Zustand

### Dependencies
- react: 19.2.3
- react-native: 0.85.3
- @react-navigation/native: 7.2.3
- @react-navigation/native-stack: 7.14.13
- @react-navigation/bottom-tabs: 7.15.12
- zustand: 5.0.13
- axios: 1.16.0
- @react-native-async-storage/async-storage: 3.0.2
- react-native-fs: 2.20.0
- react-native-gesture-handler: 2.31.2
- react-native-reanimated: 4.3.1
- react-native-worklets: 0.8.3
- react-native-safe-area-context: 5.7.0
- react-native-screens: 4.24.0
- react-native-vector-icons: 10.3.0

### Infrastructure
- TypeScript 5.8.3
- ESLint 8.19.0
- Jest 29.6.3
- Prettier 2.8.8
- Android Gradle 8.x / Kotlin 1.9.x
- iOS Deployment target: 13+

---

## Formato de Entradas

### Tipos de Mudança

- **Added**: Novas funcionalidades
- **Changed**: Mudanças em funcionalidades existentes
- **Deprecated**: Funcionalidades sendo removidas
- **Removed**: Funcionalidades removidas
- **Fixed**: Correções de bugs
- **Security**: Correções de segurança

### Template de Nova Entrada

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- Nova funcionalidade X

### Changed
- Funcionalidade Y modificada

### Fixed
- Bug Z corrigido
```

---

## Política de Versões

Seguimos [SemVer](https://semver.org/):

- **Major** (X.0.0): Mudanças incompatíveis
- **Minor** (x.Y.0): Novas funcionalidades compatíveis
- **Patch** (x.y.Z): Correções compatíveis

## Links Úteis

- [Keep a Changelog](https://keepachangelog.com)
- [Semantic Versioning](https://semver.org)
- [Conventional Commits](https://www.conventionalcommits.org)