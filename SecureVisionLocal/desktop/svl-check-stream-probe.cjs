// Check rápido do streamProbe (gêmeos de URL sub, parse do stderr do FFmpeg, máscara de
// credenciais e probe falhando em URL inválida). Roda: node svl-check-stream-probe.cjs
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { buildSync } = require('esbuild');

// O bundle fica DENTRO do projeto para o require dos externals (ffmpeg-static…) resolver.
const outDir = path.join(__dirname, 'node_modules', '.cache');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'svl-stream-probe.cjs');
buildSync({
  entryPoints: [path.join(__dirname, 'electron/core/streamProbe.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  logLevel: 'silent',
  external: ['electron', 'ws', 'better-sqlite3', 'ffmpeg-static', 'onnxruntime-node', 'sharp'],
});
const { twinSubUrls, parseVideoLine, maskUrl, probeRtsp } = require(out);

assert.deepStrictEqual(
  twinSubUrls('rtsp://1.2.3.4:554/user=admin&password=x&channel=1&stream=0.sdp?real_stream'),
  ['rtsp://1.2.3.4:554/user=admin&password=x&channel=1&stream=1.sdp?real_stream'],
);
assert.deepStrictEqual(twinSubUrls('rtsp://a/h264/ch1/main/av_stream'), ['rtsp://a/h264/ch1/sub/av_stream']);
assert.deepStrictEqual(twinSubUrls('rtsp://a/cam/realmonitor?channel=1&subtype=0'), [
  'rtsp://a/cam/realmonitor?channel=1&subtype=1',
]);
// /ch0\b não pode casar "ch01"
assert.deepStrictEqual(twinSubUrls('rtsp://a/h264/ch01/main/av_stream'), ['rtsp://a/h264/ch01/sub/av_stream']);
assert.deepStrictEqual(twinSubUrls('rtsp://a/Streaming/Channels/101'), ['rtsp://a/Streaming/Channels/102']);
assert.deepStrictEqual(twinSubUrls('rtsp://a/qualquer'), []);

assert.deepStrictEqual(parseVideoLine('  Stream #0:0: Video: hevc (Main), yuv420p(tv), 3840x2160, 25 fps\n'), {
  codec: 'hevc',
  width: 3840,
  height: 2160,
});
assert.deepStrictEqual(parseVideoLine('  Stream #0:0: Video: h264 (Main), yuvj420p(pc, bt709), 704x576\n'), {
  codec: 'h264',
  width: 704,
  height: 576,
});
assert.strictEqual(parseVideoLine('nada'), null);

assert.strictEqual(maskUrl('rtsp://admin:s3cr3t@1.2.3.4:554/x'), 'rtsp://***:***@1.2.3.4:554/x');
assert.strictEqual(
  maskUrl('rtsp://1.2.3.4:554/user=admin&password=s3cr3t&channel=1'),
  'rtsp://1.2.3.4:554/user=admin&password=***&channel=1',
);

probeRtsp('rtsp://127.0.0.1:1/nada', 1500).then((r) => {
  assert.strictEqual(r.ok, false);
  console.log('svl-check-stream-probe: ok (11 asserts; probe em URL inválida falhou como esperado:', r.error, ')');
});
