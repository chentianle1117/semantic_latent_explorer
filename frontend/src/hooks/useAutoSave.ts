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
  useEffect(() => {
    return useAppStore.subscribe(
      (s) => s.currentCanvasId,
      (id) => { canvasIdRef.current = id; }
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

  const doSave = useCallback(async (force = false) => {
    if (isSavingRef.current) return;
    if (!isInitializedRef.current) return;
    // Allow saving empty canvas if it previously had images (intentional clear)
    if (imagesLengthRef.current === 0 && !hasEverHadImagesRef.current) return;

    if (!force) {
      const now = Date.now();
      if (now - lastSaveRef.current < 30_000) return; // 30s minimum between saves
    }

    isSavingRef.current = true;
    lastSaveRef.current = Date.now();
    useAppStore.getState().setLastSaveStatus('saving');
    try {
      await apiClient.saveSession();
      useAppStore.getState().setLastSaveStatus('saved');
    } catch {
      useAppStore.getState().setLastSaveStatus('error');
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
