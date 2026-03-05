/**
 * Pipeline for generating all satellite views from a side view.
 *
 * Step 1: Upload side view + load/upload both templates in parallel
 * Step 2: Generate 3/4 sheet + medial view in parallel (both from side view)
 * Step 3: Slice 3/4 sheet → 3/4-front, 3/4-back; upload for multi-view refs
 * Step 4: Generate 2×2 multi-view sheet (template + side + 3/4 refs)
 * Step 5: Slice multi-view → front, top, back, outsole (gutter-based)
 * Step 6: Normalize all 8 views to consistent shoe-scale
 *
 * The 3/4 views are used as additional references for the multi-view sheet,
 * improving consistency across all generated views.
 */

import type { ShoeViewType } from '../types';
import { falClient } from '../api/falClient';
import { getMultiViewTemplate, getQuarterViewTemplate } from './multiViewTemplate';
import { sliceMultiViewSheet, sliceQuarterSheet } from './sliceSheetViews';
import { normalizeAllViewScales, type NormalizedView } from './normalizeViewScale';

export interface GeneratedView {
  /** Normalized base64 (no data: prefix) */
  base64: string;
  /** Normalized width in shoe-scale pixels */
  w: number;
  /** Normalized height in shoe-scale pixels */
  h: number;
}

/**
 * Generate all 8 satellite views from a side view image.
 * Views are normalized to consistent scale using the side view as reference.
 *
 * @returns Record mapping view type → { base64, w, h }
 *   Includes 'side' entry with reference dimensions.
 */
export async function generateAllViews(params: {
  sideImageBase64: string;
  prompt: string;
  onProgress?: (label: string, pct: number) => void;
}): Promise<Record<string, GeneratedView>> {
  const { sideImageBase64, prompt, onProgress } = params;

  onProgress?.('Uploading side view...', 5);

  // Step 1: Upload side view + load templates in parallel
  const sideBlob = await fetch(`data:image/jpeg;base64,${sideImageBase64}`).then(r => r.blob());
  const sideFile = new File([sideBlob], 'side-view.jpg', { type: 'image/jpeg' });

  const [sideUrl, multiViewDataUrl, quarterDataUrl] = await Promise.all([
    falClient.uploadFile(sideFile),
    getMultiViewTemplate(),
    getQuarterViewTemplate(),
  ]);

  onProgress?.('Loading templates...', 10);

  const [multiViewBlob, quarterBlob] = await Promise.all([
    fetch(multiViewDataUrl).then(r => r.blob()),
    fetch(quarterDataUrl).then(r => r.blob()),
  ]);

  const [multiViewTemplateUrl, quarterTemplateUrl] = await Promise.all([
    falClient.uploadFile(new File([multiViewBlob], 'multi-view-template.png', { type: 'image/png' })),
    falClient.uploadFile(new File([quarterBlob], 'quarter-view-template.png', { type: 'image/png' })),
  ]);

  onProgress?.('Generating 3/4 views + medial...', 20);

  // Step 2: Generate 3/4 sheet and medial in parallel (both only need side view)
  const [quarterResult, medialResult] = await Promise.all([
    falClient.generateQuarterViewSheet(prompt, sideUrl, quarterTemplateUrl),
    falClient.generateImageEdit({
      prompt,
      image_urls: [sideUrl],
      num_images: 1,
      genConfig: { realm: 'shoe', shoeView: 'medial' },
    }),
  ]);

  console.log('[generateAllViews] Quarter sheet URL:', quarterResult.url);
  onProgress?.('Slicing 3/4 sheet...', 45);

  // Step 3: Slice 3/4 sheet → front/back, upload slices as refs for multi-view
  const quarterViews = await sliceQuarterSheet(quarterResult.url);

  const quarter3dRefUrls: string[] = [];
  if (quarterViews['3/4-front']) {
    const b = await fetch(`data:image/jpeg;base64,${quarterViews['3/4-front']}`).then(r => r.blob());
    quarter3dRefUrls.push(await falClient.uploadFile(new File([b], '34-front.jpg', { type: 'image/jpeg' })));
  }
  if (quarterViews['3/4-back']) {
    const b = await fetch(`data:image/jpeg;base64,${quarterViews['3/4-back']}`).then(r => r.blob());
    quarter3dRefUrls.push(await falClient.uploadFile(new File([b], '34-back.jpg', { type: 'image/jpeg' })));
  }

  onProgress?.('Generating multi-view sheet...', 55);

  // Step 4: Generate 2×2 multi-view sheet (template first, then side + 3/4 refs)
  const multiViewResult = await falClient.generateMultiViewSheet(
    prompt, sideUrl, multiViewTemplateUrl,
    { additionalRefUrls: quarter3dRefUrls }
  );

  console.log('[generateAllViews] Multi-view sheet URL:', multiViewResult.url);
  onProgress?.('Slicing multi-view sheet...', 70);

  // Step 5: Slice 2×2 multi-view → front, top, back, outsole (gutter-based)
  const multiViews = await sliceMultiViewSheet(multiViewResult.url);

  onProgress?.('Normalizing view scales...', 85);

  // Step 6: Combine all views and normalize against side reference
  // Medial comes from the standalone generation (not from any sheet)
  const medialBase64 = medialResult.images.length > 0
    ? await fetchImageAsBase64(medialResult.images[0].url)
    : undefined;

  const rawViews: Partial<Record<ShoeViewType, string>> = {
    ...multiViews as Record<string, string>,
    ...quarterViews as Record<string, string>,
    ...(medialBase64 ? { medial: medialBase64 } : {}),
  } as Partial<Record<ShoeViewType, string>>;

  const normalized = await normalizeAllViewScales(sideImageBase64, rawViews);

  onProgress?.('Done', 100);

  const result: Record<string, GeneratedView> = {};
  for (const [viewType, nv] of Object.entries(normalized) as [string, NormalizedView][]) {
    result[viewType] = { base64: nv.base64, w: nv.w, h: nv.h };
  }

  const viewTypes = Object.keys(result);
  console.log(`[generateAllViews] Generated ${viewTypes.length} views: ${viewTypes.join(', ')}`);

  return result;
}

/** Fetch a URL and return raw base64 (no data: prefix) */
async function fetchImageAsBase64(url: string): Promise<string> {
  const buf = await fetch(url).then(r => r.arrayBuffer());
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}


/**
 * Update all views from an existing 3/4-front view.
 *
 *   Step 1: Generate updated 3/4 sheet from current 3/4-front (style anchor)
 *   Step 2: Upload original views as geometry bases
 *   Step 3: Parallel regeneration — each view uses [original base + updated 3/4 refs]
 *           The model is told: first image = preserve geometry, 2nd/3rd = apply this change
 *   Step 4: Slice updated multi-view sheet → front, top, back, outsole
 *   Step 5: Normalize all views using the original side as reference
 *
 * @returns Record mapping view type → { base64, w, h }
 */
export async function updateAllViews(params: {
  editPrompt: string;
  current34FrontBase64: string;
  originalSideBase64: string;
  /** Current base64 for each view — used as geometry bases in regeneration */
  originalViews?: Partial<Record<ShoeViewType, string>>;
  onProgress?: (label: string, pct: number) => void;
}): Promise<Record<string, GeneratedView>> {
  const { editPrompt, current34FrontBase64, originalSideBase64, originalViews, onProgress } = params;

  onProgress?.('Uploading 3/4-front reference...', 5);

  // ── Step 1: Upload current 3/4-front + load/upload templates in parallel ──
  const refBlob = await fetch(`data:image/jpeg;base64,${current34FrontBase64}`).then(r => r.blob());
  const refFile = new File([refBlob], 'ref-34-front.jpg', { type: 'image/jpeg' });

  const [refUrl, multiViewDataUrl, quarterDataUrl] = await Promise.all([
    falClient.uploadFile(refFile),
    getMultiViewTemplate(),
    getQuarterViewTemplate(),
  ]);

  onProgress?.('Loading templates...', 10);

  const [multiViewBlob, quarterBlob] = await Promise.all([
    fetch(multiViewDataUrl).then(r => r.blob()),
    fetch(quarterDataUrl).then(r => r.blob()),
  ]);

  const [multiViewTemplateUrl, quarterTemplateUrl] = await Promise.all([
    falClient.uploadFile(new File([multiViewBlob], 'multi-view-template.png', { type: 'image/png' })),
    falClient.uploadFile(new File([quarterBlob], 'quarter-view-template.png', { type: 'image/png' })),
  ]);

  // ── Step 2: Generate updated 3/4 sheet (style anchor — captures most 3D info) ──
  onProgress?.('Generating updated 3/4 views... (1/3)', 20);

  const quarterResult = await falClient.generateQuarterViewSheet(
    editPrompt, refUrl, quarterTemplateUrl
  );
  console.log('[updateAllViews] Quarter sheet URL:', quarterResult.url);

  const quarterViews = await sliceQuarterSheet(quarterResult.url);

  // Upload updated 3/4 slices — these become style refs for all subsequent generations
  const updated34Urls: string[] = [];
  if (quarterViews['3/4-front']) {
    const b = await fetch(`data:image/jpeg;base64,${quarterViews['3/4-front']}`).then(r => r.blob());
    updated34Urls.push(await falClient.uploadFile(new File([b], 'updated-34-front.jpg', { type: 'image/jpeg' })));
  } else {
    updated34Urls.push(refUrl); // fallback: use original 3/4-front ref
  }
  if (quarterViews['3/4-back']) {
    const b = await fetch(`data:image/jpeg;base64,${quarterViews['3/4-back']}`).then(r => r.blob());
    updated34Urls.push(await falClient.uploadFile(new File([b], 'updated-34-back.jpg', { type: 'image/jpeg' })));
  }

  // ── Step 3: Upload original view bases (geometry anchors) ──
  onProgress?.('Uploading original view bases...', 40);

  const origSideB64 = originalViews?.['side'] ?? originalSideBase64;
  const origMedialB64 = originalViews?.['medial'];

  const origSideBlob = await fetch(`data:image/jpeg;base64,${origSideB64}`).then(r => r.blob());
  const origSideUrl = await falClient.uploadFile(
    new File([origSideBlob], 'orig-side.jpg', { type: 'image/jpeg' })
  );

  let origMedialUrl: string | undefined;
  if (origMedialB64) {
    const b = await fetch(`data:image/jpeg;base64,${origMedialB64}`).then(r => r.blob());
    origMedialUrl = await falClient.uploadFile(new File([b], 'orig-medial.jpg', { type: 'image/jpeg' }));
  }

  // Geometry-preserving instruction: first image = original base, rest = style refs
  const updateInstruction = [
    `The FIRST reference image is the ORIGINAL shoe view — preserve its camera angle, shoe silhouette, and geometry EXACTLY.`,
    `The 2nd and 3rd reference images are updated 3/4-angle views showing this specific style change: ${editPrompt}.`,
    `Apply ONLY this change. Keep all other design elements, proportions, and materials identical to the FIRST image.`,
  ].join(' ');

  // ── Step 4: Parallel regeneration — all views from original bases + updated 3/4 style refs ──
  onProgress?.('Regenerating all views from updated 3/4... (2/3)', 55);

  const [multiViewResult, sideResult, medialResult] = await Promise.all([
    // Multi-view sheet: template (layout) + original side (geometry) + updated 3/4 (style)
    falClient.generateMultiViewSheet(
      updateInstruction, origSideUrl, multiViewTemplateUrl,
      { additionalRefUrls: updated34Urls }
    ),
    // Side view: original side (geometry base) → apply style change from 3/4 refs
    falClient.generateImageEdit({
      prompt: updateInstruction,
      image_urls: [origSideUrl, ...updated34Urls],
      num_images: 1,
      genConfig: { realm: 'shoe', shoeView: 'side' },
    }),
    // Medial: original medial (geometry base, if available) → apply style change from 3/4 refs
    falClient.generateImageEdit({
      prompt: updateInstruction,
      image_urls: [origMedialUrl ?? origSideUrl, ...updated34Urls],
      num_images: 1,
      genConfig: { realm: 'shoe', shoeView: 'medial' },
    }),
  ]);

  console.log('[updateAllViews] Multi-view sheet URL:', multiViewResult.url);
  onProgress?.('Slicing updated multi-view... (3/3)', 75);

  const multiViews = await sliceMultiViewSheet(multiViewResult.url);

  onProgress?.('Normalizing view scales...', 85);

  // ── Step 5: Combine all views and normalize against ORIGINAL side ──
  const newSideBase64 = sideResult.images.length > 0
    ? await fetchImageAsBase64(sideResult.images[0].url)
    : origSideB64;

  const newMedialBase64 = medialResult.images.length > 0
    ? await fetchImageAsBase64(medialResult.images[0].url)
    : undefined;

  const rawViews: Partial<Record<ShoeViewType, string>> = {
    ...multiViews as Record<string, string>,
    ...quarterViews as Record<string, string>,
    side: newSideBase64,
    ...(newMedialBase64 ? { medial: newMedialBase64 } : {}),
  } as Partial<Record<ShoeViewType, string>>;

  const normalized = await normalizeAllViewScales(originalSideBase64, rawViews);

  onProgress?.('Done', 100);

  const result: Record<string, GeneratedView> = {};
  for (const [viewType, nv] of Object.entries(normalized) as [string, NormalizedView][]) {
    result[viewType] = { base64: nv.base64, w: nv.w, h: nv.h };
  }

  const viewTypes = Object.keys(result);
  console.log(`[updateAllViews] Updated ${viewTypes.length} views: ${viewTypes.join(', ')}`);

  return result;
}
