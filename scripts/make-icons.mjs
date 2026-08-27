// Génère les icônes PWA (PNG) sans dépendance externe.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixels(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
// Glyphe : un « J » stylisé + une coche, dessiné en géométrie simple.
function draw(size, pad) {
  const R = size * 0.235;            // rayon des coins
  const inner = size - pad * 2;
  // Géométrie du « J » : un fût vertical prolongé par un crochet à gauche.
  const bw  = inner * 0.165;                 // épaisseur du trait
  const bx  = pad + inner * 0.585;           // bord gauche du fût
  const by0 = pad + inner * 0.14;            // haut du fût
  const hcx = pad + inner * 0.40;            // centre du crochet
  const hr  = (bx + bw / 2) - hcx;           // rayon jusqu'à l'axe du fût
  const hcy = pad + inner * 0.70;            // hauteur où le crochet démarre
  return (x, y) => {
    let inside = true;
    const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
    if (cx < R && cy < R) inside = (R - cx) ** 2 + (R - cy) ** 2 <= R * R;
    if (!inside) return [0, 0, 0, 0];
    const t = y / size;
    const r = lerp(124, 45, t), g = lerp(92, 216, t), b = lerp(255, 165, t);
    const inStem = x >= bx && x <= bx + bw && y >= by0 && y <= hcy;
    const d = Math.hypot(x - hcx, y - hcy);
    const inHook = y >= hcy && Math.abs(d - hr) <= bw / 2;
    if (inStem || inHook) return [255, 255, 255, 255];
    return [r, g, b, 255];
  };
}
mkdirSync('public/icons', { recursive: true });
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s, draw(s, s * 0.16)));
writeFileSync('public/icons/apple-touch-icon.png', png(180, draw(180, 180 * 0.14)));
// Version « maskable » : même glyphe, marge de sécurité plus large
writeFileSync('public/icons/maskable-512.png', png(512, draw(512, 512 * 0.26)));
console.log('Icônes générées dans public/icons/');
