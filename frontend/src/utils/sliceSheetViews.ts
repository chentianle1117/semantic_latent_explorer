/**
 * Sheet slicer — blob detection (CV-based foreground segmentation).
 *
 * Uses Union-Find connected components on a foreground mask to detect
 * shoe blobs in generated sheets. Sorts blobs row-major (Y-centroid
 * clustering → X sort within rows) and maps to view labels.
 *
 * Ported from the working test harness blob detection algorithm.
 */

import type { ShoeViewType } from '../types';

/* ── Image loader ── */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load sheet image: ${e}`));
    img.src = url;
  });
}

/* ── Blob detection core ── */

interface Blob {
  x0: number; y0: number; x1: number; y1: number;
  area: number; cx: number; cy: number;
}

/**
 * Detect foreground blobs in an image via:
 * 1. White-threshold foreground mask
 * 2. Morphological close (dilate → erode) to fill gaps
 * 3. Union-Find connected components
 * 4. Filter tiny noise, sort row-major
 */
function detectBlobs(
  imageData: ImageData,
  W: number,
  H: number,
  whiteTh = 240,
  closeR = 1,
): Blob[] {
  const data = imageData.data;
  const N = W * H;

  // Foreground mask: pixel is foreground if any channel < whiteTh
  const fg = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    fg[i] = (r < whiteTh || g < whiteTh || b < whiteTh) ? 1 : 0;
  }

  // Morphological close (dilate then erode)
  let closed = fg;
  if (closeR > 0) {
    const dil = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let found = false;
        for (let dy = -closeR; dy <= closeR && !found; dy++) {
          for (let dx = -closeR; dx <= closeR && !found; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < H && nx >= 0 && nx < W && fg[ny * W + nx]) found = true;
          }
        }
        dil[y * W + x] = found ? 1 : 0;
      }
    }
    closed = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let all = true;
        for (let dy = -closeR; dy <= closeR && all; dy++) {
          for (let dx = -closeR; dx <= closeR && all; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= H || nx < 0 || nx >= W || !dil[ny * W + nx]) all = false;
          }
        }
        closed[y * W + x] = all ? 1 : 0;
      }
    }
  }

  // Union-Find
  const par = new Int32Array(N);
  const rnk = new Uint8Array(N);
  for (let i = 0; i < N; i++) par[i] = i;

  function find(x: number): number {
    while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; }
    return x;
  }
  function union(a: number, b: number): void {
    a = find(a); b = find(b);
    if (a === b) return;
    if (rnk[a] < rnk[b]) { const t = a; a = b; b = t; }
    par[b] = a;
    if (rnk[a] === rnk[b]) rnk[a]++;
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!closed[i]) continue;
      if (x > 0 && closed[i - 1]) union(i, i - 1);
      if (y > 0 && closed[i - W]) union(i, i - W);
    }
  }

  // Collect bounding boxes
  const bb = new Map<number, { x0: number; y0: number; x1: number; y1: number; count: number }>();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!closed[i]) continue;
      const r = find(i);
      if (!bb.has(r)) bb.set(r, { x0: x, y0: y, x1: x, y1: y, count: 0 });
      const b = bb.get(r)!;
      b.x0 = Math.min(b.x0, x);
      b.y0 = Math.min(b.y0, y);
      b.x1 = Math.max(b.x1, x);
      b.y1 = Math.max(b.y1, y);
      b.count++;
    }
  }

  // Filter tiny noise blobs (< 0.5% of image)
  const minArea = N * 0.005;
  const blobs: Blob[] = [];
  for (const b of bb.values()) {
    if (b.count < minArea) continue;
    blobs.push({
      x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
      area: b.count,
      cx: (b.x0 + b.x1) / 2,
      cy: (b.y0 + b.y1) / 2,
    });
  }

  if (!blobs.length) return [];

  // Row-major sort: cluster by Y-centroid, then sort left-to-right within rows
  blobs.sort((a, b) => a.cy - b.cy);
  const rows: Blob[][] = [];
  let cur = [blobs[0]];
  for (let i = 1; i < blobs.length; i++) {
    const gap = blobs[i].cy - blobs[i - 1].cy;
    const rowH = Math.max(...cur.map(b => b.y1 - b.y0));
    if (gap > rowH * 0.3) {
      rows.push(cur);
      cur = [blobs[i]];
    } else {
      cur.push(blobs[i]);
    }
  }
  rows.push(cur);

  const sorted: Blob[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.cx - b.cx);
    sorted.push(...row);
  }

  console.log(`[detectBlobs] ${sorted.length} blobs in ${rows.length} rows: ${rows.map(r => r.length).join(', ')}`);
  sorted.forEach((b, i) => {
    console.log(`  [${i}] (${b.x0},${b.y0})-(${b.x1},${b.y1}) ${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1}`);
  });

  return sorted;
}

/* ── Sheet slicer using blob detection ── */

/**
 * Slice a sheet image by detecting blobs and mapping them to view labels.
 * Each blob is tight-cropped (with 2px padding) and returned as base64.
 */
async function sliceByBlobs(
  imageUrl: string,
  viewLabels: string[],
): Promise<Record<string, string>> {
  const img = await loadImage(imageUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  console.log(`[sliceByBlobs] ${W}×${H}, expecting ${viewLabels.length} views`);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const blobs = detectBlobs(ctx.getImageData(0, 0, W, H), W, H);

  if (blobs.length < viewLabels.length) {
    console.warn(`[sliceByBlobs] Expected ${viewLabels.length} blobs, got ${blobs.length}`);
  }

  const results: Record<string, string> = {};
  const count = Math.min(blobs.length, viewLabels.length);

  for (let i = 0; i < count; i++) {
    const b = blobs[i];
    // Tight crop with 2px padding
    const sx = Math.max(0, b.x0 - 2);
    const sy = Math.max(0, b.y0 - 2);
    const ex = Math.min(W, b.x1 + 2);
    const ey = Math.min(H, b.y1 + 2);
    const cw = ex - sx;
    const ch = ey - sy;

    canvas.width = cw;
    canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);

    results[viewLabels[i]] = canvas.toDataURL('image/jpeg', 0.92)
      .replace(/^data:image\/\w+;base64,/, '');

    console.log(`[sliceByBlobs]   ${viewLabels[i]}: (${sx},${sy}) ${cw}×${ch}`);
  }

  return results;
}

/* ── Public API ── */

/**
 * Slice a 5-view multi-view sheet via blob detection.
 * Expected blob order (row-major): medial, top, front, back, outsole
 */
export async function sliceMultiViewSheet(imageUrl: string): Promise<Record<string, string>> {
  console.log('[sliceMultiViewSheet]', imageUrl);
  return sliceByBlobs(imageUrl, ['medial', 'top', 'front', 'back', 'outsole']);
}

/**
 * Slice a 6-view multi-view sheet (with side) via blob detection.
 * Expected blob order (row-major): side, medial, top, front, back, outsole
 */
export async function sliceMultiViewSheetWithSide(imageUrl: string): Promise<Record<string, string>> {
  console.log('[sliceMultiViewSheetWithSide]', imageUrl);
  return sliceByBlobs(imageUrl, ['side', 'medial', 'top', 'front', 'back', 'outsole']);
}

/**
 * Slice a 2-view 3/4 sheet via blob detection.
 * Expected blob order (left-to-right): 3/4-front, 3/4-back
 */
export async function sliceQuarterSheet(imageUrl: string): Promise<Record<string, string>> {
  console.log('[sliceQuarterSheet]', imageUrl);
  return sliceByBlobs(imageUrl, ['3/4-front', '3/4-back']);
}

/**
 * Legacy: Slice a 3x2 contact sheet (6 views) via naive grid.
 */
export async function sliceContactSheet(imageUrl: string): Promise<Record<string, string>> {
  const img = await loadImage(imageUrl);
  const W = img.naturalWidth, H = img.naturalHeight;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const cw = Math.floor(W / 3), ch = Math.floor(H / 2);
  const grid: { row: number; col: number; view: ShoeViewType }[] = [
    { row: 0, col: 0, view: 'side' },
    { row: 0, col: 1, view: '3/4-front' },
    { row: 0, col: 2, view: 'front' },
    { row: 1, col: 0, view: 'medial' },
    { row: 1, col: 1, view: '3/4-back' },
    { row: 1, col: 2, view: 'back' },
  ];
  const results: Record<string, string> = {};
  for (const { row, col, view } of grid) {
    canvas.width = cw; canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, col * cw, row * ch, cw, ch, 0, 0, cw, ch);
    results[view] = canvas.toDataURL('image/jpeg', 0.92).replace(/^data:image\/\w+;base64,/, '');
  }
  return results;
}
