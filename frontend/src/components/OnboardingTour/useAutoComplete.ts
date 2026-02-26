/**
 * useAutoComplete — extracted auto-complete hooks for onboarding tutorial v5
 *
 * Each hook watches a specific store state and calls completeOnboardingStep()
 * when the matching condition is met. Step IDs use the new v5 naming convention.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';

/**
 * Master hook that wires up all auto-complete watchers.
 * Call once from the main OnboardingTour component.
 */
export function useAutoComplete(): void {
  const onboardingDismissed = useAppStore((s) => s.onboardingDismissed);
  const completeStep        = useAppStore((s) => s.completeOnboardingStep);

  // ── State subscriptions ──────────────────────────────────────────────────
  const selectedImageIds    = useAppStore((s) => s.selectedImageIds);
  const images              = useAppStore((s) => s.images);
  const designBrief         = useAppStore((s) => s.designBrief);
  const isHistoryExpanded   = useAppStore((s) => s.isHistoryExpanded);
  const isLayersExpanded    = useAppStore((s) => s.isLayersExpanded);
  const isGenerating        = useAppStore((s) => s.isGenerating);
  const axisLabels          = useAppStore((s) => s.axisLabels);
  const isolatedImageIds    = useAppStore((s) => s.isolatedImageIds);
  const agentInsights       = useAppStore((s) => s.agentInsights);
  const inlineAxisData      = useAppStore((s) => s.inlineAxisData);
  const ghostNodes          = useAppStore((s) => s.ghostNodes);
  const onboardingSpotlight = useAppStore((s) => s.onboardingSpotlight);
  const imageRatings        = useAppStore((s) => s.imageRatings);
  const deletedStack        = useAppStore((s) => s.deletedImageStack);
  const starFilter          = useAppStore((s) => s.starFilter);

  // ── Change-detection refs ────────────────────────────────────────────────
  const prevAxes         = useRef(JSON.stringify(axisLabels));
  const prevIsolated     = useRef(isolatedImageIds);
  const prevInsightCount = useRef(agentInsights.length);
  const prevInlineAxis   = useRef(inlineAxisData);
  const wasGenerating    = useRef(false);
  const selAtGenStart    = useRef(0);
  const selCountRef      = useRef(selectedImageIds.length);
  const prevImageCount   = useRef(images.length);
  const genCompletedRef  = useRef(false);
  const briefEditedRef   = useRef(false); // G5: manual-edit flag

  // Keep selCountRef in sync
  useEffect(() => { selCountRef.current = selectedImageIds.length; }, [selectedImageIds.length]);

  // ── a-canvas: design brief manually edited ──────────────────────────────
  // G5: Only complete when user actually edits (not when starter brief loads)
  useEffect(() => {
    if (onboardingDismissed) return;
    if (designBrief && designBrief.trim().length > 0 && briefEditedRef.current) {
      completeStep('a-canvas');
    }
  }, [designBrief, onboardingDismissed, completeStep]);

  // Expose a way to mark brief as manually edited — called from DesignBriefOverlay onChange
  useEffect(() => {
    const handler = () => {
      briefEditedRef.current = true;
      // Complete immediately if brief already has content (no need to wait for blur)
      const brief = useAppStore.getState().designBrief;
      if (brief && brief.trim().length > 0) {
        completeStep('a-canvas');
      }
    };
    window.addEventListener('ob-brief-edited', handler);
    return () => window.removeEventListener('ob-brief-edited', handler);
  }, [completeStep]);

  // ── a-select: shoe selected on canvas ──────────────────────────────────
  // Complete on transition (0→>0) OR when spotlight lands on step with shoes already selected
  const prevSelCount = useRef(selectedImageIds.length);
  useEffect(() => {
    if (!onboardingDismissed && selectedImageIds.length > 0 && (onboardingSpotlight === 'a-select' || prevSelCount.current === 0)) {
      completeStep('a-select');
    }
    prevSelCount.current = selectedImageIds.length;
  }, [selectedImageIds.length, onboardingSpotlight, onboardingDismissed, completeStep]);

  // ── a-history-expand: history panel expanded ──────────────────────────
  // Complete on transition (false→true) OR when spotlight lands on step with panel already expanded
  const prevHistoryExpanded = useRef(isHistoryExpanded);
  useEffect(() => {
    if (!onboardingDismissed) {
      if (isHistoryExpanded && (onboardingSpotlight === 'a-history-expand' || !prevHistoryExpanded.current)) {
        completeStep('a-history-expand');
      }
      prevHistoryExpanded.current = isHistoryExpanded;
    }
  }, [isHistoryExpanded, onboardingSpotlight, onboardingDismissed, completeStep]);

  // ── a-lineage-tab: lineage tab active (DOM class watch) ────────────────
  useEffect(() => {
    if (onboardingDismissed) return;
    const check = () => {
      const el = document.querySelector('[data-tour="tab-lineage"]');
      if (el && el.classList.contains('active')) {
        completeStep('a-lineage-tab');
        // Collapse drawer after 2s so user sees the tree, then layers bar is revealed for next step
        setTimeout(() => {
          if (useAppStore.getState().completedSteps.includes('a-lineage-tab')) {
            useAppStore.getState().setDrawerActiveTab(null);
          }
        }, 2000);
      }
    };
    const obs = new MutationObserver(check);
    const container = document.querySelector('[data-tour="drawer-tabs"]');
    if (container) obs.observe(container, { attributes: true, subtree: true, attributeFilter: ['class'] });
    const t = setInterval(check, 300);
    return () => { obs.disconnect(); clearInterval(t); };
  }, [onboardingDismissed, completeStep]);

  // ── a-layers-expand: layers panel expanded ────────────────────────────
  // Complete on transition (false→true) OR when spotlight lands on step with panel already expanded
  const prevLayersExpanded = useRef(isLayersExpanded);
  useEffect(() => {
    if (!onboardingDismissed) {
      if (isLayersExpanded && (onboardingSpotlight === 'a-layers-expand' || !prevLayersExpanded.current)) {
        completeStep('a-layers-expand');
      }
      prevLayersExpanded.current = isLayersExpanded;
    }
  }, [isLayersExpanded, onboardingSpotlight, onboardingDismissed, completeStep]);

  // ── b-deselect: selection is empty ──────────────────────────────────────
  // Complete on transition (>0 → 0) OR when spotlight lands on this step with 0 selected
  useEffect(() => {
    if (!onboardingDismissed && selectedImageIds.length === 0 && onboardingSpotlight === 'b-deselect') {
      completeStep('b-deselect');
    }
  }, [selectedImageIds.length, onboardingSpotlight, onboardingDismissed, completeStep]);

  // ── b-dial-intro: radial dial opened (DOM detected) ────────────────────
  useEffect(() => {
    if (onboardingDismissed) return;
    const check = () => {
      if (document.querySelector('.radial-dial')) {
        completeStep('b-dial-intro');
      }
    };
    const t = setInterval(check, 200);
    return () => clearInterval(t);
  }, [onboardingDismissed, completeStep]);

  // ── b-gen-text / b-gen-ref: generation completes ───────────────────────
  useEffect(() => {
    if (onboardingDismissed) return;
    if (!wasGenerating.current && isGenerating) {
      selAtGenStart.current   = selCountRef.current;
      genCompletedRef.current = false;
    } else if (wasGenerating.current && !isGenerating && !genCompletedRef.current) {
      genCompletedRef.current = true;
      const nowCount = useAppStore.getState().images.length;
      if (nowCount > prevImageCount.current) {
        const stepId = selAtGenStart.current >= 1 ? 'b-gen-ref' : 'b-gen-text';
        completeStep(stepId);
      }
      prevImageCount.current = nowCount;
    }
    wasGenerating.current = isGenerating;
  }, [isGenerating, onboardingDismissed, completeStep]);

  // Track image count outside generation
  useEffect(() => {
    if (!isGenerating) prevImageCount.current = images.length;
  }, [images.length, isGenerating]);

  // ── d-ghosts: ghost node accepted or skipped (count decreased) ────────
  const prevGhostCount = useRef(ghostNodes.length);
  useEffect(() => {
    if (!onboardingDismissed && prevGhostCount.current > 0 && ghostNodes.length < prevGhostCount.current) {
      // User accepted or skipped a ghost — step complete
      completeStep('d-ghosts');
    }
    prevGhostCount.current = ghostNodes.length;
  }, [ghostNodes.length, onboardingDismissed, completeStep]);

  // ── c-isolate: isolation activated ──────────────────────────────────────
  // Complete on transition (null→non-null) OR when spotlight lands on step with isolation already active
  useEffect(() => {
    if (!onboardingDismissed) {
      if (isolatedImageIds !== null && (onboardingSpotlight === 'c-isolate' || prevIsolated.current === null)) {
        completeStep('c-isolate');
      }
      // c-unhide: isolation deactivated (back to normal canvas)
      // Complete on transition (non-null→null) OR when spotlight lands on step with isolation already off
      if (isolatedImageIds === null && (onboardingSpotlight === 'c-unhide' || prevIsolated.current !== null)) {
        completeStep('c-unhide');
      }
      prevIsolated.current = isolatedImageIds;
    }
  }, [isolatedImageIds, onboardingSpotlight, onboardingDismissed, completeStep]);

  // ── c-delete: image count decreased ────────────────────────────────────
  useEffect(() => {
    if (onboardingDismissed || isGenerating) return;
    const visCount = images.filter((i) => i.visible !== false).length;
    // Only detect deletion (not generation adding images)
    if (prevImageCount.current > 0 && visCount < prevImageCount.current && !isGenerating) {
      completeStep('c-delete');
    }
    if (!isGenerating) prevImageCount.current = visCount;
  }, [images, isGenerating, onboardingDismissed, completeStep]);

  // ── c-revert: shoe restored (deleted stack shrank) ─────────────────────
  const prevDeletedStackLen = useRef(deletedStack.length);
  useEffect(() => {
    if (!onboardingDismissed && prevDeletedStackLen.current > 0 && deletedStack.length < prevDeletedStackLen.current) {
      completeStep('c-revert');
    }
    prevDeletedStackLen.current = deletedStack.length;
  }, [deletedStack.length, onboardingDismissed, completeStep]);

  // ── d-explore: track insight count for d-ghosts step awareness ────────
  useEffect(() => {
    if (!onboardingDismissed && agentInsights.length > prevInsightCount.current) {
      prevInsightCount.current = agentInsights.length;
    }
  }, [agentInsights.length, onboardingDismissed]);

  useEffect(() => {
    prevInlineAxis.current = inlineAxisData;
  }, [inlineAxisData]);

  // ── b-axes / d-axes: axis labels changed (manual edit or AI suggest) ───
  useEffect(() => {
    if (!onboardingDismissed) {
      const nowAxes = JSON.stringify(axisLabels);
      if (prevAxes.current !== '{}' && nowAxes !== prevAxes.current) {
        completeStep('b-axes');
        completeStep('d-axes');
      }
      prevAxes.current = nowAxes;
    }
  }, [axisLabels, onboardingDismissed, completeStep]);

  // ── c-rate: any image rated ──────────────────────────────────────────────
  const prevRatingsStr = useRef(JSON.stringify(imageRatings));
  useEffect(() => {
    if (onboardingDismissed) return;
    const nowStr = JSON.stringify(imageRatings);
    if (nowStr !== prevRatingsStr.current) {
      const hasAnyRating = Object.values(imageRatings).some((v) => v > 0);
      if (hasAnyRating) completeStep('c-rate');
      prevRatingsStr.current = nowStr;
    }
  }, [imageRatings, onboardingDismissed, completeStep]);

  // ── c-star-filter: star filter activated ─────────────────────────────────
  // Complete on transition (null→non-null) OR when spotlight lands on step with filter already active
  const prevStarFilter = useRef(starFilter);
  useEffect(() => {
    if (!onboardingDismissed && starFilter !== null && (onboardingSpotlight === 'c-star-filter' || prevStarFilter.current === null)) {
      completeStep('c-star-filter');
    }
    prevStarFilter.current = starFilter;
  }, [starFilter, onboardingSpotlight, onboardingDismissed, completeStep]);
}
