# HANGOFF — SecureVision Desktop

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
