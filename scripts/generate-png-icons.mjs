import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const toCrc = buf.subarray(4, 8 + len);
  buf.writeUInt32BE(crc32(toCrc), 8 + len);
  return buf;
}

function generatePng(size) {
  const width = size;
  const height = size;
  const rawBytes = Buffer.alloc((width * 4 + 1) * height);
  const cx = width / 2;
  const cy = height / 2;
  const rOuter = width * 0.44;
  const rInner = width * 0.16;

  let pos = 0;
  for (let y = 0; y < height; y++) {
    rawBytes[pos++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);

      let r = 9, g = 13, b = 22; // Base dark blue slate #090d16

      if (d <= rOuter) {
        // Handpan shell gradient
        const t = d / rOuter;
        r = Math.floor(30 + (1 - t) * 35);
        g = Math.floor(38 + (1 - t) * 45);
        b = Math.floor(52 + (1 - t) * 60);

        // Highlight ring at rim
        if (d >= rOuter - 4) {
          r = 75; g = 180; b = 240;
        }

        // Center Ding
        if (d <= rInner) {
          const dt = d / rInner;
          r = Math.floor(16 + (1 - dt) * 40);
          g = Math.floor(130 + (1 - dt) * 60);
          b = Math.floor(200 + (1 - dt) * 45);
          if (d <= rInner * 0.45) {
            r = 10; g = 50; b = 90;
          }
        }

        // Tone field bumps (8 fields)
        const angle = Math.atan2(dy, dx);
        const distFromRing = Math.abs(d - (rOuter * 0.68));
        if (distFromRing < width * 0.08) {
          // Check 8 sectors
          const sector = Math.PI / 4;
          const modAngle = Math.abs((angle + Math.PI * 2) % sector - (sector / 2));
          if (modAngle < 0.22) {
            r = Math.min(255, r + 40);
            g = Math.min(255, g + 55);
            b = Math.min(255, b + 75);
          }
        }
      }

      rawBytes[pos++] = r;
      rawBytes[pos++] = g;
      rawBytes[pos++] = b;
      rawBytes[pos++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const compressed = zlib.deflateSync(rawBytes);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

const pubDir = path.resolve('public');
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

fs.writeFileSync(path.join(pubDir, 'pwa-192x192.png'), generatePng(192));
fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), generatePng(512));
fs.writeFileSync(path.join(pubDir, 'pwa-maskable-512x512.png'), generatePng(512));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), generatePng(180));
fs.writeFileSync(path.join(pubDir, 'favicon.ico'), generatePng(48));

console.log('Successfully generated all PWA icons.');
