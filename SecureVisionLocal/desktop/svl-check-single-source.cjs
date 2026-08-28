// Verificação do modelo de CONEXÃO ÚNICA com a câmera.
//
// A câmera (Xiongmai 8MP) serve pouquíssimas sessões RTSP simultâneas: toda sessão extra
// derruba o vídeo. Estes checks cobrem os caminhos que passaram a sair da puxada única em
// vez de abrir conexão própria, e guardam contra a reintrodução de sessões paralelas.
//
//   node svl-check-single-source.cjs
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { createWriteStream, mkdtempSync, existsSync, statSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert');

const FFMPEG = require('ffmpeg-static');
const dir = mkdtempSync(join(tmpdir(), 'svl-check-'));
const SRC = join(dir, 'src.mp4');

// Entrada H.264, como o RTSP da câmera entrega — é o único caso em que o "-c:v copy" da
// gravação 24/7 é válido.
execFileSync(
  FFMPEG,
  ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=15', '-t', '4',
   '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', SRC],
  { stdio: 'ignore' },
);

// ---------------------------------------------------------------------------
// 1) A puxada única entrega as 5 saídas ao mesmo tempo, de UMA entrada:
//    vivo (pipe:1) + quadro JPEG + segmentos 24/7 + IA (pipe:3) + MOVIMENTO (pipe:4).
//    O pipe:4 substituiu a sessão RTSP própria da detecção de movimento.
// ---------------------------------------------------------------------------
function checkSingleSourceOutputs() {
  return new Promise((resolve, reject) => {
    const jpg = join(dir, 'live.jpg');
    const ff = spawn(FFMPEG, [
      '-i', SRC,
      '-map', '0:v:0', '-f', 'mpegts', '-codec:v', 'mpeg1video', '-vf', 'scale=1280:-1',
      '-b:v', '1000k', '-r', '25', '-bf', '0', '-an', '-q', '1', 'pipe:1',
      '-map', '0:v:0', '-vf', 'fps=1,scale=1280:-1', '-q:v', '4', '-update', '1', '-y', jpg,
      '-map', '0:v:0', '-c:v', 'copy', '-f', 'segment', '-segment_time', '2',
      '-segment_format', 'mp4', '-reset_timestamps', '1', join(dir, 'seg_%03d.mp4'),
      '-map', '0:v:0', '-an', '-vf', 'fps=1.5,scale=640:640,format=rgb24', '-f', 'rawvideo', 'pipe:3',
      '-map', '0:v:0', '-an', '-vf', 'fps=3,scale=320:180,format=gray', '-f', 'rawvideo', 'pipe:4',
    ], { stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] });

    let live = 0;
    let ai = 0;
    let motion = 0;
    let stderr = '';
    ff.stdout.on('data', (c) => { live += c.length; });
    ff.stdio[3].on('data', (c) => { ai += c.length; });
    ff.stdio[4].on('data', (c) => { motion += c.length; });
    ff.stderr.on('data', (c) => { stderr += c; });

    ff.on('close', (code) => {
      try {
        assert.strictEqual(code, 0, 'ffmpeg falhou:\n' + stderr.slice(-1500));
        assert.ok(live > 0, 'saida 1 (video ao vivo) nao produziu dados');
        assert.ok(existsSync(jpg) && statSync(jpg).size > 0, 'saida 2 (quadro ao vivo) nao foi escrita');
        assert.ok(ai > 0, 'saida 4 (IA / pipe:3) nao produziu dados');
        assert.ok(motion > 0, 'saida 5 (movimento / pipe:4) nao produziu dados');
        // O parser de movimento consome quadros de exatamente 320*180 bytes (gray).
        assert.strictEqual(motion % (320 * 180), 0,
          'pipe:4 desalinhado do frame 320x180 (' + motion + ' bytes)');
        console.log('  vivo=' + live + 'B ia=' + ai + 'B movimento=' + motion + 'B jpeg=' + statSync(jpg).size + 'B');
        resolve();
      } catch (e) { reject(e); }
    });
  });
}

// ---------------------------------------------------------------------------
// 2) Clipe de evento: gravado do MPEG-TS que a puxada única já produz e remuxado para MP4.
//    Antes, cada detecção de pessoa/veículo abria uma sessão RTSP nova no main-stream.
// ---------------------------------------------------------------------------
function checkEventClip() {
  return new Promise((resolve, reject) => {
    const ts = join(dir, 'clip.ts');
    const mp4 = join(dir, 'clip.mp4');
    const live = spawn(FFMPEG, [
      '-i', SRC,
      '-map', '0:v:0', '-f', 'mpegts', '-codec:v', 'mpeg1video', '-vf', 'scale=1280:-1',
      '-b:v', '2500k', '-r', '25', '-bf', '0', '-an', '-q', '1', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    const clip = createWriteStream(ts); // startEventClip
    live.stdout.on('data', (c) => clip.write(c));
    live.on('close', () => {
      clip.end(() => { // stopEventClip
        try {
          assert.ok(existsSync(ts) && statSync(ts).size > 0, 'o .ts do clipe ficou vazio');
        } catch (e) { return reject(e); }

        // remuxClip
        const rm = spawn(FFMPEG, ['-i', ts, '-c', 'copy', '-movflags', '+faststart', '-y', mp4],
          { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        rm.stderr.on('data', (c) => { err += c; });
        rm.on('close', (code) => {
          try {
            assert.strictEqual(code, 0, 'remux .ts -> .mp4 falhou:\n' + err.slice(-1200));
            assert.ok(existsSync(mp4) && statSync(mp4).size > 0, 'MP4 do clipe nao foi gerado');
            // Existir não basta: o clipe tem de decodificar de verdade.
            const probe = spawnSync(FFMPEG, ['-v', 'error', '-i', mp4, '-f', 'null', '-'], { encoding: 'utf-8' });
            assert.strictEqual(probe.status, 0, 'MP4 do clipe nao decodifica: ' + probe.stderr);
            assert.strictEqual((probe.stderr || '').trim(), '', 'MP4 do clipe tem erros: ' + probe.stderr);
            console.log('  ts=' + statSync(ts).size + 'B mp4=' + statSync(mp4).size + 'B');
            resolve();
          } catch (e) { reject(e); }
        });
      });
    });
  });
}

// ---------------------------------------------------------------------------
// 3) Guarda de regressão: nenhum caminho pode voltar a abrir sessão RTSP paralela.
//    É o erro que já custou caro duas vezes neste projeto.
// ---------------------------------------------------------------------------
function checkNoParallelRtsp() {
  const offenders = [];

  // Comentários explicam justamente o que foi removido — só o código conta.
  const codeOf = (file) => readFileSync(join(__dirname, file), 'utf-8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

  const motion = codeOf('electron/core/motionDetection.ts');
  const motionSpawns = (motion.match(/spawn\(FFMPEG_PATH/g) || []).length;
  const motionRtsp = (motion.match(/'-rtsp_transport'/g) || []).length;
  if (motionSpawns > 0 || motionRtsp > 0) {
    offenders.push('motionDetection.ts: voltou a abrir FFmpeg proprio ('
      + motionSpawns + ' spawn, ' + motionRtsp + ' rtsp)');
  }

  // streaming.ts pode ter UM pipeline RTSP: a puxada única. Mais que isso significa que
  // alguma segunda sessão contra a câmera (ex.: o antigo probe do HD) voltou.
  const streaming = codeOf('electron/core/streaming.ts');
  const streamingRtsp = (streaming.match(/'-rtsp_transport'/g) || []).length;
  if (streamingRtsp !== 1) {
    offenders.push('streaming.ts: ' + streamingRtsp + ' pipelines RTSP (esperado 1: a puxada unica)');
  }

  // A gravação por evento tem de tentar a puxada única ANTES de qualquer RTSP.
  const rec = readFileSync(join(__dirname, 'electron/core/recording.ts'), 'utf-8');
  if (!rec.includes('clipSource?.isActive')) {
    offenders.push('recording.ts: nao tenta mais derivar o clipe da puxada unica');
  } else if (rec.indexOf('clipSource?.isActive') > rec.indexOf("'-rtsp_transport'")) {
    offenders.push('recording.ts: abre RTSP antes de tentar a puxada unica');
  }

  assert.strictEqual(offenders.length, 0,
    'sessoes RTSP paralelas reintroduzidas:\n  ' + offenders.join('\n  '));
  console.log('  nenhuma sessao RTSP paralela no codigo');
}


// ---------------------------------------------------------------------------
// 4) Guarda de regressao: a imagem tem de se recuperar sozinha.
//    O backend preserva o WebSocket entre respawns do FFmpeg, entao o jsmpeg NAO cai
//    junto -- ele recebe um MPEG-TS novo no meio do fluxo e congela o ultimo quadro.
//    Duas invariantes seguram isso: o backend avisa em todo restart, e o Player recria
//    o decoder ao ser avisado. Se qualquer uma sumir, a imagem volta a travar.
// ---------------------------------------------------------------------------
function checkVideoRecovery() {
  const offenders = [];

  const streaming = readFileSync(join(__dirname, 'electron/core/streaming.ts'), 'utf-8');
  const start = streaming.indexOf('private reconfigure(');
  const body = start === -1 ? '' : streaming.slice(start, streaming.indexOf('spawnCameraFfmpeg(state);', start));
  if (start === -1) {
    offenders.push('streaming.ts: reconfigure() sumiu');
  } else if (!body.includes('this.notifier')) {
    offenders.push('streaming.ts: reconfigure() nao avisa mais o renderer -- o close do '
      + 'FFmpeg e suprimido ali, entao nada mais avisaria e a imagem travaria');
  } else if (body.indexOf('this.notifier') > body.indexOf("kill('SIGKILL')")) {
    offenders.push('streaming.ts: reconfigure() avisa o renderer DEPOIS de matar o FFmpeg');
  }

  const player = readFileSync(join(__dirname, 'src/components/Player.tsx'), 'utf-8');
  const mStart = player.indexOf('function mountJsmpeg');
  const mEnd = player.indexOf('new JSMpeg.Player', mStart);
  if (mStart === -1 || mEnd === -1) {
    offenders.push('Player.tsx: mountJsmpeg() sumiu -- o decoder voltou a ser criado uma vez so');
  } else if (!player.slice(mStart, mEnd).includes('destroy()')) {
    offenders.push('Player.tsx: mountJsmpeg() nao destroi o decoder anterior antes de recriar');
  }
  // O bloco que trata o 'running' precisa recriar o decoder: e o unico ponto em que o
  // Player fica sabendo que o stream voltou depois de uma queda.
  const rStart = player.indexOf("status === 'running'");
  const rEnd = player.indexOf("status === 'error'", rStart);
  const runningBlock = rStart === -1 || rEnd === -1 ? '' : player.slice(rStart, rEnd);
  if (!runningBlock.includes('mountJsmpeg()')) {
    offenders.push('Player.tsx: o decoder nao e mais recriado quando o stream volta -- '
      + 'a imagem vai congelar ate trocar de tela');
  }

  assert.strictEqual(offenders.length, 0,
    'recuperacao da imagem quebrada: ' + offenders.join(' | '));
  console.log('  backend avisa em todo restart e o Player recria o decoder');
}

(async () => {
  console.log('1) puxada unica -> 5 saidas simultaneas');
  await checkSingleSourceOutputs();
  console.log('2) clipe de evento sem tocar na camera');
  await checkEventClip();
  console.log('3) guarda contra sessoes RTSP paralelas');
  checkNoParallelRtsp();
  console.log('4) guarda contra imagem travada apos reconexao');
  checkVideoRecovery();
  console.log('\nOK: conexao unica preservada em todos os caminhos');
})().catch((e) => {
  console.error('\nFALHOU:', e.message);
  process.exit(1);
});
