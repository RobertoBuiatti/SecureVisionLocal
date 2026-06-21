import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import { join } from 'node:path';
import { registerIpcHandlers } from './ipc/handlers';
import { getDb, closeDb } from './core/db';
import { streamingService } from './core/streaming';
import { IPC } from '../src/shared/ipc';
import { recordingService } from './core/recording';
import { recordingManager } from './core/recordingManager';
import { tourRunner } from './core/tourRunner';
import { detectionManager } from './core/detectionManager';
import { motionDetectionService } from './core/motionDetection';
import { aiDetectionService } from './core/ai/aiDetection';
import { connectionMonitor } from './core/connectionMonitor';
import { positionVerifier } from './core/positionVerifier';
import { localServer } from './server/localServer';

// Diretórios gerados pelo build (vite-plugin-electron).
process.env.DIST = join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : join(__dirname, '../public');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuiting = false;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// Captura erros não tratados do processo principal no log.
process.on('uncaughtException', (err) => {
  console.log(`[main:uncaughtException] ${err?.stack || err}`);
});
process.on('unhandledRejection', (reason) => {
  console.log(`[main:unhandledRejection] ${reason}`);
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0f1115',
    title: 'SecureVision Local',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(join(process.env.DIST!, 'index.html'));
  }

  // Diagnóstico: encaminha console e erros do renderer para o stdout do main (dev.log).
  mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${level}] ${message} (${source}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.log(`[renderer:did-fail-load] ${code} ${desc}`);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.log(`[renderer:gone] ${JSON.stringify(details)}`);
  });
  mainWindow.webContents.on('preload-error', (_e, path, error) => {
    console.log(`[preload-error] ${path} ${error?.message}`);
  });

  // Fechar no X minimiza para a bandeja (mantém gravação 24/7 em segundo plano).
  mainWindow.on('close', (e) => {
    if (!isQuiting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('SecureVision Local');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir SecureVision Local',
      click: () => {
        mainWindow?.show();
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow?.show());
}

// Instância única (evita múltiplas gravações simultâneas do mesmo sistema).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    getDb(); // inicializa/migra o banco
    registerIpcHandlers(() => mainWindow);
    // Encaminha o status dos streams (running/erro) para a UI.
    streamingService.setNotifier((e) => mainWindow?.webContents.send(IPC.evtStreamStatus, e));
    motionDetectionService.setNotifier((ev) => mainWindow?.webContents.send(IPC.evtDetection, ev));
    aiDetectionService.setNotifier((ev) => mainWindow?.webContents.send(IPC.evtDetection, ev));
    recordingManager.start(); // inicia gravação 24/7 + retenção/reciclagem
    detectionManager.start(); // inicia a detecção de movimento configurada
    tourRunner.resumePersisted(); // retoma rotas PTZ que estavam rodando ao fechar
    connectionMonitor.start((p) => mainWindow?.webContents.send(IPC.evtCameraStatus, p));
    positionVerifier.start(); // verifica as posições da rota 2x/dia (IA de imagem)
    localServer.start(); // servidor REST + HLS (app mobile / navegador na LAN)
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  isQuiting = true;
  tourRunner.stopAll(); // mantém a persistência p/ retomar na próxima abertura
  positionVerifier.stop();
  connectionMonitor.stop();
  detectionManager.stop();
  localServer.stop();
  recordingManager.stop();
  streamingService.stopAll();
  recordingService.stopAll();
  closeDb();
});

// Em Windows, mantém o app vivo na bandeja mesmo sem janelas.
app.on('window-all-closed', () => {
  // não encerra: continua em segundo plano (bandeja)
});
