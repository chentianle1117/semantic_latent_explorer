/**
 * useAutoSave — persistent canvas auto-save
 *
 * Two triggers:
 *  1. Debounced 5s save after any meaningful state change (images, axes, brief, ratings, layers)
 *     — gated by a 60s minimum interval to avoid thrashing the Railway volume
 *  2. 2-minute periodic fallback (covers edge cases where deps didn't change but state drifted)
 *
 * The frontend POST only signals "save now" — the backend writes to the persistent volume
 * (local disk I/O, not network). Saves are fully async; UI never blocks.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';

export function useAutoSave() {
  const isInitialized = useAppStore((s) => s.isInitialized);
  const images = useAppStore((s) => s.images);
  const axisLabels = useAppStore((s) => s.axisLabels);
  const designBrief = useAppStore((s) => s.designBrief);
  const imageRatings = useAppStore((s) => s.imageRatings);
  const layers = useAppStore((s) => s.layers);
  const imageLayerMap = useAppStore((s) => s.imageLayerMap);

  const isInitializedRef = useRef(isInitialized);
  const imagesLengthRef = useRef(images.length);
  useEffect(() => { isInitializedRef.current = isInitialized; }, [isInitialized]);
  useEffect(() => { imagesLengthRef.current = images.length; }, [images.length]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const lastSaveRef = useRef(0);

  // Debounced save triggered by meaningful state changes
  useEffect(() => {
    if (!isInitialized || images.length === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;
      const now = Date.now();
      if (now - lastSaveRef.current < 60_000) return; // 60s minimum between saves
      isSavingRef.current = true;
      lastSaveRef.current = now;
      try { await apiClient.saveSession(); } catch { /* silent */ }
      isSavingRef.current = false;
    }, 5000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [isInitialized, images, axisLabels, designBrief, imageRatings, layers, imageLayerMap]);

  // 2-minute periodic fallback
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!isInitializedRef.current || imagesLengthRef.current === 0) return;
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      lastSaveRef.current = Date.now();
      try { await apiClient.saveSession(); } catch { /* silent */ }
      isSavingRef.current = false;
    }, 2 * 60_000);
    return () => clearInterval(interval);
  }, []);
}
