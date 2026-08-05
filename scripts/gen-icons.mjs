// Generate solid-color PNG icons for the PWA manifest without any native deps.
// Produces: icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png,
// apple-touch-icon.png. Maskable gets a safe-area padding ring so it survives
// platform cropping.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '..', 'public');
const iconsDir = resolve(publicDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

function crc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crc32Table();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePng(size, rgb, opts = {}) {
  const { ring = null } = opts;
  const width = size;
  const height = size;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    for (let x = 0; x < width; x++) {
      let [r, g, b, a] = rgb;
      if (ring) {
        // Euclidean distance from center; maskable safe zone = 80% radius.
        const cx = width / 2;
        const cy = height / 2;
        const dist = Math.hypot(x - cx, y - cy);
        const maxR = Math.min(cx, cy);
        if (dist > maxR * 0.8) {
          [r, g, b, a] = ring;
        }
      }
      const off = y * (stride + 1) + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', iend),
  ]);
}

const bg = [15, 23, 42, 255]; // slate-900
const accent = [56, 189, 248, 255]; // sky-400

const targets = [
  { file: 'icons/icon-192.png', size: 192, rgb: bg },
  { file: 'icons/icon-512.png', size: 512, rgb: bg },
  {
    file: 'icons/icon-maskable-512.png',
    size: 512,
    rgb: bg,
    ring: accent,
  },
  { file: 'apple-touch-icon.png', size: 180, rgb: bg },
  { file: 'icons/icon-32.png', size: 32, rgb: bg },
];

for (const t of targets) {
  const png = makePng(t.size, t.rgb, { ring: t.ring });
  writeFileSync(resolve(publicDir, t.file), png);
  console.log(`wrote ${t.file} (${png.length} bytes)`);
}
