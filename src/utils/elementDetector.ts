import type { DetectedRegion, ElementType } from '../types/editor';
import { loadImage } from './imageImporter';

function classifyRegion(
  _x: number,
  y: number,
  w: number,
  h: number,
  canvasW: number,
  canvasH: number
): { suggestedType: ElementType; suggestedName: string; confidence: number } {
  const aspect = w / Math.max(1, h);
  const areaRatio = (w * h) / (canvasW * canvasH);

  if (y < canvasH * 0.14 && w > canvasW * 0.5 && h < 120) {
    return { suggestedType: 'container', suggestedName: 'Header / Navbar', confidence: 0.89 };
  }
  if (aspect >= 1.8 && aspect <= 5.5 && h >= 26 && h <= 68 && w <= 260) {
    return { suggestedType: 'button', suggestedName: 'Кнопка', confidence: 0.86 };
  }
  if (aspect > 4.5 && h >= 30 && h <= 64 && w > 220) {
    return { suggestedType: 'container', suggestedName: 'Поисковая панель', confidence: 0.84 };
  }
  if (h < 34 && w > 60 && aspect > 2.2) {
    return { suggestedType: 'text', suggestedName: 'Текстовый блок', confidence: 0.78 };
  }
  if (areaRatio > 0.03 && aspect >= 0.6 && aspect <= 1.8) {
    return { suggestedType: 'container', suggestedName: 'Карточка / Блок', confidence: 0.81 };
  }
  return { suggestedType: 'raster', suggestedName: 'UI-элемент', confidence: 0.74 };
}

export async function detectVisualElements(
  sourceImageUrl: string
): Promise<DetectedRegion[]> {
  const img = await loadImage(sourceImageUrl);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  const targetW = Math.min(480, origW);
  const scale = targetW / origW;
  const targetH = Math.max(1, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const { data } = ctx.getImageData(0, 0, targetW, targetH);

  const gray = new Float32Array(targetW * targetH);
  for (let i = 0; i < targetW * targetH; i++) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  const edge = new Uint8Array(targetW * targetH);
  const threshold = 26;
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      const idx = y * targetW + x;
      const gx =
        -gray[idx - targetW - 1] +
        gray[idx - targetW + 1] -
        2 * gray[idx - 1] +
        2 * gray[idx + 1] -
        gray[idx + targetW - 1] +
        gray[idx + targetW + 1];
      const gy =
        -gray[idx - targetW - 1] -
        2 * gray[idx - targetW] -
        gray[idx - targetW + 1] +
        gray[idx + targetW - 1] +
        2 * gray[idx + targetW] +
        gray[idx + targetW + 1];
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > threshold) edge[idx] = 1;
    }
  }

  // Morphological dilation (2px horizontally, 1px vertically) to group nearby UI strokes
  const dilated = new Uint8Array(targetW * targetH);
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 2; x < targetW - 2; x++) {
      const idx = y * targetW + x;
      if (
        edge[idx] ||
        edge[idx - 1] ||
        edge[idx + 1] ||
        edge[idx - 2] ||
        edge[idx + 2] ||
        edge[idx - targetW] ||
        edge[idx + targetW]
      ) {
        dilated[idx] = 1;
      }
    }
  }

  const visited = new Uint8Array(targetW * targetH);
  const rawBoxes: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
  const stack = new Int32Array(targetW * targetH);

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const start = y * targetW + x;
      if (!dilated[start] || visited[start]) continue;

      let sp = 0;
      stack[sp++] = start;
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (sp > 0) {
        const cur = stack[--sp];
        const cx = cur % targetW;
        const cy = (cur - cx) / targetW;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [cur - 1, cur + 1, cur - targetW, cur + targetW];
        for (const n of neighbors) {
          if (n >= 0 && n < targetW * targetH && dilated[n] && !visited[n]) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (bw >= 14 && bh >= 10 && bw * bh < targetW * targetH * 0.75) {
        rawBoxes.push({ minX, minY, maxX, maxY });
      }
    }
  }

  const regions: DetectedRegion[] = rawBoxes
    .sort((a, b) => (b.maxX - b.minX) * (b.maxY - b.minY) - (a.maxX - a.minX) * (a.maxY - a.minY))
    .slice(0, 32)
    .map((b, idx) => {
      const x = Math.max(0, Math.round(b.minX / scale));
      const y = Math.max(0, Math.round(b.minY / scale));
      const width = Math.min(origW - x, Math.round((b.maxX - b.minX + 1) / scale));
      const height = Math.min(origH - y, Math.round((b.maxY - b.minY + 1) / scale));
      const meta = classifyRegion(x, y, width, height, origW, origH);
      return {
        id: `det_${idx + 1}`,
        x,
        y,
        width,
        height,
        confidence: meta.confidence,
        suggestedType: meta.suggestedType,
        suggestedName: `${meta.suggestedName} #${idx + 1}`,
      };
    });

  return regions;
}
