# Guia de Instalação - SecureVision Local

## Pré-requisitos

### Sistema Operacional

| Sistema | Versão Mínima |
|---------|---------------|
| Windows | Windows 10+ (WSL2) |
| macOS | macOS 12+ |
| Linux | Ubuntu 20.04+ |

### Ferramentas Obrigatórias

| Ferramenta | Versão | Instalação |
|------------|--------|------------|
| Node.js | >= 22.11.0 | [nodejs.org](https://nodejs.org) |
| npm | >= 10.x | Já Included com Node.js |
| Java JDK | 17+ | [Adoptium](https://adoptium.net) |
| Android Studio | Latest | [developer.android.com](https://developer.android.com/studio) |
| Xcode | 15+ | Mac App Store (iOS only) |

### Variáveis de Ambiente

Adicione ao seu `~/.bashrc` ou `~/.zshrc`:

```bash
# Java
export JAVA_HOME=/caminho/para/jdk-17
export PATH=$JAVA_HOME/bin:$PATH

# Android SDK
export ANDROID_HOME=/cUsers/seuusuario/Library/Android/sdk
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH
```

## Instalação no Windows

### 1. Configure o WSL2

```powershell
# Abra o PowerShell como Administrador
wsl --install
```

### 2. Configure o ambiente Linux dentro do WSL

```bash
# Atualize
sudo apt update && sudo apt upgrade -y

# Instale Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instale ferramentas adicionais
sudo apt install -y python3 make g++ git
```

### 3. Clone e configure

```bash
cd /mnt/c/Users/rober/Desktop/SecureVisionLocalRoot/SecureVisionLocal

npm install
```

## Instalação no macOS

```bash
# Instale Node.js via Homebrew
brew install node@22

# Clone o projeto
git clone https://github.com/seu-repo/SecureVisionLocal.git
cd SecureVisionLocal/SecureVisionLocal

# Instale dependências
npm install
```

## Instalação no Linux (Ubuntu)

```bash
# Configure o repositório Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -

# Instale o Node.js e dependências
sudo apt-get install -y nodejs build-essential python3 libglib2.0-0

# Clone e instale
git clone https://github.com/seu-repo/SecureVisionLocal.git
cd SecureVisionLocal/SecureVisionLocal

npm install
```

## Configuração do Android

### 1. Android Studio

1. Download Android Studio de [developer.android.com](https://developer.android.com/studio)
2. Durante a instalação, selecione:
   - Android SDK
   - Android SDK Platform
   - Android SDK Build-Tools
   - Android SDK Platform-Tools

### 2.Aceite licenças

```bash
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
```

### 3. Instale plataformas

```bash
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-35" "build-tools;35.0.0"
```

## Configuração do iOS (macOS only)

### 1. Instale o Xcode

Baixe do Mac App Store e abra para instalar componentes.

### 2. Instale CocoaPods

```bash
# Ruby (já Included no macOS)
sudo gem install cocoapods

# Instale pods do projeto
cd SecureVisionLocal/ios
pod install
```

## Execução

### Modo Desenvolvimento

```bash
# Inicie o servidor Metro
npm start

# Build e execute no Android
npm run android

# Build e execute no iOS
npm run ios
```

### Build de Produção

#### Android APK

```bash
# Debug APK
cd android
./gradlew assembleDebug

# Release APK (requer assinatura)
./gradlew assembleRelease
```

O APK será gerado em `android/app/build/outputs/apk/`

#### iOS

1. Abra `ios/SecureVisionLocal.xcworkspace` no Xcode
2. Selecione Device > Build
3. Archive para TestFlight/App Store

## Solução de Problemas

### "command not found: node"

Desconecte e reconecte o terminal, ou adicione ao PATH:

```bash
export PATH=$PATH:/usr/local/bin:/usr/local/npm/bin
```

### "JAVA_HOME not set"

```bash
export JAVA_HOME=/caminho/para/jdk-17
```

### "ANDROID_HOME not set"

```bash
export ANDROID_HOME=/Users/seuusuario/Library/Android/sdk
```

### Erro de permissão no Android

```bash
cd android
chmod +x gradlew
```

### Problemas com dependências nativas

```bash
# Limpe e reinstale
rm -rf node_modules
rm -rf android/app/build
npm install
```

## Comandos Úteis

```bash
# Servidor Metro
npm start

# Executar Android
npm run android

# Executar iOS
npm run ios

# Executar testes
npm test

# Verificar lint
npm run lint

# Limpar build
cd android && ./gradlew clean
```

## Links Úteis

- [React Native Docs](https://reactnative.dev/docs)
- [Android Studio](https://developer.android.com/studio)
- [Node.js](https://nodejs.org)