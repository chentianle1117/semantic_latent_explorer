/**
 * useEventLog — appends interaction events to the backend event log.
 *
 * Events captured reactively (store-watching):
 *  - 'generation': when images.length increases (new batch arrived)
 *  - 'axis_change': when axisLabels changes
 *  - 'selection': when selectedImageIds changes
 *  - 'design_brief_change': when designBrief changes
 *
 * Events captured imperatively (call apiClient.logEvent directly):
 *  - 'delete': in App.tsx onRemoveSelected handler
 *  - 'file_upload': in App.tsx handleLoadExternalImages
 *  - 'prompt_submit': in TextToImageDialog handleSubmit
 *  - 'suggestion_click': in SuggestionsPanel onToggleTag
 *  - 'canvas_switch': in CanvasSwitcher load/new handlers
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';

export function useEventLog() {
  const images = useAppStore((s) => s.images);
  const axisLabels = useAppStore((s) => s.axisLabels);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const designBrief = useAppStore((s) => s.designBrief);
  const isInitialized = useAppStore((s) => s.isInitialized);

  const prevLengthRef = useRef(images.length);
  const prevAxisRef = useRef(JSON.stringify(axisLabels));
  const prevSelectionRef = useRef(JSON.stringify(selectedImageIds));
  const prevBriefRef = useRef(designBrief);

  // Track generation events (image count increases)
  useEffect(() => {
    const prevLen = prevLengthRef.current;
    const currLen = images.length;
    prevLengthRef.current = currLen;

    if (!isInitialized || currLen <= prevLen) return;

    // Find new image IDs (added since last check)
    const newImages = images.slice(prevLen);
    const newIds = newImages.map((img) => img.id);
    const prompt = newImages[0]?.prompt ?? '';

    apiClient.logEvent('generation', {
      imageIds: newIds,
      count: newIds.length,
      prompt,
    });
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
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axisLabels, isInitialized]);

  // Track selection changes
  useEffect(() => {
    const curr = JSON.stringify(selectedImageIds);
    const prev = prevSelectionRef.current;
    prevSelectionRef.current = curr;

    if (!isInitialized || curr === prev) return;

    apiClient.logEvent('selection', {
      selectedIds: selectedImageIds,
      count: selectedImageIds.length,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImageIds, isInitialized]);

  // Track design brief changes
  useEffect(() => {
    const prev = prevBriefRef.current;
    prevBriefRef.current = designBrief;

    if (!isInitialized || designBrief === prev) return;

    apiClient.logEvent('design_brief_change', {
      brief: designBrief,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designBrief, isInitialized]);
}
