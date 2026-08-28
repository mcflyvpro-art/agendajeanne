/**
 * Fabrique les icônes PWA à partir de `icon.png` (le logo source).
 *
 * Le logo a des coins arrondis transparents. On le pose sur un dégradé plein
 * reprenant ses propres couleurs : sans ça, iOS remplit la transparence en noir
 * et arrondit une seconde fois par-dessus les coins déjà arrondis.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'icon.png';
const FROM = '#7745ee';   // violet, coin haut-gauche du logo
const TO   = '#e6438b';   // rose, coin bas-droit

const background = (size) => Buffer.from(
  `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
     <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="${FROM}"/><stop offset="1" stop-color="${TO}"/>
     </linearGradient></defs>
     <rect width="${size}" height="${size}" fill="url(#g)"/>
   </svg>`
);

/** Logo détouré, redimensionné à `inner`, centré sur un fond dégradé de `size`. */
async function icon(size, inner = size) {
  const art = await sharp(SRC).trim().resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const pad = Math.round((size - inner) / 2);
  return sharp(background(size))
    .composite([{ input: art, top: pad, left: pad }])
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
}

mkdirSync('public/icons', { recursive: true });
const write = async (path, buf) => { await sharp(buf).toFile(path); console.log(' ', path); };

// Icônes classiques : le logo occupe tout le carré.
await write('public/icons/icon-192.png', await icon(192));
await write('public/icons/icon-512.png', await icon(512));
await write('public/icons/apple-touch-icon.png', await icon(180));

// Maskable : Android peut recadrer jusqu'à 20 % sur les bords, donc on réduit
// le logo pour que rien d'important ne tombe hors de la zone de sécurité.
await write('public/icons/maskable-512.png', await icon(512, 400));

// Favicon / icône d'onglet (App Router lit src/app/icon.png).
await write('src/app/icon.png', await icon(192));
await write('src/app/apple-icon.png', await icon(180));
console.log('Icônes générées.');
