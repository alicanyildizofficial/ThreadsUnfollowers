/*
 * Tek kaynaktan (threads-unfollowers.js) dagitim dosyalarini uretir:
 *   - extension/threads-unfollowers.js   (eklentiye kopya)
 *   - docs/threads-unfollowers.js        (GitHub Pages sitesine kopya)
 *   - extension/icon16|48|128.png        (arac cubugu ikonu)
 *   - bookmarklet.html                   (kurulum gerektirmeyen alternatif)
 *   - dist/index.html                    (tek dosya site: her yere yuklenebilir)
 *
 * Kullanim:  node build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'threads-unfollowers.js');
const EXT = path.join(ROOT, 'extension');
const DOCS = path.join(ROOT, 'docs');
const DIST = path.join(ROOT, 'dist');

/* ------------------------------------------------------------------ */
/* PNG uretici (bagimliliksiz)                                        */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const c = pixelAt(x, y);
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2]; raw[p++] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* Koyu zemin + mavi daire, uzerinden capraz kesik (= takipten cikar). 3x3 supersampling. */
function iconPixel(size) {
  const BG = [13, 13, 13, 255];
  const BLUE = [59, 130, 246, 255];
  const cx = size / 2, cy = size / 2;
  const r = size * 0.36;
  const slash = size * 0.085;

  return function (x, y) {
    let acc = [0, 0, 0, 0];
    const N = 3;
    for (let sy = 0; sy < N; sy++) {
      for (let sx = 0; sx < N; sx++) {
        const px = x + (sx + 0.5) / N;
        const py = y + (sy + 0.5) / N;
        const inCircle = (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
        const inSlash = Math.abs((px - cx) + (py - cy)) < slash;
        const c = inCircle && !inSlash ? BLUE : BG;
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += c[3];
      }
    }
    const n = N * N;
    return [Math.round(acc[0] / n), Math.round(acc[1] / n), Math.round(acc[2] / n), Math.round(acc[3] / n)];
  };
}

/* ------------------------------------------------------------------ */
/* Uretim                                                             */
/* ------------------------------------------------------------------ */

if (!fs.existsSync(SRC)) {
  console.error('Kaynak bulunamadi: ' + SRC);
  process.exit(1);
}
const source = fs.readFileSync(SRC, 'utf8');

// 1) Eklentiye kopyala
fs.mkdirSync(EXT, { recursive: true });
fs.writeFileSync(path.join(EXT, 'threads-unfollowers.js'), source);

// 2) Ikonlar
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(EXT, 'icon' + size + '.png'), encodePNG(size, iconPixel(size)));
}

// 3) GitHub Pages sitesine kopyala (index.html bu dosyayi fetch ediyor)
if (fs.existsSync(DOCS)) {
  fs.writeFileSync(path.join(DOCS, 'threads-unfollowers.js'), source);
} else {
  console.warn('  (docs/ yok, site kopyasi atlandi)');
}

// 4) Tek dosya site: kodu sayfaya gomup her yere yuklenebilir hale getir
//    (kendi alan adin, link-in-bio paneli, herhangi bir statik hosting...)
let singleFileKB = null;
const docsIndex = path.join(DOCS, 'index.html');
if (fs.existsSync(docsIndex)) {
  let html = fs.readFileSync(docsIndex, 'utf8');

  // Gomulen kod bir </script> icerirse sayfa erken kapanir; bu asla olmamali.
  if (/<\/script/i.test(source)) {
    console.error('HATA: kaynak </script> iceriyor, tek dosya uretilemez.');
    process.exit(1);
  }

  const marker = '<textarea id="fallback"';
  if (html.indexOf(marker) === -1) {
    console.error('HATA: docs/index.html beklenen yapida degil (fallback alani yok).');
    process.exit(1);
  }

  const NL = String.fromCharCode(10);
  const inlined =
    '<script type="text/plain" id="tu-src">' + NL +
    source + NL +
    '</' + 'script>' + NL + NL +
    marker;
  html = html.replace(marker, inlined);

  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
  singleFileKB = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
}

// 5) Bookmarklet sayfasi
const href = 'javascript:' + encodeURIComponent(source + '\n//# sourceURL=threads-unfollowers.js');
const kb = (href.length / 1024).toFixed(1);
const page = `<!doctype html>
<html lang="tr">
<meta charset="utf-8">
<title>Threads Unfollowers &mdash; kurulum</title>
<style>
  body{margin:0;padding:3rem 1.5rem;background:#0a0a0a;color:#f0f0f0;
       font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
  main{max-width:640px;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .5rem}
  p{color:#c3c3c3}
  .drag{display:inline-block;margin:1.5rem 0;padding:.9rem 1.6rem;border-radius:10px;
        background:#3b82f6;color:#fff;font-weight:700;text-decoration:none;cursor:grab}
  .drag:active{cursor:grabbing}
  ol{color:#c3c3c3}
  li{margin-bottom:.4rem}
  .note{margin-top:2rem;padding:1rem;border:1px solid #7c4a03;background:#2a1a05;
        border-radius:10px;color:#fbbf24;font-size:.9rem}
  code{background:#1a1a1a;padding:.15rem .4rem;border-radius:5px;font-size:.88em}
</style>
<main>
  <h1>Threads Unfollowers</h1>
  <p>Asagidaki butonu <b>yer imleri cubuguna suru</b>. Sonra threads.com'dayken tek tik yeter.</p>

  <a class="drag" href="${href}">Threads Unfollowers</a>

  <ol>
    <li>Yer imleri cubugu kapaliysa: <code>Ctrl+Shift+B</code> ile ac.</li>
    <li>Yukaridaki mavi butonu cubuga surukle-birak.</li>
    <li>threads.com'a git, giris yap.</li>
    <li>Yer imine tikla &mdash; panel acilir.</li>
  </ol>

  <div class="note">
    Bu yer imi ${kb} KB. Bazi tarayicilar cok uzun yer imi adreslerini kirpabilir;
    boyle bir durumda panel acilmaz. O zaman <code>extension/</code> klasorundeki
    eklenti yontemini kullan &mdash; o her zaman calisir.
  </div>
</main>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'bookmarklet.html'), page);

console.log('Hazir:');
console.log('  extension/threads-unfollowers.js  ' + (source.length / 1024).toFixed(1) + ' KB');
console.log('  extension/icon16|48|128.png');
if (fs.existsSync(path.join(DOCS, 'threads-unfollowers.js'))) {
  console.log('  docs/threads-unfollowers.js       ' + (source.length / 1024).toFixed(1) + ' KB');
}
if (singleFileKB) {
  console.log('  dist/index.html                   ' + singleFileKB + ' KB (tek dosya site)');
}
console.log('  bookmarklet.html                  (yer imi ' + kb + ' KB)');
