# HANGOFF — SecureVision Desktop

## v0.1.51 — tela cheia não era tela cheia

### Sintoma
O modo "Tela cheia" da tela Ao Vivo não ocupava o monitor: continuavam à vista o cabeçalho
("Ao Vivo", botões de modo, "+ Câmera"), a barra de ferramentas do bloco e a navegação —
e o vídeo ficava em ~90% da altura. O botão "⛶ Monitor" promovia a `.live-view` INTEIRA
para fullscreen, levando o cabeçalho junto.

### O que mudou
- **`LiveView.tsx`** — o botão "Tela cheia" agora entra direto no fullscreen do monitor
  (`changeMode`), e sair para Grade/Destaque sai do fullscreen. O `requestFullscreen` é
  chamado sobre a `.live-view`, que já está no DOM no instante do clique: assim acontece
  dentro do gesto do usuário (exigência do Chromium), sem depender de esperar um render.
- **`styles.css`** — regras `.live-view:fullscreen` escondem cabeçalho, barra de ferramentas
  e botão de remover câmera, e fazem o vídeo ocupar 100% da tela.
- **Navegação flutuante** — `.fs-nav` vira uma barra sobreposta que some após ~2,5s parado e
  volta ao mover o mouse. Um `:hover` no CSS não serviria: em tela cheia a view ocupa o
  monitor inteiro, então o ponteiro está sempre sobre ela e a barra nunca sumiria.
- **Fundo preto sem imagem** — o canvas do jsmpeg nasce BRANCO e só escurece no primeiro
  quadro. Em tela cheia isso acendia o monitor inteiro de branco enquanto a câmera conectava
  (ou quando o sinal caía). Agora o canvas fica transparente enquanto não há imagem
  (`.player-canvas.idle`) e aparece o preto do bloco.

### Verificação
```
npm run check:fullscreen   # 11 checagens, incluindo a cor real do pixel na tela
npm run check:packaged     # repete no EXECUTÁVEL gerado, não só no código
```
O check lê o pixel do screenshot (e não o CSS computado) porque o canvas do jsmpeg pinta por
cima do `background`: só o pixel prova o que o usuário enxerga.

### Nota — teste desatualizado encontrado
`svl-e2e-check.cjs` estava quebrado desde o commit `9c1e67b` (bloqueio de cadastro
duplicado): ele criava duas câmeras com o mesmo path (`/test`) em IPs diferentes, e a regra
atual trata isso como o MESMO aparelho. O teste passou a usar paths distintos
(`/test1`, `/test2`). O app não foi alterado — a regra é deliberada.

---

## v0.1.50 → v0.1.51 — câmera travando após ~40 minutos

### Sintoma
No PC servidor a câmera (Xiongmai XM533 8MP, WiFi) funcionava ~40 minutos e depois travava
com a imagem "bugada". O banco da instalação mostrava 275 quedas de stream com **mediana de
103s entre elas**, 234 stalls e o IP alternando entre 192.168.1.10 e 192.168.1.28.

### Causa raiz: sessões RTSP paralelas
A câmera serve pouquíssimas sessões RTSP. A arquitetura de "fonte única" (commit `5fc30f7`)
já existia, mas **quatro caminhos ainda abriam conexão própria** — e um deles abria uma
sessão fantasma que nunca morria, exatamente 30 minutos depois do failover para o
sub-stream. Daí os "40 minutos".

| Caminho | O que fazia | Agora |
|---|---|---|
| Probe de restauração do HD (`streaming.ts`) | Abria um 2º FFmpeg 8MP na câmera. Era spawnado com `stdio[1]='ignore'` e saída `-f null -`, então **nunca** produzia o sinal de estabilidade que ele mesmo esperava: ficava pendurado para sempre (o log mostra 5min33s, 61s, 53s por ciclo) e `stop()` não tinha referência para matá-lo | Removido. `promoteToHigh()` troca a qualidade **na própria puxada** e respawna o mesmo FFmpeg. Zero sessão extra; se o HD falhar, o failover existente devolve ao sub e reagenda com backoff |
| Gravação por evento (`recording.ts`) | Abria sessão nova no main-stream a **cada** detecção de pessoa/veículo/animal, sem `-timeout` | Deriva o clipe do MPEG-TS que a puxada única já produz e remuxa para MP4 (`-c copy`). Só usa RTSP se não houver puxada ativa — e agora com `-timeout` |
| Detecção de movimento (`motionDetection.ts`) | Sessão RTSP própria **e** escrevia no mesmo `liveframes/<id>.jpg` que o streaming — duas escritas simultâneas corrompiam o snapshot | Consome `pipe:4` da puxada única, como a IA já fazia com `pipe:3` |
| Varredura de 59 URLs (`streaming.ts`) | A cada queda, disparava 59 conexões RTSP em ~2min, em loop (visível no log como "tentativa 1/59"…"59/59") | A URL que entrega o 1º quadro vira `workingUrl` e é a única usada nas reconexões. Só volta a varrer após 5 falhas seguidas |
| HLS (`hlsManager.ts`) | Abria o main-stream 8MP quando alguém acessava pelo celular | Usa o sub-stream e tem `-timeout` |
| Snapshot (`snapshotService.ts`) | Até 6 sessões RTSP por captura, a cada 5s | 2 tentativas no sub + 1 no main; janela do quadro em cache subiu de 3s para 10s |

### Causa raiz 2: processo principal bloqueado
`secrets.ts` derivava a chave com **PBKDF2-SHA512 de 100k iterações, síncrono e sem cache**
(~50ms medidos), e `rowToCamera` chama isso 3× por câmera. Com `listCameras()` sendo chamado
a cada 5s (UI), 15s (monitor), 20s (detecção) e 30s (gravação/retenção), o main ficava
**~5,8s bloqueado por minuto** — e main bloqueado não drena o FFmpeg nem alimenta o
WebSocket, o que aparece como imagem travando. Com o cache por salt: **0,002s/min**.

Outros gargalos do mesmo tipo: `getStorageUsage()` fazia `statSync` em todos os snapshots a
cada 5s (agora com cache de 60s); `indexSegments` reexaminava todos os segmentos em disco a
cada 30s com consulta sem índice (agora incremental + índice `idx_recordings_filepath`);
`camera_logs` não tinha poda nenhuma e "Conexão TCP OK" gravava uma linha a cada 15s por
câmera (4.800 das 8.400 linhas do banco) — agora só registra mudança de estado.

### Também corrigido
- Watchdog usava o timeout de `high` mesmo depois do failover para `low` (lia a qualidade uma
  única vez, na criação).
- `aiVerifier.ts` criava uma `InferenceSession` ONNX por chamada e nunca liberava.
- `connectionMonitor` notificava a UI a cada ciclo, re-renderizando a grade inteira sem
  mudança nenhuma.
- Backpressure no WebSocket de vídeo: sem teto, um renderer lento fazia o `ws` acumular
  vídeo na memória do main indefinidamente.

### Como verificar
```
npm run check:stream   # 5 saídas da puxada única, clipe de evento, guarda anti-RTSP paralelo
npm run check:boot     # app inicializa e roda um ciclo dos managers sem erro
```
No servidor, depois de rodar **3h ou mais** (para passar dos 40min e do antigo ciclo do probe):
1. `Get-Process ffmpeg` deve mostrar **1 processo por câmera ativa** (antes: 2+ após 30min).
2. Nenhum log com "Probe" — o caminho não existe mais.
3. "Conexão perdida" e "Stream travado" devem despencar (a mediana era 103s entre quedas).
4. `[metrics]` no `main.log` não deve subir monotonicamente.

### AINDA PENDENTE — fora do código
1. **Reserva de IP no roteador** para o MAC da câmera (`f8:16:0c:23:f1:8a`). O IP alternando
   entre .10 e .28 derruba o stream sozinho, e nenhuma correção de software evita isso.
2. **PC servidor no cabo.** Câmera e PC disputando o mesmo WiFi é o pior caso para 8MP.
3. **Baixar o main-stream na câmera** (8MP → 4MP, ou menos FPS/bitrate).
4. **Ligar a aceleração de hardware** — está em `none`. Com Intel (QSV) ou NVIDIA (NVENC) o
   decode sai da CPU.

---

## v0.1.15 → v0.1.16 (09/07/2026)

### O que foi feito

#### 1. Criptografia portátil (DPAPI → AES-256-GCM)
**Arquivo:** `electron/core/secrets.ts`

- **Problema:** `safeStorage` do Electron usa DPAPI, que prende a criptografia ao usuário+máquina Windows. O banco SQLite não funcionava ao copiar entre PCs.
- **Solução:** Substituído por AES-256-GCM com PBKDF2 (enc:v2:). O salt é armazenado junto com o ciphertext, permitindo descriptografar em qualquer máquina.
- **Migração automática:** `cameraRepository.ts` converte registros enc:v1: → enc:v2: na inicialização. Se DPAPI falhar, limpa o campo para evitar crash.

#### 2. Correção de `injectCredentials`
**Arquivo:** `electron/core/onvifInfo.ts:129-134`

- **Problema:** URL quebrava se `username` fosse vazio (injetava `:@` no host).
- **Solução:** Se username vazio, retorna URL original sem alterações.

#### 3. Captura de stderr do FFmpeg
**Arquivo:** `electron/core/streaming.ts`

- **Problema:** Sem diagnóstico quando FFmpeg falhava em conectar.
- **Solução:** stderr do FFmpeg é capturado (buffer de 4KB) e incluído nos logs de erro.

#### 4. Fallback de caminhos RTSP
**Arquivo:** `electron/core/streaming.ts`

- **Problema:** Câmeras Xiongmai XM533 X3-WQ-B retornam URL genérica `/` no ONVIF, mas precisam de `/onvif1`.
- **Solução:** Quando o FFmpeg fecha sem receber dados (sem sinal), o sistema tenta automaticamente dezenas de caminhos RTSP alternativos cobrindo ~95% das marcas do mercado:

| Fabricante | Paths |
|-----------|-------|
| Xiongmai | `/onvif1` |
| Hikvision / HiLook | `/h264/ch1/main/av_stream`, `/h265/ch1/main/av_stream`, etc. |
| Dahua / Intelbras / Amcrest | `/cam/realmonitor?channel=1&subtype=0`, etc. |
| TP-Link | `/stream1`, `/stream2`, `/live/ch0` |
| Reolink | `/h264Preview_01_main`, `/preview`, etc. |
| Axis | `/axis-media/media.amp`, etc. |
| Foscam | `/video`, `/h264_stream` |
| Uniview (UNV) | `/avstream/channel=1/stream=0`, etc. |
| Vivotek | `/live.sdp`, etc. |
| Samsung / Hanwha | `/streaming/channels/1/`, etc. |
| Bosch | `/0/stream`, etc. |
| Wansview / Sricam / OEM | `/11`, `/12`, `/av0` |
| Sony | `/video`, `/h264` |
| ACTi | `/mjpeg/video.mjpeg` |

- **Mecanismo:** Cada tentativa falha é registrada com qual URL foi testada. Após esgotar todos os fallbacks, o ciclo recomeça com delay normal de reconexão.
- **Ordem:** Paths mais prováveis primeiro (Xiongmai → Hikvision → Dahua → TP-Link → Reolink → demais).

### Para testar no PC servidor

1. Copiar `release\win-unpacked\` (portátil) OU instalar `release\SecureVision Local-Setup-0.1.16.exe`
2. Rodar e verificar os logs no modal "Ver logs da câmera"
3. O log agora mostra qual URL RTSP está sendo tentada e quantas restam
4. Se ainda falhar, verificar no log se o FFmpeg stderr mostra algo como "404" ou "path not found"

#### 5. Correção de `injectCredentials` no HLS Manager
**Arquivo:** `electron/server/hlsManager.ts:75`

- **Problema:** `hlsManager.ts` usava `camera.streamUrl` diretamente no FFmpeg sem chamar `injectCredentials()`, ao contrário de todos os outros consumidores (`streaming.ts`, `continuousRecording.ts`, `recording.ts`, `snapshotService.ts`, `motionDetection.ts`). O streaming HLS quebrava para câmeras cuja URL não tinha `user:pass@` embutido.
- **Solução:** Adicionado `injectCredentials(camera.streamUrl, camera.username, camera.password)` no argumento `-i` do FFmpeg.

#### 6. Fallback RTSP sempre ativo (mesmo com path específico)
**Arquivo:** `electron/core/streaming.ts:232-252`

- **Problema:** `buildUrlCandidates()` só adicionava paths de fallback se o path da URL original fosse vazio ou `/`. Câmeras cujo ONVIF retornava um path específico (ex: Xiongmai retorna `/onvif1`) mas que falhava na prática ficavam com 1 tentativa só (`tentativa 1/1`), sem nunca tentar os outros 58 paths.
- **Solução:** Fallbacks são sempre adicionados após a URL original, independente do path. Inclui deduplicação para não repetir a mesma URL se o path original já coincidir com um fallback.

### Problemas conhecidos

- Se todas as URLs falharem, o sistema entra em loop: testa todos fallbacks → espera 3s → repete do início. Isso gera logs mas não danifica nada.
- Algumas câmeras muito antigas podem usar paths não listados. A lista pode ser expandida via `RTSP_FALLBACK_PATHS` em `streaming.ts`.

---

## v0.1.16 → v0.1.36 (09/07/2026)

### O que foi feito

#### 1. Correção de `injectCredentials` para URLs com credenciais duplicadas
**Arquivo:** `electron/core/onvifInfo.ts:128-148`

- **Problema:** Quando a URL já continha `user:pass@` (auth padrão) E também tinha credenciais path-based (`user=...&password=...`) — formato Xiongmai — a câmera rejeitava com "Operation not permitted".
- **Solução:** Se a URL tem `@` E tem path-based creds, a parte `user:pass@` é removida, mantendo apenas as path-based. Exemplo: `rtsp://foo:bar@ip:554/user=pwms_password=xGDon0HN...` → `rtsp://ip:554/user=pwms_password=...`

#### 2. Captura de stderr do FFmpeg no snapshot
**Arquivo:** `electron/core/snapshotService.ts:77-88`

- **Problema:** Quando snapshot falhava, não havia diagnóstico do erro FFmpeg.
- **Solução:** `run()` agora captura stderr do FFmpeg e loga via `console.warn` quando código de saída é não-zero. Stderr truncado em 500 chars.

#### 3. Correção de `-stimeout` incompatível
**Arquivo:** `electron/core/snapshotService.ts:66-74`

- **Problema:** O FFmpeg embutido (6.1.1-essentials_build) não reconhece `-stimeout` (opção específica RTSP que depende da build). Causava "Unrecognized option" e falha na captura.
- **Solução:** Substituído por `-timeout` (opção genérica compatível com todas as builds).

#### 4. Handler IPC de recaptura de snapshot
**Arquivo:** `electron/ipc/handlers.ts:333-349`

- **Problema:** Presets salvos sem snapshot de referência ficavam permanentemente sem imagem. Não havia como recapturar sem atualizar a posição inteira.
- **Solução:** Novo handler `ptz:recapture-snapshot` que recebe `presetId`, busca câmera, chama `captureJpeg` com prioridade de stream principal, atualiza DB e regera embedding AI.

#### 5. Botão "Recapturar" na UI
**Arquivo:** `src/components/PTZTourPanel.tsx`

- **Solução:** Para presets sem `snapshotPath`, exibe botão "📷 Recapturar" que aciona o handler de recaptura. Mostra "⏳…" durante processamento.

#### 6. Fix: Perda de conexão de câmera
**Arquivo:** `electron/core/streaming.ts`

- **Problema:** Câmeras perdiam conexão facilmente (especialmente via WiFi). 3 causas identificadas:
  1. Sem `-timeout` no FFmpeg de streaming (mesmo problema que existia no snapshot)
  2. Watchdog agressivo: `STALL_TIMEOUT_MS = { high: 15000, low: 25000 }` — pouco para WiFi flaky
  3. Sem backoff exponencial: sempre reconectava após 3s fixo
- **Solução:**
  - `STALL_TIMEOUT_MS` → `{ high: 30000, low: 45000 }` (2x mais tolerante)
  - `-timeout 10000000` adicionado aos args FFmpeg de streaming E ao probe
  - Backoff exponencial: `min(3000 * 2^reconnectCount, 30000)`, resetado ao receber primeiro frame

### Para testar no PC servidor

1. Instalar `release\SecureVision Local-Setup-0.1.36.exe`
2. Rodar e verificar se as câmeras Xiongmai conectam sem "Operation not permitted"
3. Salvar preset PTZ e verificar se snapshot é capturado com sucesso
4. Se snapshot falhar, verificar logs — agora mostra stderr do FFmpeg
5. Para testar reconexão: desconectar/reconectar cabo da câmera e observar reconexão automática com backoff

### Arquivos modificados

- `electron/core/onvifInfo.ts` — `injectCredentials()` fix
- `electron/core/snapshotService.ts` — stderr logging, `-stimeout` → `-timeout`
- `electron/ipc/handlers.ts` — recapture IPC handler
- `src/shared/ipc.ts` — IPC channel + type
- `electron/preload.ts` — preload bridge
- `src/components/PTZTourPanel.tsx` — recapture button
- `electron/core/streaming.ts` — stalls timeout, `-timeout`, backoff reconexão
