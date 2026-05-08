# Changelog - SecureVision Local

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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