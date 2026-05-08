# SecureVision Local

> Sistema de monitoramento e segurança local 100% offline para Android/iOS

[![React Native](https://img.shields.io/badge/React%20Native-0.85.3-61DAFB?style=flat&logo=react)](https://reactnative.dev)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-000000?style=flat)
[![License](https://img.shields.io/badge/License-MIT-000000?style=flat)](LICENSE)

## 📱 Visão Geral

O **SecureVision Local** é um aplicativo de monitoramento de câmeras de segurança que funciona 100% offline, sem dependência de serviços em nuvem. Total controle do usuário sobre seus dados, gravações e automações.

### ✨ Diferenciais

| Característica | Outros Apps | SecureVision Local |
|----------------|-------------|------------------|
| Armazenamento | Nuvem | 100% Local |
| Acesso | Limitado | Total |
| Custos | Assinatura mensal | Grátis |
| Privacidade | Serviços externos | Total controle |

## 🚀 Funcionalidades Principais

### Monitoramento
- Visualização em tempo real de múltiplas câmeras
- Suporte a protocolos RTSP, ONVIF, HTTP Stream, MJPEG
- Grades de visualização: 1x1, 2x2, 3x3, 4x4
- Controle PTZ completo com tours e presets
- Zoom digital e pan/tilt

### Gravação
- Gravação contínua, por movimento ou manual
- Armazenamento local criptografado
- Política de retenção configurável
- Busca por timeline com miniaturas

### Inteligência Local
- Detecção de movimento com zonas de interesse
- Detecção de pessoas, veículos, animais
- Alertas em tempo real

### Automação
- Regras de automação personalizáveis
- Integração com dispositivos IoT
- API REST local para integração

## 📦 Instalação

### Pré-requisitos

- Node.js >= 22.11.0
- React Native CLI
- Android Studio (Android) / Xcode (iOS)

### Passo a passo

```bash
# Clone o repositório
git clone https://github.com/seu-repo/SecureVisionLocal.git
cd SecureVisionLocal/SecureVisionLocal

# Instale as dependências
npm install

# Execute no Android
npm run android

# Execute no iOS
npm run ios
```

Para instruções detalhadas, veja [INSTALL.md](INSTALL.md).

## 📂 Estrutura do Projeto

```
SecureVisionLocal/
├── src/
│   ├── app/              # App principal
│   ├── features/         # Funcionalidades por domínio
│   ├── shared/          # Código compartilhado
│   │   ├── components/   # Componentes genéricos
│   │   ├── hooks/        # Hooks genéricos
│   │   ├── utils/        # Funções utilitárias
│   │   └── types/        # Tipos globais
│   └── services/         # Serviços de infraestrutura
├── android/              # Projeto Android nativo
└── ios/                 # Projeto iOS nativo
```

Consulte [ARCHITECTURE.md](ARCHITECTURE.md) para detalhes da arquitetura.

## 🛠️ Stack Tecnológica

| Componente | Tecnologia |
|------------|------------|
| Framework | React Native 0.85.3 |
| Estado | Zustand |
| Navegação | React Navigation v7 |
| UI | React Native Paper + Vector Icons |
| Armazenamento | AsyncStorage + react-native-fs |
| Video | react-native-vision-camera |
| ML | TensorFlow Lite |

## 📄 Documentação

| Documento | Descrição |
|----------|------------|
| [INSTALL.md](INSTALL.md) | Guia de instalação |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitetura técnica |
| [API.md](API.md) | Referência da API |
| [CHANGELOG.md](CHANGELOG.md) | Histórico de mudanças |

## 🤝 Contribuição

Quer contribuir? See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📝 Licença

MIT License - see [LICENSE](LICENSE).

---

**SecureVision Local** - Monitoramento sem limites, sem mensais.