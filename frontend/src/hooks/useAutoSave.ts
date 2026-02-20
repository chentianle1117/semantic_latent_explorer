/**
 * useAutoSave — persistent canvas auto-save
 *
 * Two triggers:
 *  1. 60-second interval (background auto-save while tool is open)
 *  2. Debounced 3s save whenever images.length changes (new batch arrived)
 *
 * Both are gated on `isInitialized && images.length > 0`.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';

export function useAutoSave() {
  const isInitialized = useAppStore((s) => s.isInitialized);
  const imagesLength = useAppStore((s) => s.images.length);
  const setCanvasList = useAppStore((s) => s.setCanvasList);

  const isInitializedRef = useRef(isInitialized);
  const imagesLengthRef = useRef(imagesLength);
  useEffect(() => { isInitializedRef.current = isInitialized; }, [isInitialized]);
  useEffect(() => { imagesLengthRef.current = imagesLength; }, [imagesLength]);

  // 60-second interval auto-save
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!isInitializedRef.current || imagesLengthRef.current === 0) return;
      try {
        await apiClient.saveSession();
        const { sessions } = await apiClient.listSessions();
        setCanvasList(sessions);
      } catch {/* silent */}
    }, 60_000);
    return () => clearInterval(interval);
  }, [setCanvasList]);

  // Debounced 3s save on image count change
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isInitialized || imagesLength === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await apiClient.saveSession();
        const { sessions } = await apiClient.listSessions();
        setCanvasList(sessions);
      } catch {/* silent */}
    }, 3000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesLength]);
}
