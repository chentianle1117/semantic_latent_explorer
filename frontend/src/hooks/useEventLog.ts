/**
 * useEventLog — appends interaction events to the backend event log.
 *
 * Events captured reactively (store-watching):
 *  - 'generation': when images.length increases (new batch arrived)
 *  - 'axis_change': when axisLabels changes
 *  - 'selection': when selectedImageIds changes
 *  - 'design_brief_change': when designBrief changes
 *  - 'image_visibility_change': when any image's visible flag changes (delete/restore)
 *  - 'layer_visibility_change': when layer visibility toggles
 *
 * Events captured imperatively (call apiClient.logEvent directly):
 *  - 'star_rating': in RightInspector star click handler
 *  - 'delete': in App.tsx onRemoveSelected handler
 *  - 'file_upload': in App.tsx handleLoadExternalImages
 *  - 'prompt_submit': in TextToImageDialog handleSubmit
 *  - 'suggestion_click': in SuggestionsPanel onToggleTag
 *  - 'canvas_switch': in CanvasSwitcher load/new handlers
 *  - 'star_filter_toggle': in SemanticCanvas star filter buttons
 *  - 'mood_board_submit': in MoodBoardDialog handleSubmit
 *  - 'genealogy_navigate': in GenealogyLens handleNodeClick
 *  - 'axis_suggestion_apply': in InlineAxisSuggestions card click
 *  - 'satellite_view_toggle': in appStore toggleSatelliteView action
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { apiClient } from '../api/client';

export function useEventLog() {
  const images = useAppStore((s) => s.images);
  const axisLabels = useAppStore((s) => s.axisLabels);
  const selectedImageIds = useAppStore((s) => s.selectedImageIds);
  const designBrief = useAppStore((s) => s.designBrief);
  const layers = useAppStore((s) => s.layers);
  const isInitialized = useAppStore((s) => s.isInitialized);

  const prevLengthRef = useRef(images.length);
  const prevAxisRef = useRef(JSON.stringify(axisLabels));
  const prevSelectionRef = useRef(JSON.stringify(selectedImageIds));
  const prevBriefRef = useRef(designBrief);
  const prevVisibilityRef = useRef<Record<number, boolean>>({});
  const prevLayersRef = useRef(JSON.stringify(layers.map((l) => ({ id: l.id, visible: l.visible }))));

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

  // Track image visibility changes (soft-delete / restore)
  useEffect(() => {
    if (!isInitialized) return;

    const curr: Record<number, boolean> = {};
    images.forEach((img) => { curr[img.id] = img.visible !== false; });
    const prev = prevVisibilityRef.current;
    prevVisibilityRef.current = curr;

    // Skip initial population
    if (Object.keys(prev).length === 0) return;

    const hidden: number[] = [];
    const restored: number[] = [];
    for (const id of Object.keys(curr).map(Number)) {
      if (prev[id] === true && curr[id] === false) hidden.push(id);
      if (prev[id] === false && curr[id] === true) restored.push(id);
    }

    if (hidden.length > 0) {
      apiClient.logEvent('image_hide', { imageIds: hidden, count: hidden.length });
    }
    if (restored.length > 0) {
      apiClient.logEvent('image_restore', { imageIds: restored, count: restored.length });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, isInitialized]);

  // Track layer visibility toggles
  useEffect(() => {
    const curr = JSON.stringify(layers.map((l) => ({ id: l.id, visible: l.visible })));
    const prev = prevLayersRef.current;
    prevLayersRef.current = curr;

    if (!isInitialized || curr === prev) return;

    const changes = layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible }));
    apiClient.logEvent('layer_visibility_change', { layers: changes });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, isInitialized]);
}
