import fs from 'node:fs';
import zlib from 'node:zlib';

const source = fs.readFileSync('app.js', 'utf8');
const encoded = zlib.gzipSync(Buffer.from(source)).toString('base64');
fs.writeFileSync(
  'app-payload-v310.js',
  `/* TOP BOX app payload v3.2.2 | gzip+base64 */\nwindow.__TOPBOX_APP_GZIP_BASE64__='${encoded}';\n`,
);

const workerPath = 'worker.js';
const worker = fs.readFileSync(workerPath, 'utf8').replace(
  /const EMBEDDED_APP_GZIP = '[A-Za-z0-9+/=]+';/,
  `const EMBEDDED_APP_GZIP = '${encoded}';`,
);
fs.writeFileSync(workerPath, worker);
console.log(JSON.stringify({ sourceBytes: source.length, encodedBytes: encoded.length }));
