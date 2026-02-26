/**
 * Pipeline for generating all satellite views from a side view.
 *
 * 1. Uploads side view to fal.ai
 * 2. Loads both template PNGs and uploads them
 * 3. Generates multi-view sheet (5 views) + 3/4 sheet (2 views) in parallel
 * 4. Slices each sheet via proportional crop
 * 5. Normalizes all views to consistent shoe-scale
 * 6. Returns all 7 satellite views as normalized base64 + dimensions
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
 * Generate all 7 satellite views from a side view image.
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

  // 1. Upload side view to fal.ai
  const sideBlob = await fetch(`data:image/jpeg;base64,${sideImageBase64}`).then(r => r.blob());
  const sideFile = new File([sideBlob], 'side-view.jpg', { type: 'image/jpeg' });
  const sideUrl = await falClient.uploadFile(sideFile);

  onProgress?.('Loading templates...', 15);

  // 2. Load and upload both template PNGs
  const [multiViewDataUrl, quarterDataUrl] = await Promise.all([
    getMultiViewTemplate(),
    getQuarterViewTemplate(),
  ]);

  // Convert data URLs to blobs and upload
  const [multiViewBlob, quarterBlob] = await Promise.all([
    fetch(multiViewDataUrl).then(r => r.blob()),
    fetch(quarterDataUrl).then(r => r.blob()),
  ]);

  const [multiViewTemplateUrl, quarterTemplateUrl] = await Promise.all([
    falClient.uploadFile(new File([multiViewBlob], 'multi-view-template.png', { type: 'image/png' })),
    falClient.uploadFile(new File([quarterBlob], 'quarter-view-template.png', { type: 'image/png' })),
  ]);

  onProgress?.('Generating view sheets...', 30);

  // 3. Generate both sheets in parallel
  const [multiViewResult, quarterResult] = await Promise.all([
    falClient.generateMultiViewSheet(prompt, sideUrl, multiViewTemplateUrl),
    falClient.generateQuarterViewSheet(prompt, sideUrl, quarterTemplateUrl),
  ]);

  console.log('[generateAllViews] Multi-view sheet URL:', multiViewResult.url);
  console.log('[generateAllViews] Quarter sheet URL:', quarterResult.url);
  onProgress?.('Slicing views...', 70);

  // 4. Slice both sheets via proportional crop
  const [multiViews, quarterViews] = await Promise.all([
    sliceMultiViewSheet(multiViewResult.url),
    sliceQuarterSheet(quarterResult.url),
  ]);

  onProgress?.('Normalizing view scales...', 85);

  // 5. Normalize all views to consistent shoe-scale
  const rawViews: Partial<Record<ShoeViewType, string>> = {
    ...multiViews as Record<string, string>,
    ...quarterViews as Record<string, string>,
  } as Partial<Record<ShoeViewType, string>>;

  const normalized = await normalizeAllViewScales(sideImageBase64, rawViews);

  onProgress?.('Done', 100);

  // 6. Build result — all views including 'side' reference
  const result: Record<string, GeneratedView> = {};
  for (const [viewType, nv] of Object.entries(normalized) as [string, NormalizedView][]) {
    result[viewType] = { base64: nv.base64, w: nv.w, h: nv.h };
  }

  const viewTypes = Object.keys(result);
  console.log(`[generateAllViews] Generated ${viewTypes.length} views: ${viewTypes.join(', ')}`);

  return result;
}


/**
 * Update all views from an existing 3/4-front view (3-step pipeline).
 *
 *   Step 1: Generate 3/4 sheet from current 3/4-front → updated 3/4-front + 3/4-back
 *   Step 2: Generate side view from updated 3/4-front (single image edit)
 *   Step 3: Generate 5-view multi-view sheet using side + 3/4-front as references
 *   Step 4: Normalize all views using the generated side as reference
 *
 * @returns Record mapping view type → { base64, w, h }
 */
export async function updateAllViews(params: {
  editPrompt: string;
  current34FrontBase64: string;
  originalSideBase64: string;
  onProgress?: (label: string, pct: number) => void;
}): Promise<Record<string, GeneratedView>> {
  const { editPrompt, current34FrontBase64, originalSideBase64, onProgress } = params;

  onProgress?.('Uploading 3/4-front reference...', 5);

  // 1. Upload current 3/4-front as anchor reference
  const refBlob = await fetch(`data:image/jpeg;base64,${current34FrontBase64}`).then(r => r.blob());
  const refFile = new File([refBlob], 'ref-34-front.jpg', { type: 'image/jpeg' });
  const refUrl = await falClient.uploadFile(refFile);

  onProgress?.('Loading templates...', 10);

  // 2. Load and upload both template PNGs
  const [multiViewDataUrl, quarterDataUrl] = await Promise.all([
    getMultiViewTemplate(),
    getQuarterViewTemplate(),
  ]);

  const [multiViewBlob, quarterBlob] = await Promise.all([
    fetch(multiViewDataUrl).then(r => r.blob()),
    fetch(quarterDataUrl).then(r => r.blob()),
  ]);

  const [multiViewTemplateUrl, quarterTemplateUrl] = await Promise.all([
    falClient.uploadFile(new File([multiViewBlob], 'multi-view-template.png', { type: 'image/png' })),
    falClient.uploadFile(new File([quarterBlob], 'quarter-view-template.png', { type: 'image/png' })),
  ]);

  // ── Step 1: Generate 3/4 sheet (ground truth — 3/4 captures the most 3D info) ──
  onProgress?.('Generating 3/4 views... (1/3)', 20);

  const quarterResult = await falClient.generateQuarterViewSheet(
    editPrompt, refUrl, quarterTemplateUrl
  );
  console.log('[updateAllViews] Quarter sheet URL:', quarterResult.url);

  const quarterViews = await sliceQuarterSheet(quarterResult.url);

  // Upload updated 3/4-front for subsequent steps
  let updated34FrontUrl = refUrl; // fallback: use original
  if (quarterViews['3/4-front']) {
    const frontBlob = await fetch(`data:image/jpeg;base64,${quarterViews['3/4-front']}`).then(r => r.blob());
    const frontFile = new File([frontBlob], 'updated-34-front.jpg', { type: 'image/jpeg' });
    updated34FrontUrl = await falClient.uploadFile(frontFile);
  }

  // ── Step 2: Generate side view from updated 3/4-front ──
  onProgress?.('Generating side view... (2/3)', 40);

  const sideResult = await falClient.generateImageEdit({
    prompt: editPrompt,
    image_urls: [updated34FrontUrl],
    num_images: 1,
    genConfig: { realm: 'shoe', shoeView: 'side' },
  });

  if (!sideResult.images.length) throw new Error('Side view generation returned no images');
  const sideViewUrl = sideResult.images[0].url;
  console.log('[updateAllViews] Side view URL:', sideViewUrl);

  // Fetch side view as base64 for normalization later
  const sideResponse = await fetch(sideViewUrl);
  const sideArrayBuf = await sideResponse.arrayBuffer();
  const sideBytes = new Uint8Array(sideArrayBuf);
  let sideBin = '';
  for (let i = 0; i < sideBytes.length; i++) sideBin += String.fromCharCode(sideBytes[i]);
  const sideBase64 = btoa(sideBin);

  // Re-upload side view to fal storage for multi-view sheet reference
  const sideUploadBlob = new Blob([sideArrayBuf], { type: 'image/jpeg' });
  const sideUploadFile = new File([sideUploadBlob], 'generated-side.jpg', { type: 'image/jpeg' });
  const sideUploadUrl = await falClient.uploadFile(sideUploadFile);

  // ── Step 3: Generate 5-view multi-view sheet using side + 3/4-front as references ──
  onProgress?.('Generating multi-view sheet... (3/3)', 60);

  const multiViewResult = await falClient.generateMultiViewSheet(
    editPrompt, sideUploadUrl, multiViewTemplateUrl,
    { additionalRefUrls: [updated34FrontUrl] }
  );
  console.log('[updateAllViews] Multi-view sheet URL:', multiViewResult.url);

  const multiViews = await sliceMultiViewSheet(multiViewResult.url);

  onProgress?.('Normalizing view scales...', 85);

  // ── Step 4: Combine all views and normalize against ORIGINAL side ──
  // Using the original side as reference ensures all versions share the same scale
  const rawViews: Partial<Record<ShoeViewType, string>> = {
    ...multiViews as Record<string, string>,
    ...quarterViews as Record<string, string>,
    side: sideBase64,
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
