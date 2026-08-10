// 產生 PWA icon（純 Node，不需外部影像套件）：青磁底 + 白磁碗形
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [31, 138, 131]; // 青磁 #1F8A83
const BOWL = [242, 247, 245]; // 白磁 #F2F7F5

function pixel(x, y, size) {
  const cx = size / 2;
  const cyBowl = size * 0.58;
  const rBowl = size * 0.3;
  const dx = x - cx;
  const dy = y - cyBowl;
  const inBowl = dx * dx + dy * dy <= rBowl * rBowl && y >= cyBowl - size * 0.04;
  // 兩根筷子：斜線
  const onStick = (offset) => {
    const t = x - (y * 0.55 + offset * size);
    return t >= 0 && t < size * 0.028 && y < cyBowl && y > size * 0.12;
  };
  if (inBowl) return [...BOWL, 255];
  if (onStick(0.18) || onStick(0.28)) return [...BOWL, 255];
  return [...BG, 255];
}

mkdirSync(join(root, 'public'), { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(join(root, 'public', `icon-${size}.png`), encodePng(size, pixel));
  console.log(`public/icon-${size}.png ✓`);
}
