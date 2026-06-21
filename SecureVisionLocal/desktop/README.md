# SecureVision Local — Software Windows (Desktop)

Central de monitoramento de câmeras WiFi/IP para Windows (NVR por software), construída com **Electron + React + TypeScript**. Produto principal do projeto SecureVision Local.

## O que já está implementado (Fase A — MVP)

- **Descoberta de câmeras** na rede local (ONVIF WS-Discovery + varredura TCP de portas RTSP).
- **Adição de câmera** (assistente com pré-preenchimento da descoberta ou manual).
- **Visualização ao vivo multi-câmera** em grade (1x1, 2x2, 3x3, 4x4) via FFmpeg → WebSocket → jsmpeg.
- **Gravação local** em disco (MP4) por câmera, com índice no banco SQLite.
- **Gravação contínua 24/7** por câmera, em arquivos segmentados (duração configurável), com watchdog que reinicia o FFmpeg se cair.
- **Retenção + reciclagem automática:** ao atingir o limite de **dias** ou de **GB**, as gravações **mais antigas são apagadas primeiro** (FIFO) para liberar espaço. Botão de reciclagem manual e barra de uso de disco.
- **Controle PTZ** (D-pad + zoom) via ONVIF.
- **Servidor local (REST + HLS)** para o app mobile e navegador na LAN: API autenticada por token,
  live via HLS sob demanda e download/streaming das gravações (com Range). Base da Fase B.
- **Banco SQLite** (câmeras, gravações, eventos, configurações).
- **Integração com Windows:** janela + **bandeja do sistema**, segue em segundo plano, instância única.
- **Configurações:** pasta de gravações, retenção, aceleração por hardware, layout, iniciar com o Windows.

## Arquitetura

```
electron/            MAIN PROCESS (Node.js)
  main.ts            Janela, bandeja, ciclo de vida
  preload.ts         Bridge segura (contextBridge → window.svl)
  ipc/handlers.ts    Handlers IPC (ponte UI ↔ núcleo)
  core/
    db.ts            SQLite (schema + migração)
    cameraRepository.ts / recordingRepository.ts
    discovery.ts     ONVIF + scan de rede
    streaming.ts     FFmpeg → WebSocket (MPEG-TS)
    recording.ts     Gravação manual em MP4
    continuousRecording.ts  Gravação 24/7 segmentada + indexação
    recordingManager.ts     Orquestra 24/7 (watchdog) + sync + retenção
    retention.ts     Retenção por idade/espaço + reciclagem FIFO
    ptz.ts           Controle ONVIF PTZ
    settings.ts / system.ts / connection.ts / paths.ts / network.ts
  server/
    localServer.ts   API REST + streaming (HTTP nativo, auth por token)
    hlsManager.ts    Sessões HLS sob demanda (FFmpeg → m3u8/ts)

src/                 RENDERER (UI React)
  app/App.tsx        Layout + roteamento de views
  store.ts           Estado (Zustand) consumindo window.svl
  components/        Player (jsmpeg), CameraTile, CameraGrid, PTZPad, Sidebar, AddCameraModal
  views/             LiveView, DiscoveryView, RecordingsView, SettingsView
  shared/            types.ts (domínio) + ipc.ts (contrato da API)
```

## Desenvolvimento

```powershell
cd desktop
npm install        # instala deps (rebuilda nativos p/ Electron via postinstall)
npm run dev        # Electron + Vite (hot reload)
```

> Requer **Windows 10/11**, **Node.js >= 22**, e **Visual Studio Build Tools (C++)** + **Python 3** para compilar `better-sqlite3`. Veja `../INSTALL.md`.

## Build do instalador

```powershell
npm run build:win  # gera release/SecureVision Local-Setup-x.y.z.exe (e .msi)
```

## Notas técnicas

- **Streaming:** cada câmera abre um processo FFmpeg que transcodifica o RTSP para MPEG-TS e
  transmite por um WebSocket local; o `jsmpeg` decodifica no `<canvas>`. Sem plugins nativos de vídeo.
- **Sem áudio no MVP** (estabilidade). Áudio bidirecional entra em etapa posterior.
- **Segurança:** `contextIsolation` ativo, `nodeIntegration` desligado; a UI só acessa o núcleo via `window.svl`.
- **Servidor local:** HTTP nativo do Node (sem dependências extras). Autenticação por **token Bearer**
  (ou `?token=` para players). Live em **HLS** (compatível com `react-native-video` e navegadores);
  o playlist é reescrito para propagar o token aos segmentos. Sessões HLS encerram após inatividade.
- **Endpoints principais:** `GET /api/health`, `GET /api/cameras`, `GET /api/cameras/:id`,
  `POST /api/cameras/:id/ptz`, `POST /api/cameras/:id/recording/{start,stop}`, `GET /api/recordings`,
  `GET /api/recordings/:id/file` (Range), `GET /api/live/:id/index.m3u8`.
- **Próximas etapas (roadmap):** detecção por ML (ONNX), agendamento de gravação por horário,
  WebRTC de baixa latência (substituindo/complementando o HLS), automação por regras, e a
  **Fase B**: concluir o app mobile consumindo este servidor.
