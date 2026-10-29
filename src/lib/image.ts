'use client';

/** Dessine l'image réduite à `maxDim` px de côté sur un canvas. */
async function drawScaled(file: File, maxDim: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image illisible'));
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Redimensionne et recompresse une image côté navigateur avant envoi.
 * Une capture d'écran PC en pleine résolution peut peser plusieurs Mo une fois
 * encodée en base64 — assez pour dépasser la limite de requête d'une fonction
 * serverless Vercel (~4,5 Mo) et faire échouer l'appel avant même d'atteindre
 * le serveur. 1600 px de côté suffit largement à une IA pour lire un texte.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.85): Promise<{ base64: string; mime: string }> {
  const canvas = await drawScaled(file, maxDim);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { base64: dataUrl.split(',')[1], mime: 'image/jpeg' };
}

/** Même réduction, rendue sous forme de fichier JPEG prêt à téléverser. */
export async function compressToJpeg(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  const canvas = await drawScaled(file, maxDim);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', quality));
}
