/* Verifica o modo TELA CHEIA da tela "Ao Vivo".
 *
 * Regra: em tela cheia de verdade (fullscreen do monitor) só o vídeo da câmera aparece —
 * nada de sidebar, cabeçalho da view ou barra de ferramentas do bloco — e o vídeo ocupa a
 * tela inteira. A navegação só aparece com o mouse sobre a tela.
 *
 * Uso: node svl-check-fullscreen.cjs   (a partir de desktop/)
 */
const { _electron } = require('playwright-core');
const { join } = require('node:path');
const { rmSync } = require('node:fs');

// Lê um pixel do PNG (RGB, 8 bits) para provar o que aparece na tela — computed style não
// serve aqui: o canvas do jsmpeg pinta por cima do background CSS.
function pixelAt(file, x, y) {
  const d = require('node:fs').readFileSync(file);
  const zlib = require('node:zlib');
  const w = d.readUInt32BE(16);
  const bpp = 3;
  let i = 8;
  const parts = [];
  while (i < d.length) {
    const len = d.readUInt32BE(i);
    if (d.slice(i + 4, i + 8).toString() === 'IDAT') parts.push(d.slice(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = w * bpp + 1;
  let prev = Buffer.alloc(w * bpp);
  for (let row = 0; row <= y; row++) {
    const f = raw[row * stride];
    const line = Buffer.from(raw.slice(row * stride + 1, row * stride + 1 + w * bpp));
    for (let k = 0; k < line.length; k++) {
      const a = k >= bpp ? line[k - bpp] : 0;
      const b = prev[k];
      const c = k >= bpp ? prev[k - bpp] : 0;
      if (f === 1) line[k] = (line[k] + a) & 255;
      else if (f === 2) line[k] = (line[k] + b) & 255;
      else if (f === 3) line[k] = (line[k] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[k] = (line[k] + pr) & 255;
      }
    }
    prev = line;
  }
  return [prev[x * bpp], prev[x * bpp + 1], prev[x * bpp + 2]];
}

const SHOT_DIR = process.env.SHOT_DIR || __dirname;
let failures = 0;
function ok(cond, label, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
  if (!cond) failures += 1;
}

// Um elemento só é REALMENTE visível em fullscreen se estiver dentro do elemento promovido:
// o que fica fora não é pintado, mas continua com caixa de layout — por isso
// getBoundingClientRect sozinho não serve como prova.
const PROBE = () => {
  const fs = document.fullscreenElement;
  const shown = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    if (fs && !fs.contains(el) && el !== fs) return false; // fora do top layer: não aparece
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const canvas = document.querySelector('.player-canvas') || document.querySelector('canvas');
  const cr = canvas ? canvas.getBoundingClientRect() : null;
  const tile = document.querySelector('.fullscreen-view .tile-video');
  const tr = tile ? tile.getBoundingClientRect() : null;
  return {
    isFullscreen: !!fs,
    fullscreenTag: fs ? fs.className : null,
    sidebar: shown('.sidebar'),
    viewHeader: shown('.live-view .view-header'),
    tileToolbar: shown('.tile-toolbar'),
    tileRemove: shown('.tile-remove'),
    fsNav: shown('.fs-nav'),
    screen: { w: window.innerWidth, h: window.innerHeight },
    // A área de vídeo é o que precisa cobrir a tela; o canvas do jsmpeg fica dentro dela
    // com a proporção do stream (object-fit: contain).
    videoArea: tr ? { w: Math.round(tr.width), h: Math.round(tr.height) } : null,
    canvas: cr ? { w: Math.round(cr.width), h: Math.round(cr.height) } : null,
  };
};

(async () => {
  const userData = join(__dirname, 'svl-fs-data');
  rmSync(userData, { recursive: true, force: true });
  const app = await _electron.launch({
    args: ['.'],
    cwd: __dirname,
    env: { ...process.env, SVL_USER_DATA: userData },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('.app');

  // Câmera de teste: a URL não precisa responder — o que se avalia é o layout.
  const camId = await win.evaluate(async () => {
    const cam = await window.svl.cameras.add({
      name: 'TesteCam FS',
      ip: '127.0.0.1',
      port: 554,
      protocol: 'rtsp',
      type: 'ip',
      username: '',
      password: '',
      streamUrl: 'rtsp://127.0.0.1:554/onvif1',
      subStreamUrl: '',
      hasPTZ: false,
      hasAudio: false,
    });
    return cam?.id ?? null;
  });
  if (!camId) throw new Error('nao foi possivel cadastrar a camera de teste');
  await win.reload();
  await win.waitForSelector('.app');
  await win.waitForTimeout(1200);

  await win.click('.sidebar button:has-text("Ao Vivo")').catch(() => {});
  await win.waitForSelector('.live-view');

  // O botão "Tela cheia" tem de levar direto ao fullscreen do monitor.
  await win.click('button:has-text("Tela cheia")');
  await win.waitForSelector('.fullscreen-view');
  await win.waitForTimeout(900);
  await win.screenshot({ path: join(SHOT_DIR, 'fs1-tela-cheia.png') });

  const fs = await win.evaluate(PROBE);
  console.log('em tela cheia:', JSON.stringify(fs));

  ok(fs.isFullscreen, 'o botao "Tela cheia" entra no fullscreen do monitor');
  ok(!fs.sidebar, 'sidebar nao aparece');
  ok(!fs.viewHeader, 'cabecalho da view nao aparece');
  ok(!fs.tileToolbar, 'barra de ferramentas do bloco nao aparece');
  ok(!fs.tileRemove, 'botao de remover camera nao aparece');

  if (fs.videoArea) {
    const coverW = fs.videoArea.w / fs.screen.w;
    const coverH = fs.videoArea.h / fs.screen.h;
    ok(coverW > 0.99, 'video ocupa a largura da tela', `${(coverW * 100).toFixed(1)}%`);
    ok(coverH > 0.99, 'video ocupa a altura da tela', `${(coverH * 100).toFixed(1)}%`);
  } else {
    ok(false, 'area de video encontrada');
  }

  // Câmera sem sinal não pode acender o monitor de branco (o canvas do jsmpeg nasce branco).
  const shot = join(SHOT_DIR, 'fs1-tela-cheia.png');
  const [r, g, b] = pixelAt(shot, 400, 600);
  ok(r < 40 && g < 40 && b < 40, 'fundo fica escuro quando nao ha imagem', `rgb(${r},${g},${b})`);

  // A navegação aparece ao mover o mouse...
  await win.mouse.move(fs.screen.w / 2, fs.screen.h - 40);
  await win.waitForTimeout(300);
  const moved = await win.evaluate(PROBE);
  ok(moved.fsNav, 'navegacao aparece ao mover o mouse');
  await win.screenshot({ path: join(SHOT_DIR, 'fs2-tela-cheia-controles.png') });

  // ...e some sozinha com o mouse parado, deixando só o vídeo.
  await win.waitForTimeout(3200);
  const idle = await win.evaluate(PROBE);
  ok(!idle.fsNav, 'navegacao some sozinha com o mouse parado');

  // Sair do fullscreen: no app real é o Esc (tratado pelo próprio Chromium). Aqui a saída
  // é feita pela API, porque o Esc sintético do Playwright não aciona esse caminho nativo.
  await win.evaluate(() => document.exitFullscreen && document.exitFullscreen());
  await win.waitForTimeout(600);
  await win.click('button:has-text("Grade")');
  await win.waitForTimeout(500);
  const back = await win.evaluate(PROBE);
  ok(!back.isFullscreen, 'sair do modo tela cheia sai do fullscreen');
  ok(back.sidebar && back.viewHeader, 'interface normal volta ao sair');

  await app.close();
  rmSync(userData, { recursive: true, force: true });
  if (failures) {
    console.error(`\n${failures} verificacao(oes) falharam`);
    process.exit(1);
  }
  console.log('\nOK: tela cheia mostra somente o video, ocupando o monitor inteiro');
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
