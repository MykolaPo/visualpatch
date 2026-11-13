import { loadImage } from './imageImporter';

export interface DiscrepancyRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  severity: 'minor' | 'major';
}

export interface VisualDiffResult {
  diffImageDataUrl: string;
  matchPercentage: number;
  mismatchPixels: number;
  totalPixels: number;
  regions: DiscrepancyRegion[];
}

export async function compareImagesVisually(
  expectedDataUrl: string,
  actualDataUrl: string
): Promise<VisualDiffResult> {
  const [expImg, actImg] = await Promise.all([
    loadImage(expectedDataUrl),
    loadImage(actualDataUrl),
  ]);

  const w = expImg.naturalWidth;
  const h = expImg.naturalHeight;

  const cExp = document.createElement('canvas');
  cExp.width = w;
  cExp.height = h;
  const ctxExp = cExp.getContext('2d')!;
  ctxExp.drawImage(expImg, 0, 0, w, h);
  const expData = ctxExp.getImageData(0, 0, w, h).data;

  const cAct = document.createElement('canvas');
  cAct.width = w;
  cAct.height = h;
  const ctxAct = cAct.getContext('2d')!;
  ctxAct.drawImage(actImg, 0, 0, w, h);
  const actData = ctxAct.getImageData(0, 0, w, h).data;

  const cDiff = document.createElement('canvas');
  cDiff.width = w;
  cDiff.height = h;
  const ctxDiff = cDiff.getContext('2d')!;
  const outImg = ctxDiff.createImageData(w, h);
  const out = outImg.data;

  // Downsampled grid (16x16px cells) to group discrepancy bounding boxes
  const cell = 16;
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const grid = new Uint8Array(gw * gh);

  let mismatchPixels = 0;
  const totalPixels = w * h;
  const threshold = 28;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const diff =
        Math.abs(expData[idx] - actData[idx]) +
        Math.abs(expData[idx + 1] - actData[idx + 1]) +
        Math.abs(expData[idx + 2] - actData[idx + 2]);

      if (diff > threshold) {
        mismatchPixels++;
        out[idx] = 236;
        out[idx + 1] = 72;
        out[idx + 2] = 153;
        out[idx + 3] = 230;
        const gx = Math.floor(x / cell);
        const gy = Math.floor(y / cell);
        grid[gy * gw + gx] = 1;
      } else {
        out[idx] = Math.round(actData[idx] * 0.45);
        out[idx + 1] = Math.round(actData[idx + 1] * 0.45);
        out[idx + 2] = Math.round(actData[idx + 2] * 0.45);
        out[idx + 3] = 255;
      }
    }
  }

  ctxDiff.putImageData(outImg, 0, 0);

  // Connected components on discrepancy grid
  const visited = new Uint8Array(gw * gh);
  const regions: DiscrepancyRegion[] = [];
  const stack: number[] = [];

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const start = gy * gw + gx;
      if (!grid[start] || visited[start]) continue;
      stack.push(start);
      visited[start] = 1;
      let minX = gx;
      let maxX = gx;
      let minY = gy;
      let maxY = gy;
      let cells = 0;

      while (stack.length > 0) {
        const cur = stack.pop()!;
        cells++;
        const cx = cur % gw;
        const cy = (cur - cx) / gw;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          cx > 0 ? cur - 1 : -1,
          cx < gw - 1 ? cur + 1 : -1,
          cy > 0 ? cur - gw : -1,
          cy < gh - 1 ? cur + gw : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && grid[n] && !visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        }
      }

      if (cells >= 2) {
        const rx = minX * cell;
        const ry = minY * cell;
        const rw = Math.min(w - rx, (maxX - minX + 1) * cell);
        const rh = Math.min(h - ry, (maxY - minY + 1) * cell);
        regions.push({
          id: `diff_${regions.length + 1}`,
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          severity: cells >= 10 ? 'major' : 'minor',
        });

        ctxDiff.strokeStyle = '#f43f5e';
        ctxDiff.lineWidth = 2;
        ctxDiff.strokeRect(rx, ry, rw, rh);
      }
    }
  }

  const matchPercentage = Number(
    (100 - (mismatchPixels / Math.max(1, totalPixels)) * 100).toFixed(2)
  );

  return {
    diffImageDataUrl: cDiff.toDataURL('image/png'),
    matchPercentage,
    mismatchPixels,
    totalPixels,
    regions: regions.slice(0, 20),
  };
}
