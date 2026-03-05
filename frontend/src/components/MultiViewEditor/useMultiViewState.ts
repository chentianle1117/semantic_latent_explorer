/**
 * Custom hook for Multi-View Editor state management.
 * Handles local view state, edit operations, propagation, history,
 * and consistent-scale normalization.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ImageData, ShoeViewType } from '../../types';
import { generateAllViews, updateAllViews } from '../../utils/generateAllViews';
import { apiClient } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import { normalizeAllViewScales, type NormalizedView } from '../../utils/normalizeViewScale';
import { ALL_VIEWS } from './propagationOrder';

export interface MultiViewSnapshot {
  timestamp: Date;
  prompt: string;
  editedView: ShoeViewType;
  views: Record<ShoeViewType, ImageData | null>;
}

/** Normalized dimensions for consistent-scale rendering */
export interface ViewDimensions {
  w: number;
  h: number;
}

export interface UseMultiViewStateReturn {
  viewImages: Record<ShoeViewType, ImageData | null>;
  /** Normalized dimensions per view for consistent-scale rendering */
  viewDims: Partial<Record<ShoeViewType, ViewDimensions>>;
  /** Uniform display scale factor (pixels per shoe-unit) */
  displayScale: number;
  editPrompt: string;
  setEditPrompt: (s: string) => void;
  isUpdating: Record<ShoeViewType, boolean>;
  history: MultiViewSnapshot[];
  /** Set of view types that were actually edited by the user (not just normalized) */
  editedViews: Set<ShoeViewType>;
  revertToSnapshot: (index: number) => void;
  handleUpdate: () => Promise<void>;
  isBusy: boolean;
  progressLabel: string;
}

function initViewImages(
  sideImage: ImageData,
  satellites: ImageData[],
): Record<ShoeViewType, ImageData | null> {
  const map: Record<ShoeViewType, ImageData | null> = {
    side: sideImage,
    '3/4-front': null,
    '3/4-back': null,
    top: null,
    outsole: null,
    medial: null,
    front: null,
    back: null,
  };
  for (const sat of satellites) {
    if (sat.shoe_view && sat.shoe_view !== 'side') {
      map[sat.shoe_view as ShoeViewType] = sat;
    }
  }
  return map;
}

/** Grid column/row proportions for display scale calculation */
const COL_FRAC = [0.38, 0.43, 0.19]; // 1.6fr 1.8fr 0.8fr
const ROW_FRAC = [0.32, 0.36, 0.32]; // 1fr 1.15fr 1fr

/** Grid cell mapping for display scale calculation */
const COL_OF: Record<string, number> = {
  'medial': 0, 'top': 1, 'front': 2,
  '3/4-front': 0, 'side': 1, 'back': 2,
  '3/4-back': 0, 'outsole': 1,
};
const ROW_OF: Record<string, number> = {
  'medial': 0, 'top': 0, 'front': 0,
  '3/4-front': 1, 'side': 1, 'back': 1,
  '3/4-back': 2, 'outsole': 2,
};

/**
 * Compute display scale from pre-computed view dimensions.
 * Pure calculation — no async normalization needed.
 */
function computeDisplayScale(dims: Partial<Record<ShoeViewType, ViewDimensions>>): number {
  if (Object.keys(dims).length === 0) return 0;

  const GAP = 6;
  const availW = window.innerWidth * 0.65 - 20 - GAP * 2;
  const availH = window.innerHeight - 40 - 16 - GAP * 2;

  let minScale = Infinity;
  for (const [view, d] of Object.entries(dims) as [string, ViewDimensions][]) {
    const ci = COL_OF[view] ?? 1;
    const ri = ROW_OF[view] ?? 1;
    const cellW = availW * COL_FRAC[ci];
    const cellH = availH * ROW_FRAC[ri];
    const s = Math.min(cellW / d.w, cellH / d.h);
    if (s < minScale) minScale = s;
  }

  return Math.min(minScale === Infinity ? 1 : minScale, 1); // never upscale
}

export function useMultiViewState(
  sideImage: ImageData,
  satellites: ImageData[],
): UseMultiViewStateReturn {
  const sideId = sideImage.id;
  const initialRef = useRef(initViewImages(sideImage, satellites));
  // Original side base64 — used as normalization reference for ALL versions
  const originalSideBase64Ref = useRef(sideImage.base64_image);
  const [viewImages, setViewImages] = useState<Record<ShoeViewType, ImageData | null>>(
    () => initViewImages(sideImage, satellites)
  );
  // Pipeline-provided dimensions (set once on initial normalization, reused for all versions)
  const [viewDims, setViewDims] = useState<Partial<Record<ShoeViewType, ViewDimensions>>>({});
  const [displayScale, setDisplayScale] = useState(0);
  const [editPrompt, setEditPrompt] = useState('');
  const [isUpdating, setIsUpdating] = useState<Record<ShoeViewType, boolean>>({} as any);
  // Initialize history from Zustand store (persists across dialog open/close)
  const [history, setHistory] = useState<MultiViewSnapshot[]>(() => {
    const stored = useAppStore.getState().multiViewHistory[sideId];
    if (!stored || stored.length === 0) return [];
    // Reconstruct MultiViewSnapshot from stored lightweight entries
    return stored.map(entry => ({
      timestamp: new Date(entry.timestamp),
      prompt: entry.prompt,
      editedView: 'side' as ShoeViewType,
      views: Object.fromEntries(
        ALL_VIEWS.map(v => [v, entry.viewBases[v] ? {
          ...sideImage,
          id: -1,
          base64_image: entry.viewBases[v]!,
          shoe_view: v,
        } : null])
      ) as Record<ShoeViewType, ImageData | null>,
    }));
  });
  const [editedViews, setEditedViews] = useState<Set<ShoeViewType>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');

  // Normalize all views ONCE from the original side view.
  // Tight-crops each image and computes consistent shoe-scale dimensions.
  // Updates viewImages with cropped base64 so displayed images match dims exactly.
  useEffect(() => {
    let cancelled = false;
    const origSide = originalSideBase64Ref.current;
    if (!origSide) return;

    // Collect initial satellite base64 strings
    const viewBases: Partial<Record<ShoeViewType, string>> = {};
    for (const sat of satellites) {
      if (sat.shoe_view && sat.shoe_view !== 'side' && sat.base64_image) {
        viewBases[sat.shoe_view as ShoeViewType] = sat.base64_image;
      }
    }

    normalizeAllViewScales(origSide, viewBases).then(normalized => {
      if (cancelled) return;
      const dims: Partial<Record<ShoeViewType, ViewDimensions>> = {};
      const entries = Object.entries(normalized) as [ShoeViewType, NormalizedView][];

      for (const [k, nv] of entries) {
        dims[k] = { w: nv.w, h: nv.h };
      }

      // Replace viewImages base64 with tight-cropped normalized versions
      // so displayed image content fills exactly the dims bounds
      setViewImages(prev => {
        const updated = { ...prev };
        for (const [k, nv] of entries) {
          if (updated[k]) {
            updated[k] = { ...updated[k]!, base64_image: nv.base64 };
          }
        }
        return updated;
      });

      // Also update initialRef so revert-to-original uses cropped images
      const updatedInitial = { ...initialRef.current };
      for (const [k, nv] of entries) {
        if (updatedInitial[k]) {
          updatedInitial[k] = { ...updatedInitial[k]!, base64_image: nv.base64 };
        }
      }
      initialRef.current = updatedInitial;

      setViewDims(dims);
      setDisplayScale(computeDisplayScale(dims));
    }).catch(e => {
      console.error('[useMultiViewState] initial normalization failed:', e);
    });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pushSnapshot = useCallback((prompt: string, editedView: ShoeViewType, views: Record<ShoeViewType, ImageData | null>) => {
    setHistory(prev => [...prev, {
      timestamp: new Date(),
      prompt,
      editedView,
      views: { ...views },
    }]);
    // Persist lightweight version to Zustand store (survives dialog close/reopen)
    const viewBases: Record<string, string | null> = {};
    for (const v of ALL_VIEWS) {
      viewBases[v] = views[v]?.base64_image ?? null;
    }
    useAppStore.getState().pushMultiViewHistory(sideId, {
      timestamp: Date.now(),
      prompt,
      sideBase64: views['side']?.base64_image ?? '',
      viewBases,
    });
  }, [sideId]);

  const revertToSnapshot = useCallback((index: number) => {
    if (index < 0) {
      // Revert to original
      setViewImages({ ...initialRef.current });
    } else if (index < history.length) {
      setViewImages({ ...history[index].views });
    }
  }, [history]);

  /**
   * Update all views globally using the edit prompt.
   *
   * If 3/4-front exists: uses 3/4-first pipeline (updateAllViews)
   *   Step 1: 3/4 sheet from current 3/4-front → 3/4-front + 3/4-back
   *   Step 2: Side view from updated 3/4-front
   *   Step 3: 5-view sheet from side + 3/4-front → medial + top + front + back + outsole
   *
   * Otherwise: falls back to side-first pipeline (generateAllViews)
   *
   * Only generates and stores raw views locally. The Done button (handleMultiViewSave
   * in App.tsx) handles the actual backend save + rembg via addExternalImages.
   */
  const handleUpdate = useCallback(async () => {
    if (!editPrompt.trim() || isBusy) return;

    const sideImg = viewImages['side'];
    const threeFourFrontImg = viewImages['3/4-front'];

    // Need at least side view to do anything
    if (!sideImg?.base64_image) return;

    setIsBusy(true);
    setProgressLabel('Starting update...');

    // Mark all views as updating
    const updatingMap: Record<string, boolean> = {};
    for (const v of ALL_VIEWS) updatingMap[v] = true;
    setIsUpdating(updatingMap as Record<ShoeViewType, boolean>);

    try {
      let generatedViews: Record<string, { base64: string; w: number; h: number }>;

      if (threeFourFrontImg?.base64_image) {
        // 3/4-first pipeline: anchor from 3/4-front (captures most 3D info).
        // Always use the true original side (white background, unmodified) as the geometry
        // base — passing rembg'd transparent views degrades quality over iterative updates.
        generatedViews = await updateAllViews({
          editPrompt: editPrompt.trim(),
          current34FrontBase64: threeFourFrontImg.base64_image,
          originalSideBase64: originalSideBase64Ref.current,
          onProgress: (label) => setProgressLabel(label),
        });
      } else {
        // Fallback: side-first pipeline (initial generation)
        generatedViews = await generateAllViews({
          sideImageBase64: sideImg.base64_image,
          prompt: editPrompt.trim(),
          onProgress: (label) => setProgressLabel(label),
        });
      }

      // Remove backgrounds via rembg batch (same as initial generation pipeline)
      setProgressLabel('Removing backgrounds...');
      const rembgInput: Record<string, string> = {};
      for (const [viewType, genView] of Object.entries(generatedViews)) {
        rembgInput[viewType] = genView.base64;
      }

      let cleanBases: Record<string, string>;
      try {
        cleanBases = await apiClient.rembgBatch(rembgInput);
      } catch (e) {
        console.warn('[handleUpdate] rembg failed, using raw images:', e);
        cleanBases = rembgInput; // fallback: use originals
      }

      // Store views with transparent backgrounds locally
      // The Done button's handleMultiViewSave will persist via addExternalImages
      const updatedViews = { ...viewImages };
      const newDims: Partial<Record<ShoeViewType, ViewDimensions>> = { ...viewDims };
      for (const [viewType, genView] of Object.entries(generatedViews)) {
        const existingImg = viewImages[viewType as ShoeViewType];
        updatedViews[viewType as ShoeViewType] = {
          ...(existingImg || sideImg),
          id: existingImg?.id ?? -Date.now(),
          base64_image: cleanBases[viewType] ?? genView.base64,
          shoe_view: viewType as ShoeViewType,
          prompt: editPrompt.trim(),
        };
        // Store pipeline-provided dimensions (already normalized against original side)
        newDims[viewType as ShoeViewType] = { w: genView.w, h: genView.h };
      }

      setViewImages(updatedViews);
      setViewDims(newDims);
      setDisplayScale(computeDisplayScale(newDims));
      pushSnapshot(editPrompt.trim(), 'side', updatedViews);
      // Mark all generated views as user-edited (distinguishes from normalization-only changes)
      setEditedViews(prev => {
        const next = new Set(prev);
        for (const vt of Object.keys(generatedViews)) next.add(vt as ShoeViewType);
        return next;
      });
      setProgressLabel('');
    } catch (e) {
      console.error('Multi-view update failed:', e);
      setProgressLabel('Update failed');
    } finally {
      setIsBusy(false);
      setIsUpdating({} as any);
    }
  }, [editPrompt, isBusy, viewImages, viewDims, pushSnapshot]);

  return {
    viewImages,
    viewDims,
    displayScale,
    editPrompt,
    setEditPrompt,
    isUpdating,
    history,
    editedViews,
    revertToSnapshot,
    handleUpdate,
    isBusy,
    progressLabel,
  };
}
