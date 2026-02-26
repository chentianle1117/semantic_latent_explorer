/**
 * Normalize all shoe views to a consistent physical scale using
 * the side view as reference.
 *
 * Algorithm (from test harness):
 *   side   → reference: ref_W (shoe length), ref_H (shoe height)
 *   medial/top/outsole → width = ref_W, height proportional
 *   front  → width = shoe_width (derived from top view), height proportional
 *   back   → height = front_height (for internal consistency), width proportional
 *   3/4    → height = ref_H, width proportional
 *
 * Each view is tight-cropped (removing white padding) then scaled to
 * its target dimensions with a white background fill.
 */

import type { ShoeViewType } from '../types';

export interface NormalizedView {
  /** base64 (no data: prefix) of the tight-cropped + scaled image */
  base64: string;
  /** Normalized width in "shoe-scale pixels" */
  w: number;
  /** Normalized height in "shoe-scale pixels" */
  h: number;
  /** Human-readable rule for debugging */
  rule: string;
}

export type NormalizedViewMap = Partial<Record<ShoeViewType, NormalizedView>>;

/* ── Image helpers ──────────────────────────────────────────────── */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/** Ensure a base64 string has the data: prefix for loading. */
function toDataUrl(base64: string): string {
  if (base64.startsWith('data:')) return base64;
  return `data:image/jpeg;base64,${base64}`;
}

/** Strip the data: prefix if present, return raw base64. */
function stripDataPrefix(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}

/** Find the tight foreground bounding box (non-white / non-transparent pixels). */
async function getTightBbox(base64: string, whiteTh = 240): Promise<{
  x0: number; y0: number; x1: number; y1: number; w: number; h: number;
}> {
  const img = await loadImage(toDataUrl(base64));
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;

  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const alpha = d[i + 3];
      // Skip transparent pixels (alpha < 10) — they are background
      if (alpha < 10) continue;
      if (d[i] < whiteTh || d[i + 1] < whiteTh || d[i + 2] < whiteTh) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return { x0, y0, x1, y1, w: Math.max(1, x1 - x0 + 1), h: Math.max(1, y1 - y0 + 1) };
}

/** Tight-crop an image and scale to target dimensions (transparent background). */
async function cropTightAndScale(base64: string, targetW: number, targetH: number, whiteTh = 240): Promise<string> {
  const bbox = await getTightBbox(base64, whiteTh);
  const img = await loadImage(toDataUrl(base64));

  const crop = document.createElement('canvas');
  crop.width = bbox.w; crop.height = bbox.h;
  crop.getContext('2d')!.drawImage(img, bbox.x0, bbox.y0, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);

  const out = document.createElement('canvas');
  out.width = targetW; out.height = targetH;
  const outCtx = out.getContext('2d')!;
  // Transparent background — rembg handles background removal separately
  outCtx.clearRect(0, 0, targetW, targetH);
  outCtx.drawImage(crop, 0, 0, targetW, targetH);

  return stripDataPrefix(out.toDataURL('image/png'));
}

/* ── Main normalizer ────────────────────────────────────────────── */

/**
 * Normalize all views to a consistent shoe-scale.
 *
 * @param sideBase64   - The side view image (raw base64, no prefix)
 * @param viewBases    - Map of view type → raw base64 (no prefix). Does not need to include 'side'.
 * @returns Map of view type → { base64, w, h, rule }
 */
export async function normalizeAllViewScales(
  sideBase64: string,
  viewBases: Partial<Record<ShoeViewType, string>>,
): Promise<NormalizedViewMap> {
  const whiteTh = 240;

  // 1. Side reference dimensions
  const sideBbox = await getTightBbox(sideBase64, whiteTh);
  const ref_W = sideBbox.w;
  const ref_H = sideBbox.h;
  console.log(`[normalizeViewScale] side ref: ${ref_W}×${ref_H}`);

  // 2. Derive shoe_width from top or outsole view
  let shoe_width = Math.round(ref_W * 0.38); // fallback
  if (viewBases['top']) {
    const tb = await getTightBbox(viewBases['top'], whiteTh);
    shoe_width = Math.round(tb.h * (ref_W / tb.w));
    console.log(`[normalizeViewScale] top ${tb.w}×${tb.h} → shoe_width=${shoe_width}`);
  } else if (viewBases['outsole']) {
    const ob = await getTightBbox(viewBases['outsole'], whiteTh);
    shoe_width = Math.round(ob.h * (ref_W / ob.w));
  }

  // 3. Normalize each view
  const result: NormalizedViewMap = {};

  // Side — use viewBases['side'] if provided (e.g., newly generated side from update pipeline),
  // otherwise use the reference sideBase64. ref_W/ref_H always come from the reference.
  const sideSource = viewBases['side'] ?? sideBase64;
  const sideScaled = await cropTightAndScale(sideSource, ref_W, ref_H, whiteTh);
  result['side'] = { base64: sideScaled, w: ref_W, h: ref_H, rule: 'reference' };

  // Landscape views: width = ref_W, height proportional
  for (const k of ['medial', 'top', 'outsole'] as ShoeViewType[]) {
    if (!viewBases[k]) continue;
    const b = await getTightBbox(viewBases[k]!, whiteTh);
    const tH = Math.round(b.h * ref_W / b.w);
    const scaled = await cropTightAndScale(viewBases[k]!, ref_W, tH, whiteTh);
    result[k] = { base64: scaled, w: ref_W, h: tH, rule: `width→ref_W=${ref_W}` };
  }

  // Front: width = shoe_width, height proportional
  let front_H = 0;
  if (viewBases['front']) {
    const b = await getTightBbox(viewBases['front']!, whiteTh);
    front_H = Math.round(b.h * shoe_width / b.w);
    const scaled = await cropTightAndScale(viewBases['front']!, shoe_width, front_H, whiteTh);
    result['front'] = { base64: scaled, w: shoe_width, h: front_H, rule: `width→shoe_width=${shoe_width}` };
  }

  // Back: height = front_H (or proportional fallback), width proportional
  if (viewBases['back']) {
    const b = await getTightBbox(viewBases['back']!, whiteTh);
    const bk_H = front_H || Math.round(b.h * shoe_width / b.w);
    const bk_W = Math.round(b.w * bk_H / b.h);
    const scaled = await cropTightAndScale(viewBases['back']!, bk_W, bk_H, whiteTh);
    result['back'] = { base64: scaled, w: bk_W, h: bk_H, rule: `height→front_H=${bk_H}` };
  }

  // 3/4 views: height = ref_H, width proportional — capped to ref_W
  for (const k of ['3/4-front', '3/4-back'] as ShoeViewType[]) {
    if (!viewBases[k]) continue;
    const b = await getTightBbox(viewBases[k]!, whiteTh);
    let tW = Math.round(b.w * ref_H / b.h);
    let tH = ref_H;
    // If proportional width exceeds side reference, cap to ref_W
    if (tW > ref_W) {
      tW = ref_W;
      tH = Math.round(b.h * ref_W / b.w);
    }
    const scaled = await cropTightAndScale(viewBases[k]!, tW, tH, whiteTh);
    result[k] = { base64: scaled, w: tW, h: tH, rule: `height→ref_H=${ref_H},cap_W=${ref_W}` };
  }

  console.log('[normalizeViewScale] done:', Object.entries(result).map(([k, v]) => `${k}:${v.w}×${v.h}`).join(', '));
  return result;
}
