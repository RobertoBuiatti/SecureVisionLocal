// Verificação do modelo de CONEXÃO ÚNICA com a câmera.
//
// A câmera (Xiongmai 8MP) serve pouquíssimas sessões RTSP simultâneas: toda sessão extra
// derruba o vídeo. Estes checks cobrem os caminhos que passaram a sair da puxada única em
// vez de abrir conexão própria, e guardam contra a reintrodução de sessões paralelas.
//
//   node svl-check-single-source.cjs
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { createWriteStream, mkdtempSync, existsSync, statSync, readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
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

  // O canvas do jsmpeg nasce BRANCO em TODA montagem, nao so na primeira. Se quem o esconde
  // voltar a ser o `connecting` (que ja e falso quando o watchdog ou a volta da bandeja
  // remontam o decoder), o retangulo branco reaparece no lugar da camera.
  const canvas = player.slice(player.indexOf('<canvas'), player.indexOf('/>', player.indexOf('<canvas')));
  if (!/hasImage/.test(canvas)) {
    offenders.push('Player.tsx: o canvas voltou a ser escondido por outra coisa que nao o '
      + 'hasImage -- em cada remontagem do decoder aparece o canvas BRANCO do jsmpeg');
  }
  if (!/setHasImage\(false\)/.test(player.slice(mStart, mEnd))) {
    offenders.push('Player.tsx: mountJsmpeg() nao esconde mais o canvas ate o 1o quadro '
      + 'DESTA montagem -- volta o branco');
  }
  // setHasImage(true) roda dentro do onVideoDecode: sem a guarda de 1o quadro sao 25
  // setState por segundo POR CAMERA.
  const decStart = player.indexOf('onVideoDecode');
  const decBody = decStart === -1 ? '' : player.slice(decStart, player.indexOf('});', decStart));
  if (!/if \(!gotFrame\)/.test(decBody)) {
    offenders.push('Player.tsx: setHasImage saiu da guarda de 1o quadro no onVideoDecode -- '
      + '25 setState/s por camera derrubam o renderer');
  }
  // Montou e nunca desenhou (entrou no meio do MPEG-TS, sem cabecalho de sequencia): o
  // watchdog de quadros precisa cobrir isso, senao o canvas fica branco para sempre.
  const wStart = player.indexOf('const frameWatchdog');
  const wBody = wStart === -1 ? '' : player.slice(wStart, player.indexOf('FRAME_CHECK_MS)', wStart));
  if (!/streamRunning/.test(wBody)) {
    offenders.push('Player.tsx: o watchdog de quadros voltou a desistir quando o decoder '
      + 'nunca desenhou -- canvas branco permanente com o nucleo entregando quadros');
  }

  assert.strictEqual(offenders.length, 0,
    'recuperacao da imagem quebrada: ' + offenders.join(' | '));
  console.log('  backend avisa em todo restart e o Player recria o decoder');
  console.log('  canvas escondido ate o 1o quadro de CADA montagem (sem retangulo branco)');
}

// ---------------------------------------------------------------------------
// 5) Guarda do TEMPO DE RECARGA da camera.
//    a) os tetos de analise do main-stream foram cortados (5s/5MB -> 2s/1,5MB) porque sao
//       tempo morto antes do primeiro quadro em cada reabertura. O canto cortado: probe
//       curto pode nao achar o audio, e a gravacao 24/7 usa "-map 0:a?". Aqui isso e
//       medido de verdade, com uma fonte H.264 + AAC.
//    b) uma sessao que NUNCA entregou quadro tem de sair pelo handler de 'close' (que
//       escolhe software em vez de HW, proxima URL ou failover), nao pelo restartStalled,
//       que respawnaria com os MESMOS argumentos e ficaria em loop.
// ---------------------------------------------------------------------------
function checkReloadBudget() {
  const AV = join(dir, 'av.mp4');
  execFileSync(
    FFMPEG,
    ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440',
     '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
     '-c:a', 'aac', '-shortest', '-y', AV],
    { stdio: 'ignore' },
  );

  const streaming = readFileSync(join(__dirname, 'electron/core/streaming.ts'), 'utf-8');
  const num = (name) => {
    const m = streaming.match(new RegExp(`'-${name}',\\s*isLow \\? '(\\d+)' : '(\\d+)'`));
    return m ? { low: Number(m[1]), high: Number(m[2]) } : null;
  };
  const analyze = num('analyzeduration');
  const probe = num('probesize');
  assert.ok(analyze && probe, 'streaming.ts: -analyzeduration/-probesize sumiram dos args');

  // Com os tetos em vigor, o FFmpeg ainda tem de enxergar as DUAS trilhas.
  const probed = spawnSync(FFMPEG, [
    '-analyzeduration', String(analyze.high), '-probesize', String(probe.high),
    '-i', AV, '-f', 'null', '-',
  ], { encoding: 'utf-8' });
  const err = probed.stderr || '';
  assert.match(err, /Stream #0:0.*Video/, `probe de ${probe.high}B nao achou o video`);
  assert.match(err, /Stream #0:1.*Audio/,
    `probe de ${probe.high}B/${analyze.high}us nao acha mais o audio -- a gravacao 24/7 `
    + 'usa "-map 0:a?" e sairia muda');

  const offenders = [];
  const first = streaming.match(/const FIRST_FRAME_TIMEOUT_MS = (\d+)/);
  const stall = streaming.match(/const STALL_TIMEOUT_MS = \{ high: (\d+), low: (\d+) \}/);
  if (!first || !stall) {
    offenders.push('streaming.ts: FIRST_FRAME_TIMEOUT_MS ou STALL_TIMEOUT_MS sumiram');
  } else if (Number(first[1]) >= Number(stall[1])) {
    offenders.push('streaming.ts: FIRST_FRAME_TIMEOUT_MS voltou a ser >= o stall do high -- '
      + 'quem nunca entregou quadro paga de novo o prazo de quem estava funcionando');
  }
  const wStart = streaming.indexOf('private startWatchdog(');
  const wBody = wStart === -1 ? '' : streaming.slice(wStart, streaming.indexOf('WATCHDOG_INTERVAL_MS);', wStart));
  if (wStart === -1) {
    offenders.push('streaming.ts: startWatchdog() sumiu');
  } else {
    if (!/state\.gotData \? STALL_TIMEOUT_MS/.test(wBody)) {
      offenders.push('streaming.ts: o watchdog voltou a cobrar o prazo de stall de uma sessao '
        + 'que nunca entregou quadro');
    }
    if (wBody.indexOf('if (!state.gotData)') === -1
      || wBody.indexOf('if (!state.gotData)') > wBody.indexOf('this.restartStalled(state)')) {
      offenders.push('streaming.ts: sessao sem primeiro quadro voltou a cair no restartStalled '
        + '-- respawna com os mesmos argumentos e entra em loop');
    }
  }

  assert.strictEqual(offenders.length, 0,
    'orcamento de recarga quebrado: ' + offenders.join(' | '));
  console.log(`  probe de ${analyze.high / 1000}ms/${probe.high} bytes ainda acha video + audio`);
  console.log('  sessao sem primeiro quadro sai pelo close (HW->software / proxima URL / failover)');
}

// ---------------------------------------------------------------------------
// 6) Guarda da JANELA ESCONDIDA (minimizada / bandeja).
//    O Player solta o decoder quando a janela some, para nao manter o WebSocket e o
//    demuxer rodando por um canvas que ninguem ve. O que ele NAO pode fazer e mexer no
//    backend: a puxada RTSP, a gravacao 24/7 e a deteccao seguem rodando escondidas.
// ---------------------------------------------------------------------------
function checkHiddenWindowRelease() {
  const offenders = [];
  const player = readFileSync(join(__dirname, 'src/components/Player.tsx'), 'utf-8');

  const vStart = player.indexOf('function onVisibility');
  if (vStart === -1) {
    offenders.push('Player.tsx: onVisibility() sumiu -- o decoder volta a segurar o '
      + 'WebSocket com a janela escondida');
  } else {
    const vBody = player.slice(vStart, player.indexOf('addEventListener', vStart));
    if (!vBody.includes('destroy()')) {
      offenders.push('Player.tsx: onVisibility() nao solta mais o decoder');
    }
    // O unico jeito de isto derrubar a gravacao seria mexer no stream do backend.
    if (/streaming\.(stop|viewerStop)/.test(vBody)) {
      offenders.push('Player.tsx: onVisibility() para o stream do backend -- a gravacao '
        + '24/7 pararia junto com a janela minimizada');
    }
  }

  // Sem esta guarda, o watchdog de quadros recria o decoder a cada tique com a janela
  // escondida e a economia vira zero.
  const mStart = player.indexOf('function mountJsmpeg');
  const mBody = mStart === -1 ? '' : player.slice(mStart, player.indexOf('new JSMpeg.Player', mStart));
  if (!/visibilityState === 'hidden'/.test(mBody)) {
    offenders.push('Player.tsx: mountJsmpeg() voltou a montar o decoder com a janela '
      + 'escondida -- o watchdog de quadros o recria a cada tique');
  }
  if (!player.includes("removeEventListener('visibilitychange'")) {
    offenders.push('Player.tsx: o listener de visibilitychange nao e removido no cleanup');
  }
  // O jsmpeg NAO remove o listener dele no destroy(): com pauseWhenHidden ligado, cada
  // recriacao do decoder deixaria um listener para tras.
  if (!/pauseWhenHidden: false/.test(player)) {
    offenders.push('Player.tsx: pauseWhenHidden deixou de ser false -- o jsmpeg registra um '
      + 'listener de visibilitychange que o destroy() dele nao remove (vaza por recriacao)');
  }

  assert.strictEqual(offenders.length, 0,
    'janela escondida: ' + offenders.join(' | '));
  console.log('  decoder solto com a janela escondida, backend (gravacao 24/7) intacto');
}

// ---------------------------------------------------------------------------
// 7) Guarda da IMAGEM CONGELADA (camera travada ENTREGANDO bytes).
//    O watchdog de stall conta bytes, nao conteudo, entao nao ve a camera que trava e passa
//    a repetir o mesmo quadro -- e a gravacao 24/7 guardaria a imagem parada. A deteccao usa
//    o JPEG que a propria puxada ja escreve 1x/s (saida 2), sem pedir nada a camera.
//    Toda a ideia depende de uma premissa do FFmpeg, medida aqui: quadro igual -> JPEG
//    byte a byte igual; quadro diferente -> JPEG diferente.
// ---------------------------------------------------------------------------
function checkFrozenPicture() {
  const hashes = (glob) => {
    const out = [];
    for (let i = 1; i <= 5; i++) {
      const f = join(dir, glob.replace('%', String(i).padStart(3, '0')));
      if (existsSync(f)) out.push(createHash('sha1').update(readFileSync(f)).digest('hex'));
    }
    return out;
  };

  // Mesma cadeia de filtros/qualidade da saida 2 da puxada unica (ver spawnCameraFfmpeg).
  const jpegArgs = (src, pat) =>
    ['-i', src, '-vf', 'fps=1,scale=1280:-1', '-q:v', '4', '-y', join(dir, pat)];

  const STILL = join(dir, 'still.mp4');
  execFileSync(FFMPEG, ['-f', 'lavfi', '-i', 'color=c=gray:size=640x360:rate=25', '-t', '6',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', STILL], { stdio: 'ignore' });
  execFileSync(FFMPEG, jpegArgs(STILL, 'still_%03d.jpg'), { stdio: 'ignore' });
  execFileSync(FFMPEG, jpegArgs(SRC, 'moving_%03d.jpg'), { stdio: 'ignore' });

  const still = hashes('still_%.jpg');
  const moving = hashes('moving_%.jpg');
  assert.ok(still.length >= 3 && moving.length >= 3, 'quadros ao vivo nao foram gerados');
  assert.strictEqual(new Set(still).size, 1,
    'imagem parada deixou de produzir JPEG identico -- a deteccao de congelamento nunca dispara');
  assert.ok(new Set(moving).size >= 3,
    'imagem em movimento produziu JPEG repetido -- a deteccao de congelamento daria falso positivo');

  const offenders = [];
  const streaming = readFileSync(join(__dirname, 'electron/core/streaming.ts'), 'utf-8');
  const wStart = streaming.indexOf('private startWatchdog(');
  const wBody = wStart === -1 ? '' : streaming.slice(wStart, streaming.indexOf('WATCHDOG_INTERVAL_MS);', wStart));
  if (!/pictureFrozen\(state\)/.test(wBody)) {
    offenders.push('streaming.ts: o watchdog nao checa mais a imagem congelada -- camera travada '
      + 'entregando bytes volta a so ser curada pela reciclagem de 3h');
  }
  if (!/state\.gotData &&/.test(wBody)) {
    offenders.push('streaming.ts: a checagem de imagem congelada roda antes do 1o quadro da '
      + 'sessao -- competiria com o FIRST_FRAME_TIMEOUT_MS');
  }
  // Cena genuinamente parada produz JPEG identico do mesmo jeito (medido acima): a janela
  // curta faria a camera de um patio vazio reiniciar sozinha a noite inteira.
  const frozen = streaming.match(/const FROZEN_TIMEOUT_MS =[^;]*?(\d+) \* 60 \* 1000/);
  if (!frozen || Number(frozen[1]) < 5) {
    offenders.push('streaming.ts: FROZEN_TIMEOUT_MS abaixo de 5min -- cena imovel de verdade '
      + '(madrugada) seria reiniciada a toa');
  }
  const fnStart = streaming.indexOf('private pictureFrozen(');
  const fnBody = fnStart === -1 ? '' : streaming.slice(fnStart, streaming.indexOf('scheduleHighRetry', fnStart));
  if (!/freshLiveFrame/.test(fnBody)) {
    offenders.push('streaming.ts: pictureFrozen() nao usa mais o quadro da puxada unica');
  }
  if (!/frozenMiss/.test(fnBody)) {
    offenders.push('streaming.ts: pictureFrozen() perdeu a tolerancia a leitura parcial do '
      + 'JPEG -- uma leitura torta zera o relogio e o congelamento nunca e detectado');
  }

  assert.strictEqual(offenders.length, 0, 'imagem congelada: ' + offenders.join(' | '));
  console.log('  JPEG da puxada: identico com a cena parada, diferente com movimento');
  console.log('  watchdog reinicia a puxada apos a janela de congelamento');
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
  console.log('5) guarda do tempo de recarga da camera');
  checkReloadBudget();
  console.log('6) guarda da janela escondida (minimizada / bandeja)');
  checkHiddenWindowRelease();
  console.log('7) guarda da imagem congelada (camera travada entregando bytes)');
  checkFrozenPicture();
  console.log('\nOK: conexao unica preservada em todos os caminhos');
})().catch((e) => {
  console.error('\nFALHOU:', e.message);
  process.exit(1);
});
