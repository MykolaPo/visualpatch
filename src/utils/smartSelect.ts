import type { SourceCrop } from '../types/editor';
import { loadImage } from './imageImporter';

export interface Point {
  x: number;
  y: number;
}

export async function findSmartElementBounds(
  sourceImageUrl: string,
  points: Point[]
): Promise<SourceCrop | null> {
  if (points.length === 0) return null;

  const img = await loadImage(sourceImageUrl);
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;

  let sMinX = Infinity;
  let sMinY = Infinity;
  let sMaxX = -Infinity;
  let sMaxY = -Infinity;

  for (const p of points) {
    if (p.x < sMinX) sMinX = p.x;
    if (p.y < sMinY) sMinY = p.y;
    if (p.x > sMaxX) sMaxX = p.x;
    if (p.y > sMaxY) sMaxY = p.y;
  }

  // Expand local search window around the user's stroke
  const pad = 28;
  const rx = Math.max(0, Math.floor(sMinX - pad));
  const ry = Math.max(0, Math.floor(sMinY - pad));
  const rx2 = Math.min(imgW, Math.ceil(sMaxX + pad));
  const ry2 = Math.min(imgH, Math.ceil(sMaxY + pad));
  const rw = rx2 - rx;
  const rh = ry2 - ry;
  if (rw < 8 || rh < 8) return null;

  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);
  const { data } = ctx.getImageData(0, 0, rw, rh);

  // Estimate local background color from the 4 corners of the search window
  const cornerCoords = [
    [1, 1],
    [rw - 2, 1],
    [1, rh - 2],
    [rw - 2, rh - 2],
  ];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const [cx, cy] of cornerCoords) {
    const idx = (cy * rw + cx) * 4;
    bgR += data[idx];
    bgG += data[idx + 1];
    bgB += data[idx + 2];
  }
  bgR /= 4;
  bgG /= 4;
  bgB /= 4;

  // Build foreground mask (color difference from local background OR strong local edge)
  const fg = new Uint8Array(rw * rh);
  for (let y = 1; y < rh - 1; y++) {
    for (let x = 1; x < rw - 1; x++) {
      const idx = y * rw + x;
      const p = idx * 4;
      const bgDist =
        Math.abs(data[p] - bgR) +
        Math.abs(data[p + 1] - bgG) +
        Math.abs(data[p + 2] - bgB);

      const pr = (idx + 1) * 4;
      const pd = (idx + rw) * 4;
      const edge =
        Math.abs(data[pr] - data[p]) +
        Math.abs(data[pr + 1] - data[p + 1]) +
        Math.abs(data[pr + 2] - data[p + 2]) +
        Math.abs(data[pd] - data[p]) +
        Math.abs(data[pd + 1] - data[p + 1]) +
        Math.abs(data[pd + 2] - data[p + 2]);

      if (bgDist > 34 || edge > 36) {
        fg[idx] = 1;
      }
    }
  }

  // Dilate 2px horizontally, 1px vertically to bridge letters inside a single word/button
  const dilated = new Uint8Array(rw * rh);
  for (let y = 1; y < rh - 1; y++) {
    for (let x = 2; x < rw - 2; x++) {
      const idx = y * rw + x;
      if (
        fg[idx] ||
        fg[idx - 1] ||
        fg[idx + 1] ||
        fg[idx - 2] ||
        fg[idx + 2] ||
        fg[idx - rw] ||
        fg[idx + rw]
      ) {
        dilated[idx] = 1;
      }
    }
  }

  // Flood-fill only from pixels touched by the user's stroke (with 4px brush radius)
  const visited = new Uint8Array(rw * rh);
  const stack: number[] = [];

  for (const pt of points) {
    const lx = Math.round(pt.x - rx);
    const ly = Math.round(pt.y - ry);
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const nx = lx + dx;
        const ny = ly + dy;
        if (nx >= 0 && nx < rw && ny >= 0 && ny < rh) {
          const idx = ny * rw + nx;
          if (dilated[idx] && !visited[idx]) {
            visited[idx] = 1;
            stack.push(idx);
          }
        }
      }
    }
  }

  let minX = rw;
  let minY = rh;
  let maxX = -1;
  let maxY = -1;

  while (stack.length > 0) {
    const cur = stack.pop()!;
    const cx = cur % rw;
    const cy = (cur - cx) / rw;
    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;

    const neighbors = [
      cx > 0 ? cur - 1 : -1,
      cx < rw - 1 ? cur + 1 : -1,
      cy > 0 ? cur - rw : -1,
      cy < rh - 1 ? cur + rw : -1,
    ];
    for (const n of neighbors) {
      if (n >= 0 && dilated[n] && !visited[n]) {
        visited[n] = 1;
        stack.push(n);
      }
    }
  }

  if (maxX > minX + 6 && maxY > minY + 6) {
    return {
      x: rx + minX,
      y: ry + minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  // Fallback to stroke bounding box
  const fx = Math.max(0, Math.floor(sMinX));
  const fy = Math.max(0, Math.floor(sMinY));
  const fw = Math.max(16, Math.min(imgW - fx, Math.ceil(sMaxX - fx)));
  const fh = Math.max(16, Math.min(imgH - fy, Math.ceil(sMaxY - fy)));
  return { x: fx, y: fy, width: fw, height: fh };
}

export async function cropPolygonRegion(
  sourceImageUrl: string,
  points: Point[]
): Promise<{ crop: SourceCrop; imageDataUrl: string } | null> {
  if (points.length < 3) return null;

  const img = await loadImage(sourceImageUrl);
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const sx = Math.max(0, Math.floor(minX));
  const sy = Math.max(0, Math.floor(minY));
  const sw = Math.max(8, Math.min(imgW - sx, Math.ceil(maxX - sx)));
  const sh = Math.max(8, Math.min(imgH - sy, Math.ceil(maxY - sy)));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.beginPath();
  points.forEach((p, idx) => {
    const lx = p.x - sx;
    const ly = p.y - sy;
    if (idx === 0) ctx.moveTo(lx, ly);
    else ctx.lineTo(lx, ly);
  });
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return {
    crop: { x: sx, y: sy, width: sw, height: sh },
    imageDataUrl: canvas.toDataURL('image/png'),
  };
}
