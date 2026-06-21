# SecureVision Local

> Software de monitoramento e segurança 100% offline para **Windows**, com app mobile companheiro. Transforme seu PC em uma central (NVR) para câmeras WiFi/IP.

[![Platform](https://img.shields.io/badge/Plataforma-Windows%2010%20%7C%2011-0078D6?style=flat&logo=windows)](https://www.microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-React%20%2B%20TypeScript-47848F?style=flat&logo=electron)](https://www.electronjs.org)
[![Mobile](https://img.shields.io/badge/Companion-Android%20%7C%20iOS-555?style=flat)](#-app-mobile-companheiro-fase-b)
[![License](https://img.shields.io/badge/License-MIT-000000?style=flat)](LICENSE)

## 🖥️ Visão Geral

O **SecureVision Local** é um **software para Windows** que transforma o seu computador em uma central de monitoramento (VMS/NVR por software) para **câmeras WiFi e IP**, funcionando 100% offline, sem nuvem. Total controle do usuário sobre câmeras, gravações e automações.

Um **app mobile companheiro** (Android/iOS) se conecta ao software para acesso remoto/local — concluído na fase seguinte do projeto.

> **Ordem de entrega:** primeiro o **software Windows** (produto principal), depois a conclusão do **app mobile** (cliente).

### ✨ Diferenciais

| Característica | Apps típicos | SecureVision Local |
|----------------|--------------|--------------------|
| Plataforma principal | App mobile limitado | **Software Windows completo** |
| Armazenamento | Nuvem | 100% Local (HDD/SSD/NAS) |
| Câmeras simultâneas | Poucas | Dezenas (grade até 8x8) |
| Gravação 24/7 | Restrita/paga | Ilimitada e local |
| Custos | Assinatura mensal | Grátis |
| Privacidade | Serviços externos | Total controle |

## 🚀 Funcionalidades do Software Windows

### Câmeras WiFi/IP
- **Descoberta automática** na rede (ONVIF WS-Discovery, mDNS, SSDP, scan de IP/porta)
- **Assistente de adição** com detecção de ONVIF/RTSP, teste e preview
- Protocolos **RTSP, ONVIF (Profile S/T), HTTP/MJPEG, RTMP, HLS**
- Catálogo de URLs RTSP por fabricante (Hikvision, Dahua, Intelbras, Tapo, Reolink, etc.)
- Reconexão automática e monitor de saúde (online/offline/FPS/latência)

### Monitoramento Multi-Câmera
- Grades **1x1, 2x2, 3x3, 4x4, 1+5, 8x8** e layouts personalizados
- **Múltiplos monitores** (video wall) e substream automático na grade
- Controle **PTZ** completo com presets e tours (ciclo automático)
- Zoom digital, overlays (timestamp, nome, status), modo cíclico

### Gravação Local (NVR por Software)
- **Gravação contínua 24/7**, por movimento ou por evento (pré/pós-buffer)
- Armazenamento em disco local/NAS, **retenção e reciclagem automática**
- Criptografia opcional; **player com timeline** multi-câmera e exportação (MP4/AVI)

### Inteligência Local
- Detecção de **movimento** com zonas de interesse
- Detecção de **pessoas, veículos e animais** (ML local — ONNX/TFJS, sem nuvem)
- Tripwire/intrusão de área e alertas em tempo real

### Automação e Acesso
- Motor de **regras** ("se movimento na zona X, então...") e ações
- Integração **IoT local** (MQTT/Zigbee/Z-Wave)
- **Servidor local REST + WebRTC** (base para o app mobile e integrações)
- Usuários, permissões e **log de auditoria**

### Integração com Windows
- **Bandeja do sistema**, **inicialização com o Windows**, **modo serviço**
- Notificações nativas e **aceleração por hardware** (NVDEC/QSV)
- Instalador **.exe/.msi** com auto-update

## 📱 App Mobile Companheiro (Fase B)

Concluído após o software Windows. Conecta-se ao **servidor local** do software para:
- Visualização ao vivo e reprodução de gravações
- Controle PTZ e presets/tours
- Notificações push locais de eventos
- Áudio bidirecional, widget e dark mode

> O app é um **cliente**: gravação, detecção e automação rodam no software Windows.

## 📦 Instalação

### Usuário final (Windows)
Baixe o instalador `SecureVisionLocal-Setup.exe`, execute e siga o assistente. Detalhes em [INSTALL.md](INSTALL.md).

### Desenvolvimento

```bash
# Pré-requisitos: Node.js >= 22.11.0, Git, Windows 10/11 64-bit

# Clone o repositório
git clone https://github.com/seu-repo/SecureVisionLocal.git
cd SecureVisionLocal/SecureVisionLocal

# Instale as dependências
npm install

# Rode o software desktop em modo desenvolvimento
npm run dev          # inicia Electron + Vite/Metro (renderer)

# Gere o instalador Windows
npm run build:win    # produz .exe/.msi em dist/
```

Para o app mobile (Fase B), veja a seção mobile em [INSTALL.md](INSTALL.md).

## 📂 Estrutura do Projeto

```
SecureVisionLocal/
├── desktop/              # Software Windows (Electron) — produto principal
│   ├── electron/         # Main process (Node.js): discovery, FFmpeg, ML, DB, server
│   └── src/              # Renderer (UI React + TypeScript)
├── mobile/              # App React Native (cliente companheiro — Fase B)
└── shared-types/        # Tipos TypeScript compartilhados
```

Consulte [ARCHITECTURE.md](ARCHITECTURE.md) para detalhes.

## 🛠️ Stack Tecnológica

| Componente | Tecnologia |
|------------|------------|
| Shell desktop | Electron + electron-builder |
| UI | React 19 + TypeScript |
| Estado | Zustand |
| Vídeo | FFmpeg (RTSP/transcode) + JSMpeg/mpegts/WebRTC |
| Câmeras | onvif / node-ssdp / bonjour-service |
| Banco de dados | SQLite (better-sqlite3) |
| ML local | onnxruntime-node / TensorFlow.js |
| Servidor local | Fastify/Express + ws |
| Mobile (Fase B) | React Native + react-native-video/webrtc |

## 📄 Documentação

| Documento | Descrição |
|----------|------------|
| [INSTALL.md](INSTALL.md) | Guia de instalação (desktop + mobile) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitetura técnica |
| [API.md](API.md) | Referência da API local |
| [CHANGELOG.md](CHANGELOG.md) | Histórico de mudanças |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Guia de contribuição |
| [docs/FEATURES.md](docs/FEATURES.md) | Visão geral das funcionalidades |
| [docs/SERVICES.md](docs/SERVICES.md) | Serviços do núcleo |
| [docs/STORES.md](docs/STORES.md) | Gerenciamento de estado |
| [docs/SECURITY.md](docs/SECURITY.md) | Segurança |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Solução de problemas |

## 🤝 Contribuição

Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## 📝 Licença

MIT License - veja [LICENSE](LICENSE).

---

**SecureVision Local** - Sua central de câmeras WiFi no Windows. Sem nuvem, sem mensalidade.
