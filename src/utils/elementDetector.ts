import type { DetectedRegion, ElementType } from '../types/editor';
import { loadImage } from './imageImporter';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  pass: 'fine' | 'line' | 'container';
}

function classifyRegion(
  _x: number,
  y: number,
  w: number,
  h: number,
  canvasW: number,
  canvasH: number,
  pass: Box['pass']
): { suggestedType: ElementType; suggestedName: string; confidence: number } {
  const aspect = w / Math.max(1, h);
  const areaRatio = (w * h) / (canvasW * canvasH);

  if (y < canvasH * 0.14 && w > canvasW * 0.45 && h <= 110) {
    return { suggestedType: 'container', suggestedName: 'Панель / Header', confidence: 0.91 };
  }
  if (pass === 'container' || (areaRatio > 0.025 && w > 180 && h > 90)) {
    return { suggestedType: 'container', suggestedName: 'Карточка / Контейнер', confidence: 0.86 };
  }
  if (h >= 16 && h <= 48 && w >= 28 && w <= 220 && aspect >= 1.2 && aspect <= 7.5) {
    return { suggestedType: 'button', suggestedName: h <= 28 ? 'Тег / Бейдж' : 'Кнопка', confidence: 0.88 };
  }
  if (aspect > 4.2 && h >= 24 && h <= 56 && w > 180) {
    return { suggestedType: 'container', suggestedName: 'Поле / Панель', confidence: 0.85 };
  }
  if (h <= 32 && w >= 24 && aspect >= 1.5) {
    return { suggestedType: 'text', suggestedName: 'Текст', confidence: 0.82 };
  }
  if (w <= 42 && h <= 42 && aspect >= 0.7 && aspect <= 1.4) {
    return { suggestedType: 'button', suggestedName: 'Иконка / Счётчик', confidence: 0.79 };
  }
  return { suggestedType: 'raster', suggestedName: 'UI-элемент', confidence: 0.77 };
}

function computeIoU(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function extractConnectedBoxes(
  mask: Uint8Array,
  width: number,
  height: number,
  minW: number,
  minH: number,
  maxAreaRatio: number,
  pass: Box['pass']
): Box[] {
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const boxes: Box[] = [];
  const maxArea = width * height * maxAreaRatio;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;

      let sp = 0;
      stack[sp++] = start;
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (sp > 0) {
        const cur = stack[--sp];
        const cx = cur % width;
        const cy = (cur - cx) / width;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const n1 = cur - 1;
        const n2 = cur + 1;
        const n3 = cur - width;
        const n4 = cur + width;

        if (cx > 0 && mask[n1] && !visited[n1]) {
          visited[n1] = 1;
          stack[sp++] = n1;
        }
        if (cx < width - 1 && mask[n2] && !visited[n2]) {
          visited[n2] = 1;
          stack[sp++] = n2;
        }
        if (cy > 0 && mask[n3] && !visited[n3]) {
          visited[n3] = 1;
          stack[sp++] = n3;
        }
        if (cy < height - 1 && mask[n4] && !visited[n4]) {
          visited[n4] = 1;
          stack[sp++] = n4;
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (bw >= minW && bh >= minH && bw * bh <= maxArea) {
        boxes.push({ x: minX, y: minY, w: bw, h: bh, pass });
      }
    }
  }
  return boxes;
}

function buildEdgeMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
): Uint8Array {
  const edge = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const pr = (idx + 1) * 4;
      const pl = (idx - 1) * 4;
      const pd = (idx + width) * 4;
      const pu = (idx - width) * 4;

      // Max channel difference captures both luminance edges and colored borders/badges on dark UI
      const dx = Math.max(
        Math.abs(data[pr] - data[pl]),
        Math.abs(data[pr + 1] - data[pl + 1]),
        Math.abs(data[pr + 2] - data[pl + 2])
      );
      const dy = Math.max(
        Math.abs(data[pd] - data[pu]),
        Math.abs(data[pd + 1] - data[pu + 1]),
        Math.abs(data[pd + 2] - data[pu + 2])
      );

      if (dx > threshold || dy > threshold) {
        edge[idx] = 1;
      }
    }
  }
  return edge;
}

function dilateMask(
  src: Uint8Array,
  width: number,
  height: number,
  rx: number,
  ry: number
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = ry; y < height - ry; y++) {
    for (let x = rx; x < width - rx; x++) {
      const idx = y * width + x;
      if (!src[idx]) continue;
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          out[(y + dy) * width + (x + dx)] = 1;
        }
      }
    }
  }
  return out;
}

export async function detectVisualElements(
  sourceImageUrl: string
): Promise<DetectedRegion[]> {
  const img = await loadImage(sourceImageUrl);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // Higher working resolution (up to 1024px) preserves pills, badges, buttons, and dark-mode borders
  const targetW = Math.min(1024, origW);
  const scale = targetW / origW;
  const targetH = Math.max(1, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const { data } = ctx.getImageData(0, 0, targetW, targetH);

  // Pass 1: Fine elements (buttons, pills, badges, icons, counters) - minimal dilation
  const fineEdge = buildEdgeMask(data, targetW, targetH, 18);
  const fineMask = dilateMask(fineEdge, targetW, targetH, 1, 0);
  const fineBoxes = extractConnectedBoxes(
    fineMask,
    targetW,
    targetH,
    Math.max(12, Math.round(16 * scale)),
    Math.max(10, Math.round(14 * scale)),
    0.15,
    'fine'
  );

  // Pass 2: Text lines / multi-word headers / inputs (horizontal grouping)
  const lineEdge = buildEdgeMask(data, targetW, targetH, 22);
  const lineMask = dilateMask(lineEdge, targetW, targetH, 3, 0);
  const lineBoxes = extractConnectedBoxes(
    lineMask,
    targetW,
    targetH,
    Math.max(20, Math.round(30 * scale)),
    Math.max(10, Math.round(14 * scale)),
    0.25,
    'line'
  );

  // Pass 3: Containers / cards / panels (low threshold + 1px dilation)
  const contEdge = buildEdgeMask(data, targetW, targetH, 12);
  const contMask = dilateMask(contEdge, targetW, targetH, 1, 1);
  const contBoxes = extractConnectedBoxes(
    contMask,
    targetW,
    targetH,
    Math.max(50, Math.round(90 * scale)),
    Math.max(30, Math.round(45 * scale)),
    0.65,
    'container'
  ).filter((b) => b.w * b.h > targetW * targetH * 0.015);

  // Merge & deduplicate near-identical boxes (IoU > 0.72), keeping child elements inside containers
  const allBoxes = [...fineBoxes, ...lineBoxes, ...contBoxes];
  const kept: Box[] = [];

  for (const box of allBoxes) {
    const duplicate = kept.some((k) => computeIoU(k, box) > 0.72);
    if (!duplicate) {
      kept.push(box);
    }
  }

  // Sort in natural reading order (top-to-bottom in 24px bands, then left-to-right)
  kept.sort((a, b) => {
    const bandA = Math.floor(a.y / 24);
    const bandB = Math.floor(b.y / 24);
    if (bandA !== bandB) return bandA - bandB;
    return a.x - b.x;
  });

  return kept.slice(0, 90).map((b, idx) => {
    const x = Math.max(0, Math.round(b.x / scale));
    const y = Math.max(0, Math.round(b.y / scale));
    const width = Math.min(origW - x, Math.round(b.w / scale));
    const height = Math.min(origH - y, Math.round(b.h / scale));
    const meta = classifyRegion(x, y, width, height, origW, origH, b.pass);
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
}
