import type { BgRestoreMode, SourceCrop } from '../types/editor';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_DIMENSION = 16384;

export async function validateAndReadImageFile(
  file: File
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Файл превышает максимальный размер 25 МБ.');
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isPng =
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47;
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isWebp =
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50;

  if (!isPng && !isJpeg && !isWebp) {
    throw new Error('Неподдерживаемый формат. Используйте PNG, JPEG или WebP.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения.'));
    reader.readAsDataURL(file);
  });

  const img = await loadImage(dataUrl);
  if (img.naturalWidth === 0 || img.naturalHeight === 0) {
    throw new Error('Изображение повреждено или имеет нулевые размеры.');
  }
  if (img.naturalWidth > MAX_DIMENSION || img.naturalHeight > MAX_DIMENSION) {
    throw new Error(`Превышено максимальное разрешение (${MAX_DIMENSION}px).`);
  }

  return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Ошибка загрузки изображения в Canvas.'));
    img.src = src;
  });
}

export async function cropImageRegion(
  sourceImageUrl: string,
  crop: SourceCrop
): Promise<string> {
  const img = await loadImage(sourceImageUrl);
  const sx = Math.max(0, Math.round(crop.x));
  const sy = Math.max(0, Math.round(crop.y));
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(crop.width)));
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(crop.height)));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступен');

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL('image/png');
}

function medianChannel(values: number[]): number {
  if (values.length === 0) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function sampleBorderColorFromImage(
  img: HTMLImageElement,
  crop: SourceCrop
): string {
  const sx = Math.max(0, Math.round(crop.x));
  const sy = Math.max(0, Math.round(crop.y));
  const sw = Math.max(1, Math.round(crop.width));
  const sh = Math.max(1, Math.round(crop.height));

  const pad = 4;
  const rx = Math.max(0, sx - pad);
  const ry = Math.max(0, sy - pad);
  const rw = Math.min(img.naturalWidth - rx, sw + pad * 2);
  const rh = Math.min(img.naturalHeight - ry, sh + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#ffffff';
  ctx.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);

  const data = ctx.getImageData(0, 0, rw, rh).data;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const inInner =
        x >= sx - rx &&
        x < sx - rx + sw &&
        y >= sy - ry &&
        y < sy - ry + sh;
      if (!inInner) {
        const idx = (y * rw + x) * 4;
        rs.push(data[idx]);
        gs.push(data[idx + 1]);
        bs.push(data[idx + 2]);
      }
    }
  }

  const r = medianChannel(rs).toString(16).padStart(2, '0');
  const g = medianChannel(gs).toString(16).padStart(2, '0');
  const b = medianChannel(bs).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export async function createBackgroundPatchDataUrl(
  sourceImageUrl: string,
  crop: SourceCrop,
  mode: BgRestoreMode,
  solidColor?: string
): Promise<{ dataUrl: string; dominantColor: string; isComplexBg: boolean }> {
  if (mode === 'none') {
    return { dataUrl: '', dominantColor: 'transparent', isComplexBg: false };
  }

  const img = await loadImage(sourceImageUrl);
  const sx = Math.max(0, Math.round(crop.x));
  const sy = Math.max(0, Math.round(crop.y));
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(crop.width)));
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(crop.height)));

  const dominantColor = solidColor || sampleBorderColorFromImage(img, crop);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = sw;
  outCanvas.height = sh;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return { dataUrl: '', dominantColor, isComplexBg: false };
  }

  if (mode === 'solid') {
    outCtx.fillStyle = dominantColor;
    outCtx.fillRect(0, 0, sw, sh);
    return { dataUrl: outCanvas.toDataURL('image/png'), dominantColor, isComplexBg: false };
  }

  const pad = 6;
  const rx = Math.max(0, sx - pad);
  const ry = Math.max(0, sy - pad);
  const rw = Math.min(img.naturalWidth - rx, sw + pad * 2);
  const rh = Math.min(img.naturalHeight - ry, sh + pad * 2);

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = rw;
  sampleCanvas.height = rh;
  const sCtx = sampleCanvas.getContext('2d');
  if (!sCtx) {
    outCtx.fillStyle = dominantColor;
    outCtx.fillRect(0, 0, sw, sh);
    return { dataUrl: outCanvas.toDataURL('image/png'), dominantColor, isComplexBg: false };
  }
  sCtx.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);
  const sData = sCtx.getImageData(0, 0, rw, rh).data;

  const outImg = outCtx.createImageData(sw, sh);
  const out = outImg.data;
  const ox = sx - rx;
  const oy = sy - ry;

  let varianceSum = 0;
  let sampleCount = 0;

  for (let y = 0; y < sh; y++) {
    const topY = Math.max(0, oy - 1);
    const botY = Math.min(rh - 1, oy + sh);
    const ty = sh > 1 ? y / (sh - 1) : 0.5;

    for (let x = 0; x < sw; x++) {
      const leftX = Math.max(0, ox - 1);
      const rightX = Math.min(rw - 1, ox + sw);
      const tx = sw > 1 ? x / (sw - 1) : 0.5;

      const idxTop = (topY * rw + Math.min(rw - 1, ox + x)) * 4;
      const idxBot = (botY * rw + Math.min(rw - 1, ox + x)) * 4;
      const idxLeft = (Math.min(rh - 1, oy + y) * rw + leftX) * 4;
      const idxRight = (Math.min(rh - 1, oy + y) * rw + rightX) * 4;

      const rV = sData[idxTop] * (1 - ty) + sData[idxBot] * ty;
      const gV = sData[idxTop + 1] * (1 - ty) + sData[idxBot + 1] * ty;
      const bV = sData[idxTop + 2] * (1 - ty) + sData[idxBot + 2] * ty;

      const rH = sData[idxLeft] * (1 - tx) + sData[idxRight] * tx;
      const gH = sData[idxLeft + 1] * (1 - tx) + sData[idxRight + 1] * tx;
      const bH = sData[idxLeft + 2] * (1 - tx) + sData[idxRight + 2] * tx;

      const idx = (y * sw + x) * 4;
      out[idx] = Math.round((rV + rH) * 0.5);
      out[idx + 1] = Math.round((gV + gH) * 0.5);
      out[idx + 2] = Math.round((bV + bH) * 0.5);
      out[idx + 3] = 255;

      if (x % 8 === 0 && y % 8 === 0) {
        varianceSum +=
          Math.abs(sData[idxTop] - sData[idxBot]) +
          Math.abs(sData[idxLeft] - sData[idxRight]);
        sampleCount++;
      }
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  const avgDiff = sampleCount > 0 ? varianceSum / sampleCount : 0;
  return {
    dataUrl: outCanvas.toDataURL('image/png'),
    dominantColor,
    isComplexBg: avgDiff > 35,
  };
}
