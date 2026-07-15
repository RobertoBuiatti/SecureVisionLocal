import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import { join } from 'node:path';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { registerIpcHandlers } from './ipc/handlers';
import { getDb, closeDb } from './core/db';
import { migrateCameraSecrets, mergeDuplicateCameras } from './core/cameraRepository';
import { applyStartWithWindows } from './core/autostart';
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
import { notifyDetection } from './core/alerts';

// Diretório de dados alternativo (testes/execução paralela): isola o banco, as
// thumbnails e a trava de instância única da instalação normal.
if (process.env.SVL_USER_DATA) {
  app.setPath('userData', process.env.SVL_USER_DATA);
}

// Diretórios gerados pelo build (vite-plugin-electron).
process.env.DIST = join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : join(__dirname, '../public');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuiting = false;
let metricsTimer: ReturnType<typeof setInterval> | null = null;
let recycleTimer: ReturnType<typeof setInterval> | null = null;
const RENDERER_RECYCLE_MS = 6 * 60 * 60 * 1000; // recicla o renderer a cada 6h (paliativo)

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// --- Log persistente do processo principal ---------------------------------
// Em produção o console.log do main não vai para lugar nenhum (sem stdout), então
// o motivo de "o app inteiro fica preto" (crash de renderer/GPU) se perdia. Aqui
// espelhamos console.log/error/warn num arquivo rotativo em userData/logs/main.log.
const LOG_DIR = join(app.getPath('userData'), 'logs');
const LOG_FILE = join(LOG_DIR, 'main.log');
const LOG_MAX_BYTES = 5 * 1024 * 1024; // 5 MB → rotaciona mantendo 1 backup (.1)

function writeLog(line: string): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    try {
      if (statSync(LOG_FILE).size > LOG_MAX_BYTES) renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch {
      /* arquivo ainda não existe — segue */
    }
    appendFileSync(LOG_FILE, line);
  } catch {
    /* logar nunca pode derrubar o app */
  }
}

for (const level of ['log', 'error', 'warn'] as const) {
  const orig = console[level].bind(console) as (...a: unknown[]) => void;
  console[level] = (...args: unknown[]) => {
    orig(...args);
    writeLog(`${new Date().toISOString()} [${level}] ${args.map((a) => String(a)).join(' ')}\n`);
  };
}

// Recupera o renderer após crash de renderer/GPU (self-heal do "View → Reload").
// Guarda contra loop de reload quando o crash é imediato e repetido.
let lastReloadAt = 0;
let rapidReloads = 0;
function recoverRenderer(reason: string): void {
  const now = Date.now();
  rapidReloads = now - lastReloadAt < 15_000 ? rapidReloads + 1 : 0;
  lastReloadAt = now;
  if (rapidReloads >= 3) {
    console.error(`[recover] reloads repetidos (${reason}) — auto-reload pausado para evitar loop`);
    return;
  }
  console.log(`[recover] recriando renderer após: ${reason}`);
  try {
    mainWindow?.webContents.reload();
  } catch (e) {
    console.error(`[recover] falha ao recarregar: ${(e as Error)?.message}`);
  }
}

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
    icon: appIcon(),
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
    if (details.reason !== 'clean-exit') recoverRenderer(`render-process-gone:${details.reason}`);
  });
  mainWindow.webContents.on('preload-error', (_e, path, error) => {
    console.log(`[preload-error] ${path} ${error?.message}`);
  });
  // Renderer travado (JS preso/heap saturado). Só logamos — reload aqui poderia
  // matar um renderer apenas ocupado; o auto-reload fica para crash de fato.
  mainWindow.webContents.on('unresponsive', () => console.log('[renderer:unresponsive]'));
  mainWindow.webContents.on('responsive', () => console.log('[renderer:responsive]'));

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

// Ícone do app (32x32, PNG embutido — evita depender de arquivo externo no asar).
const APP_ICON_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADLUlEQVR42tWXz0vbYBjHPYf9AW/SJjnsJtt/0MvYj1tOW2vVtvFX1WrbDbyMsTEKO4ngVHbYZTssh10GY7RF55wUnYiIoq44pXOuayldxm5DhcAznhJtk75valsPFj4Q3vd5vt9v3qTJm7a2y/QTo0VGjBYlMVqMidGiIkaLCR1FH8M5pvXGkYJLjBQUMVLQxEgBbND0WlfTxkI4zwnhvCKE89Ag2Ms1aJ6ThHBOFcI5aBLUkM5nPpqVhdEstBi5PvORQ0kYOYQLovZK8KEDjg8dqHzoAOy48ywH8otCCTyup0fXtr4n+OGMwg9nwIrrYz9gOvkXsn9O4N+xZgDHcA5rammgB918aN/FD+2DFfJMnmpMC4K1tbTQqzrA4J7CD+4BDXnml62xGeyx0kMvg7kzuMs4g7uaM7gLZq492Iesajzz7W9ZGIu9ght3H5XAYxwzrIR6UuqlaepeTEWAtOQMpoHGdOK3QfjNuxRcuXrPwOu3n+BjahOSnzcMtdhrpYue5QADOzHnwA7QyKrHhjM3m99//BJOfxiiciWw10oXPcsB+rcUZ/8WmLn9dM9wRrjU5gDe4fGzALgSWFPZgxo0bfQ8C+Do20w4+jbBTOD5d4MYXm9zgNMQuBJ4jDWVPahB00bPcoDejYSjdwPMBCYzdQWopCrAZAZo2uhZDtCzrjh61sHMrSdp20tgxnwJUIOmjZ7lAPJazCGvAQ27m9CM+Sa00kXPswCcvCpx8irQmPqQs/0bnoJzlbXYa6WLnuUAgRWGC6xoXGAFzLSHcBWOGngQHZV6aZq6l3HrxvmXFc6/DDT8E+lzP4qxx0oPvareBZxvycX5lsAK/8TXqpWgvozUo1JtLS30or4R2e6UwnanwIr2oS8w9f4nNQiO4RzW1NJAD8v9ANu1yLFdiyrbtQh23Hy4Br7x7RJ4XE+Prl17k8p2Lkhs5wJcEPVtTlnvvMx656HFyOfaGRPvnES8cyrxzkGToIbU0LcB6ZjlSMesQjpmoUGwl2v6C4l4ki7iSSrEk9SIJwk2aHqtq+XfiMQdZ4g7LhF3PEbccYW44wkdRR/DOeZSfXH/B/mBH5VMa3nHAAAAAElFTkSuQmCC';

export function appIcon(): Electron.NativeImage {
  return nativeImage.createFromDataURL(`data:image/png;base64,${APP_ICON_B64}`);
}

function createTray(): void {
  // Antes o ícone era createEmpty() → a bandeja ficava invisível no Windows.
  const icon = appIcon().resize({ width: 16, height: 16 });
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

// Auto-update: verifica em segundo plano quando empacotado. Se o servidor de releases
// (electron-builder.yml → publish.url) não estiver configurado/acessível, falha em
// silêncio e o app segue normalmente.
function setupAutoUpdate(): void {
  if (!app.isPackaged) return;
  import('electron-updater')
    .then(({ autoUpdater }) => {
      autoUpdater.autoDownload = true;
      autoUpdater.on('error', () => {
        /* provider não configurado/sem rede — ignora */
      });
      void autoUpdater.checkForUpdatesAndNotify().catch(() => {
        /* ignora */
      });
    })
    .catch(() => {
      /* módulo indisponível — ignora */
    });
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
    migrateCameraSecrets(); // cifra senhas/URLs legadas em texto puro (safeStorage)
    mergeDuplicateCameras(); // consolida cadastros duplicados da mesma câmera (1 por aparelho)
    applyStartWithWindows(); // sincroniza o registro de inicialização com a configuração
    registerIpcHandlers(() => mainWindow);
    // Encaminha o status dos streams (running/erro) para a UI.
    streamingService.setNotifier((e) => mainWindow?.webContents.send(IPC.evtStreamStatus, e));
    // Fonte única: a detecção IA consome os quadros da MESMA puxada do StreamingService.
    streamingService.setDetectionSink(
      (camera, config, stream) => aiDetectionService.attachStream(camera, config, stream),
      (cameraId) => aiDetectionService.stop(cameraId),
    );
    // Sem IP fixo: se o stream não conectar (possível troca de IP por DHCP), o
    // StreamingService pede ao monitor para reencontrar a câmera pelo MAC na hora.
    streamingService.setHealRequester((cameraId) => void connectionMonitor.healNow(cameraId));
    motionDetectionService.setNotifier((ev) => {
      mainWindow?.webContents.send(IPC.evtDetection, ev);
      notifyDetection(ev); // notificação nativa + webhook (respeita as configurações)
    });
    aiDetectionService.setNotifier((ev) => {
      mainWindow?.webContents.send(IPC.evtDetection, ev);
      notifyDetection(ev);
    });
    recordingManager.start(); // inicia gravação 24/7 + retenção/reciclagem
    detectionManager.start(); // inicia a detecção de movimento configurada
    tourRunner.resumePersisted(); // retoma rotas PTZ que estavam rodando ao fechar
    connectionMonitor.start((p) => mainWindow?.webContents.send(IPC.evtCameraStatus, p));
    positionVerifier.start(); // verifica as posições da rota 2x/dia (IA de imagem)
    localServer.start(); // servidor REST + HLS (app mobile / navegador na LAN)
    createWindow();
    createTray();
    setupAutoUpdate();

    // Métricas a cada 60s: memória/CPU por processo (main/renderer/GPU). Um
    // vazamento aparece como memória subindo antes do blackout; um crash de GPU
    // aparece como o processo GPU sumindo/reiniciando na sequência dos logs.
    metricsTimer = setInterval(() => {
      try {
        const summary = app
          .getAppMetrics()
          .map((m) => `${m.type}${m.name ? `(${m.name})` : ''}:${Math.round((m.memory?.workingSetSize ?? 0) / 1024)}MB`)
          .join(' ');
        console.log(`[metrics] ${summary}`);
      } catch {
        /* noop */
      }
    }, 60_000);

    // Reload preventivo do renderer a cada 6h: recicla a superfície de composição
    // antes do acúmulo de ~10h derrubar a GPU (paliativo — o Estágio 2 ataca a causa).
    // A gravação 24/7 não é afetada (roda no backend); o vídeo reconecta em ~1-2s.
    recycleTimer = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      console.log('[recycle] reload programado do renderer (preventivo, 6h)');
      try {
        mainWindow.webContents.reload();
      } catch (e) {
        console.error(`[recycle] falha: ${(e as Error)?.message}`);
      }
    }, RENDERER_RECYCLE_MS);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// Crash de processo filho (GPU/utility). O crash do processo de GPU apaga TODA a
// UI composta na GPU (a janela inteira fica preta) — logamos o motivo e recriamos
// o renderer para restabelecer a superfície de composição (self-heal do reload).
app.on('child-process-gone', (_e, details) => {
  console.log(`[child-gone] ${JSON.stringify(details)}`);
  if (details.type === 'GPU' && details.reason !== 'clean-exit') {
    recoverRenderer(`gpu-gone:${details.reason}`);
  }
});

app.on('before-quit', () => {
  isQuiting = true;
  if (metricsTimer) clearInterval(metricsTimer);
  if (recycleTimer) clearInterval(recycleTimer);
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
