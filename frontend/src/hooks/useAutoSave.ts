/**
 * useAutoSave — persistent canvas auto-save (hardened for longitudinal study)
 *
 * Four triggers:
 *  1. Debounced 5s save after any meaningful state change
 *     — gated by a 30s minimum interval to avoid thrashing
 *  2. 90-second periodic fallback
 *  3. beforeunload — fire-and-forget save when user refreshes or closes the tab
 *  4. Immediate save on generation complete (isGenerating false→true→false)
 *
 * Canvas switch safety:
 *   - Exposes cancelPendingSave() so CanvasSwitcher can kill the debounce timer
 *     before loading a new canvas (prevents cross-canvas corruption).
 *
 * The frontend POST only signals "save now" — the backend writes to the persistent
 * volume (local disk I/O, not network). Saves are fully async; UI never blocks.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';

// Exported so CanvasSwitcher can cancel pending saves before switching
let _cancelPendingSave: (() => void) | null = null;
export function cancelPendingSave() {
  _cancelPendingSave?.();
}

// Exported so generation handlers can force an immediate save
let _forceSaveNow: (() => void) | null = null;
export function forceSaveNow() {
  _forceSaveNow?.();
}

export function useAutoSave() {
  const isInitialized = useAppStore((s) => s.isInitialized);
  const images = useAppStore((s) => s.images);
  const axisLabels = useAppStore((s) => s.axisLabels);
  const designBrief = useAppStore((s) => s.designBrief);
  const imageRatings = useAppStore((s) => s.imageRatings);
  const layers = useAppStore((s) => s.layers);
  const imageLayerMap = useAppStore((s) => s.imageLayerMap);
  const isGenerating = useAppStore((s) => s.isGenerating);

  const isInitializedRef = useRef(isInitialized);
  const imagesLengthRef = useRef(images.length);
  const canvasIdRef = useRef(useAppStore.getState().currentCanvasId);
  useEffect(() => { isInitializedRef.current = isInitialized; }, [isInitialized]);
  useEffect(() => { imagesLengthRef.current = images.length; }, [images.length]);
  // Track canvas ID so we never save after a switch with stale state
  // Also reset hasEverHadImages when canvas changes (new canvas = fresh tracking)
  useEffect(() => {
    return useAppStore.subscribe(
      (s) => s.currentCanvasId,
      (id) => {
        canvasIdRef.current = id;
        hasEverHadImagesRef.current = false; // reset on canvas switch
      }
    );
  }, []);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const lastSaveRef = useRef(0);
  // Track which canvas the pending save is for
  const pendingSaveCanvasIdRef = useRef<string | null>(null);

  // Has the canvas ever had images? (distinguishes "intentionally cleared" from "not loaded")
  const hasEverHadImagesRef = useRef(false);
  useEffect(() => {
    if (images.length > 0) hasEverHadImagesRef.current = true;
  }, [images.length]);

  const clearPendingTimeout = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveCanvasIdRef.current = null;
  }, []);

  // Wire up the exported cancel function
  useEffect(() => {
    _cancelPendingSave = clearPendingTimeout;
    return () => { _cancelPendingSave = null; };
  }, [clearPendingTimeout]);

  const consecutiveFailsRef = useRef(0);

  const doSave = useCallback(async (force = false) => {
    if (isSavingRef.current) return;
    if (!isInitializedRef.current) return;
    // Allow saving empty canvas if it previously had images (intentional clear)
    if (imagesLengthRef.current === 0 && !hasEverHadImagesRef.current) return;

    if (!force) {
      const now = Date.now();
      if (now - lastSaveRef.current < 5_000) return; // 5s minimum between saves
    }

    isSavingRef.current = true;
    lastSaveRef.current = Date.now();
    useAppStore.getState().setLastSaveStatus('saving');

    // Retry up to 3 times with exponential backoff (1s, 2s, 4s)
    let saved = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await apiClient.saveSession();
        useAppStore.getState().setLastSaveStatus('saved');
        consecutiveFailsRef.current = 0;
        saved = true;
        break;
      } catch (err) {
        console.warn(`[auto-save] attempt ${attempt + 1}/3 failed:`, err);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, (1 << attempt) * 1000)); // 1s, 2s
        }
      }
    }
    if (!saved) {
      consecutiveFailsRef.current++;
      useAppStore.getState().setLastSaveStatus('error');
      console.error(`[auto-save] All 3 attempts failed (${consecutiveFailsRef.current} consecutive failures)`);
    }
    isSavingRef.current = false;
  }, []);

  // Wire up the exported force-save function
  useEffect(() => {
    _forceSaveNow = () => doSave(true);
    return () => { _forceSaveNow = null; };
  }, [doSave]);

  // Debounced save triggered by meaningful state changes
  useEffect(() => {
    if (!isInitialized) return;
    if (images.length === 0 && !hasEverHadImagesRef.current) return;
    clearPendingTimeout();
    const currentCanvasId = useAppStore.getState().currentCanvasId;
    pendingSaveCanvasIdRef.current = currentCanvasId;
    saveTimeoutRef.current = setTimeout(() => {
      // Safety: don't save if canvas switched since this timer was set
      if (canvasIdRef.current !== pendingSaveCanvasIdRef.current) {
        console.warn('[auto-save] Skipping stale save — canvas switched');
        return;
      }
      doSave();
    }, 5000);
    return () => clearPendingTimeout();
  }, [isInitialized, images, axisLabels, designBrief, imageRatings, layers, imageLayerMap, doSave, clearPendingTimeout]);

  // 90-second periodic fallback
  useEffect(() => {
    const interval = setInterval(() => { doSave(); }, 90_000);
    return () => clearInterval(interval);
  }, [doSave]);

  // Force save when generation completes (isGenerating goes from true → false)
  const prevIsGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    if (prevIsGeneratingRef.current && !isGenerating) {
      // Generation just finished — force immediate save (bypass 30s guard)
      console.log('[auto-save] Generation complete — forcing save');
      doSave(true);
    }
    prevIsGeneratingRef.current = isGenerating;
  }, [isGenerating, doSave]);

  // Save on page refresh / close — use sendBeacon with proper content-type
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isInitializedRef.current) return;
      if (imagesLengthRef.current === 0 && !hasEverHadImagesRef.current) return;
      // Use Blob with explicit JSON content-type so backend parses it correctly
      const blob = new Blob(['{}'], { type: 'application/json' });
      navigator.sendBeacon('/api/sessions/save', blob);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}
