<h1 align="center">🖥️ SecureVision Local</h1>

<p align="center">
  Transforme o seu PC em uma central de monitoramento (NVR/VMS) para câmeras WiFi e IP.<br>
  <b>100% offline. Sem nuvem. Sem mensalidade.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-2C2E3B?style=for-the-badge&logo=electron&logoColor=9FEAF9" alt="Electron" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white" alt="FFmpeg" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
</p>

---

## 🎯 O problema

Câmeras WiFi baratas vêm com apps limitados: poucas câmeras simultâneas, gravação presa a uma assinatura mensal e todo o vídeo passando por servidores de terceiros. Quem quer dezenas de câmeras, gravação contínua e privacidade real acaba precisando de um NVR dedicado.

O **SecureVision Local** resolve isso por software: o computador que você já tem vira a central de gravação, e nada sai da sua rede.

## ⚖️ Comparativo

| | Apps típicos de câmera | SecureVision Local |
| --- | --- | --- |
| Plataforma principal | App mobile limitado | Software Windows completo |
| Armazenamento | Nuvem | Local (HDD, SSD ou NAS) |
| Câmeras simultâneas | Poucas | Dezenas (grade até 8x8) |
| Gravação 24/7 | Restrita ou paga | Ilimitada e local |
| Custo recorrente | Assinatura mensal | Nenhum |
| Privacidade | Depende de terceiros | Controle total do usuário |

## ✨ Principais funcionalidades

### 📡 Câmeras WiFi e IP
- Descoberta automática na rede via ONVIF WS-Discovery, mDNS, SSDP e varredura de IP/porta
- Suporte a RTSP, ONVIF (Profile S/T), HTTP/MJPEG, RTMP e HLS
- Catálogo de URLs RTSP por fabricante (Hikvision, Dahua, Intelbras, Tapo, Reolink e outros)
- Reconexão automática e monitor de saúde com status, FPS e latência

### 🎛️ Monitoramento multi-câmera
- Grades 1x1, 2x2, 3x3, 4x4, 1+5, 8x8 e layouts personalizados
- Suporte a múltiplos monitores (video wall) e substream automático na grade
- Controle PTZ completo com presets e tours automáticos
- Zoom digital, overlays de timestamp/nome/status e modo cíclico

### 💾 Gravação local (NVR por software)
- Gravação contínua 24/7, por movimento ou por evento, com pré e pós-buffer
- Armazenamento em disco local ou NAS, com retenção e reciclagem automática
- Criptografia opcional das gravações
- Player com timeline multi-câmera e exportação em MP4/AVI

### 🧠 Inteligência local
- Detecção de movimento com zonas de interesse
- Detecção de pessoas, veículos e animais por machine learning **executado na própria máquina** (ONNX / TensorFlow.js)
- Tripwire e detecção de intrusão de área, com alertas em tempo real

### ⚙️ Automação e acesso
- Motor de regras do tipo "se houver movimento na zona X, então execute Y"
- Integração com IoT local via MQTT, Zigbee e Z-Wave
- Servidor local REST + WebRTC, base para integrações e para o app mobile
- Usuários, permissões e log de auditoria

### 🪟 Integração com o Windows
- Ícone na bandeja, inicialização com o sistema e modo serviço
- Notificações nativas e aceleração por hardware (NVDEC / QSV)
- Instalador .exe/.msi com auto-update

## 📱 App mobile companheiro

Um cliente React Native (Android/iOS) se conecta ao servidor local do software para visualização ao vivo, reprodução de gravações, controle PTZ, notificações de eventos e áudio bidirecional. **Toda a gravação, detecção e automação continuam rodando no software Windows** — o app é apenas um cliente.

## 📂 Estrutura do repositório

```
.
└── SecureVisionLocal/
    ├── desktop/          # Software Windows (Electron) — produto principal
    │   ├── electron/     # Processo main: discovery, FFmpeg, ML, banco e servidor local
    │   └── src/          # Renderer (UI em React + TypeScript)
    ├── mobile/           # App React Native (cliente companheiro)
    └── shared-types/     # Tipos TypeScript compartilhados
```

Documentação detalhada dentro de [SecureVisionLocal/](./SecureVisionLocal): `README.md`, `INSTALL.md` e `ARCHITECTURE.md`.

## 🚀 Como rodar em desenvolvimento

### Pré-requisitos

- Windows 10 ou 11 (64 bits)
- Node.js 22.11.0 ou superior
- Git

```bash
git clone https://github.com/RobertoBuiatti/SecureVisionLocal.git
cd SecureVisionLocal/SecureVisionLocal

npm install
npm run dev          # Electron + Vite em modo desenvolvimento
npm run build:win    # gera o instalador .exe/.msi em dist/
```

## 🧱 Stack

| Camada | Tecnologias |
| --- | --- |
| Desktop | Electron, React, TypeScript |
| Vídeo | FFmpeg, RTSP/ONVIF, WebRTC |
| Inteligência | ONNX Runtime, TensorFlow.js |
| Dados | SQLite |
| Mobile | React Native |

## 🔒 Privacidade

Nenhum quadro de vídeo, gravação ou metadado é enviado para servidores externos. Todo o processamento — inclusive a inferência de machine learning — acontece na máquina do usuário.

## 👤 Autor

**Roberto Buiatti** — [GitHub](https://github.com/RobertoBuiatti) · [LinkedIn](https://www.linkedin.com/in/roberto-buiatti-10b403143)
