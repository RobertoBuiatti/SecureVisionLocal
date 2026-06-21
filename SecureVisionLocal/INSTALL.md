# Guia de Instalação - SecureVision Local

Este guia cobre a instalação do **software Windows** (produto principal) e do **app mobile companheiro** (Fase B).

---

## Parte 1 — Software Windows

### 1.1 Instalação para Usuário Final

1. Baixe o instalador `SecureVisionLocal-Setup.exe` (ou `.msi`).
2. Execute e siga o assistente (escolha a pasta de instalação).
3. Na primeira execução, defina:
   - Pasta/disco para **gravações** (recomenda-se um HDD/SSD dedicado).
   - Conta de **administrador local** do sistema.
4. Use a **descoberta automática** para localizar as câmeras WiFi na sua rede.

> **Dica:** o PC deve estar na **mesma rede local** das câmeras WiFi. Para gravação 24/7, mantenha o PC ligado ou instale o **modo serviço** (ver 1.5).

### 1.2 Requisitos de Sistema

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| SO | Windows 10 64-bit | Windows 11 64-bit |
| CPU | Dual-core 2.0 GHz | Quad-core+ com QSV/NVENC |
| RAM | 4 GB | 8 GB+ (16 GB p/ muitas câmeras) |
| GPU | Integrada | Dedicada (NVIDIA/Intel/AMD) p/ aceleração |
| Disco | 500 MB (app) + espaço p/ gravações | SSD (sistema) + HDD dedicado (gravações) |
| Rede | WiFi/Ethernet na LAN das câmeras | Ethernet Gigabit |

---

## Parte 2 — Ambiente de Desenvolvimento (Software Windows)

### 2.1 Ferramentas Obrigatórias

| Ferramenta | Versão | Instalação |
|------------|--------|------------|
| Node.js | >= 22.11.0 | [nodejs.org](https://nodejs.org) |
| npm | >= 10.x | Incluído com o Node.js |
| Git | Latest | [git-scm.com](https://git-scm.com) |
| Build Tools (C++) | Latest | `npm install --global windows-build-tools` ou Visual Studio Build Tools (necessário p/ `better-sqlite3` e nativos) |
| Python | 3.x | Necessário para node-gyp (compilar nativos) |
| FFmpeg | (via `ffmpeg-static`) | Instalado como dependência npm; opcionalmente FFmpeg no PATH |

> O software roda em **Windows** nativamente — **não** use WSL para desenvolvimento, pois o acesso a hardware (GPU, rede, discos) e o empacotamento `.exe` exigem o host Windows.

### 2.2 Clonar e Instalar

```powershell
# PowerShell
git clone https://github.com/seu-repo/SecureVisionLocal.git
cd SecureVisionLocal\SecureVisionLocal

# Instale as dependências
npm install

# Rebuild de módulos nativos para o Electron (SQLite, ONNX)
npm run rebuild
```

### 2.3 Executar em Desenvolvimento

```powershell
# Inicia o renderer (Vite/Metro) + Electron com hot reload
npm run dev
```

### 2.4 Gerar o Instalador Windows

```powershell
# Build de produção + empacotamento .exe/.msi (electron-builder)
npm run build:win

# Saída em: dist/
#   SecureVisionLocal-Setup.exe
#   SecureVisionLocal-x.y.z.msi
```

### 2.5 Modo Serviço (Gravação 24/7)

Para gravar mesmo sem login interativo, instale o componente como **serviço do Windows**:

```powershell
# Executar como Administrador
npm run install-service       # registra o serviço SecureVisionLocal
# Gerenciar:
sc query SecureVisionLocal
sc stop SecureVisionLocal
sc start SecureVisionLocal
```

### 2.6 Aceleração por Hardware

Para decodificar muitas câmeras com baixo uso de CPU, ative a aceleração em **Configurações → Desempenho**:

| GPU | Backend FFmpeg |
|-----|----------------|
| NVIDIA | NVDEC / CUDA |
| Intel | Quick Sync (QSV) |
| AMD | AMF / D3D11VA |

Verifique se os drivers da GPU estão atualizados.

---

## Parte 3 — App Mobile Companheiro (Fase B)

> Concluído após o software Windows. O app é um **cliente** que se conecta ao servidor local do software.

### 3.1 Ferramentas

| Ferramenta | Versão |
|------------|--------|
| Node.js | >= 22.11.0 |
| Java JDK | 17+ ([Adoptium](https://adoptium.net)) |
| Android Studio | Latest (Android) |
| Xcode | 15+ (iOS, somente macOS) |

### 3.2 Build e Execução

```bash
cd mobile

npm install

# Android
npm run android

# iOS (macOS)
cd ios && pod install && cd ..
npm run ios
```

### 3.3 Conectar ao Software Windows

No app, informe o **endereço do servidor local** (IP do PC + porta, ex.: `192.168.1.10:8080`) e faça o pareamento/login. Para acesso fora da LAN, configure VPN ou DDNS (ver [docs/SECURITY.md](docs/SECURITY.md)).

---

## Solução de Problemas

### `node-gyp` / falha ao compilar nativos (Windows)
Instale o Visual Studio Build Tools (workload "Desktop development with C++") e o Python 3.x, depois:
```powershell
npm config set msvs_version 2022
npm run rebuild
```

### `better-sqlite3` / `onnxruntime` não carrega no Electron
Rode o rebuild para a ABI do Electron:
```powershell
npm run rebuild   # usa electron-rebuild
```

### Câmera WiFi não aparece na descoberta
- Confirme que o PC e a câmera estão na **mesma sub-rede**.
- Verifique se o **ONVIF** está habilitado na câmera.
- Libere as portas no Firewall do Windows (RTSP 554, ONVIF, HTTP).
- Use a **adição manual** por URL RTSP (catálogo por fabricante).

### Alto uso de CPU com muitas câmeras
- Use **substream** na grade.
- Ative **aceleração por hardware** (2.6).
- Reduza FPS/resolução das câmeras secundárias.

### Disco enchendo rápido
- Ajuste **retenção** e **reciclagem automática** em Configurações → Armazenamento.
- Direcione gravações para um HDD dedicado.

---

## Comandos Úteis

```powershell
npm run dev            # Desenvolvimento (Electron + renderer)
npm run build:win      # Gera instalador .exe/.msi
npm run rebuild        # Rebuild de módulos nativos p/ Electron
npm test               # Testes
npm run lint           # Lint
npm run install-service  # Instala serviço do Windows (admin)
```

## Links Úteis

- [Electron](https://www.electronjs.org)
- [electron-builder](https://www.electron.build)
- [FFmpeg](https://ffmpeg.org)
- [ONVIF](https://www.onvif.org)
- [Node.js](https://nodejs.org)
