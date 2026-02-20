/**
 * useEventLog — appends generation and axis-change events to the backend event log.
 *
 * Events captured:
 *  - 'generation': when images.length increases (new batch arrived)
 *  - 'axis_change': when axisLabels changes
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';

export function useEventLog() {
  const images = useAppStore((s) => s.images);
  const axisLabels = useAppStore((s) => s.axisLabels);
  const isInitialized = useAppStore((s) => s.isInitialized);

  const prevLengthRef = useRef(images.length);
  const prevAxisRef = useRef(JSON.stringify(axisLabels));
  const prevImagesRef = useRef(images);

  // Track generation events (image count increases)
  useEffect(() => {
    const prevLen = prevLengthRef.current;
    const currLen = images.length;
    prevLengthRef.current = currLen;
    prevImagesRef.current = images;

    if (!isInitialized || currLen <= prevLen) return;

    // Find new image IDs (added since last check)
    const newImages = images.slice(prevLen);
    const newIds = newImages.map((img) => img.id);
    const prompt = newImages[0]?.prompt ?? '';

    apiClient.logEvent('generation', {
      imageIds: newIds,
      count: newIds.length,
      prompt,
    }).catch(() => {/* fire-and-forget */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, isInitialized]);

  // Track axis change events
  useEffect(() => {
    const curr = JSON.stringify(axisLabels);
    const prev = prevAxisRef.current;
    prevAxisRef.current = curr;

    if (!isInitialized || curr === prev) return;

    apiClient.logEvent('axis_change', {
      axisLabels: { ...axisLabels },
    }).catch(() => {/* fire-and-forget */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axisLabels, isInitialized]);
}
